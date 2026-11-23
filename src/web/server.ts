import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { join, resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Kernel } from '../core/kernel.js';
import { logger } from '../utils/logger.js';
import { listSessions, loadSessionMessages } from '../data/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.WEB_PORT || process.env.PORT || '3001');
const HOST = '127.0.0.1';

/** MIME type mapping for static assets */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serveStaticFile(filepath: string): Promise<{ body: string | Buffer; contentType: string; status: number }> {
  try {
    const content = await readFile(filepath);
    const ext = filepath.slice(filepath.lastIndexOf('.'));
    return { body: content, contentType: MIME_TYPES[ext] || 'application/octet-stream', status: 200 };
  } catch {
    return { body: 'Not found', contentType: 'text/plain', status: 404 };
  }
}

export async function createWebServer(kernel: Kernel): Promise<ReturnType<typeof createServer>> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host || '127.0.0.1:' + PORT}`);

    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // GET /api/sessions — list recent sessions
      if (url.pathname === '/api/sessions' && req.method === 'GET') {
        const sessions = await listSessions();
        respondJson(res, 200, sessions);
        return;
      }

      // GET /api/sessions/:id/messages — get messages for a session
      const sessionMsgMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (sessionMsgMatch && req.method === 'GET') {
        const sessionId = decodeURIComponent(sessionMsgMatch[1]);
        const messages = await loadSessionMessages(sessionId);
        respondJson(res, 200, messages);
        return;
      }

      // POST /api/submit — submit a message
      if (url.pathname === '/api/submit' && req.method === 'POST') {
        const body = await readBody(req);
        const payload = body as { sessionId?: string; message: string };
        if (!payload.message?.trim()) {
          respondJson(res, 400, { error: 'Message cannot be empty' });
          return;
        }
        try {
          const result = await kernel.execute(payload.message.trim(), payload.sessionId);
          respondJson(res, 200, {
            content: result.content,
            toolCalls: result.toolCalls,
            usage: result.usage,
            sessionId: payload.sessionId,
          });
        } catch (err) {
          respondJson(res, 500, { error: err instanceof Error ? err.message : 'Execution failed' });
        }
        return;
      }

      // POST /api/session/new — create a new session
      if (url.pathname === '/api/session/new' && req.method === 'POST') {
        const session = await kernel.createSession({ title: 'Web Session' });
        respondJson(res, 201, { id: session.id, title: 'New Session' });
        return;
      }

      // GET /api/status — server status and provider info
      if (url.pathname === '/api/status' && req.method === 'GET') {
        respondJson(res, 200, {
          provider: kernel.getProvider().name,
          model: kernel.getProvider().model,
        });
        return;
      }

      // Serve static files from public/ (parent of dist/)
      const publicDir = pathResolve(join(__dirname, '../..', 'public'));
      let filePath = pathResolve(join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
      const normalizedPath = filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
      const safePublicDir = publicDir.replace(/\\/g, '/').replace(/\/+/g, '/');

      if (!normalizedPath.startsWith(safePublicDir)) {
        respondJson(res, 403, { error: 'Forbidden' });
        return;
      }

      const staticResult = await serveStaticFile(normalizedPath);

      if (staticResult.status === 404 && url.pathname.startsWith('/api')) {
        respondJson(res, 404, { error: 'Not found' });
      } else if (staticResult.status === 404) {
        // SPA fallback: serve index.html for client-side routing
        const indexResult = await serveStaticFile(pathResolve(join(publicDir, 'index.html')));
        res.writeHead(indexResult.status, { 'Content-Type': indexResult.contentType });
        res.end(indexResult.body);
      } else {
        res.writeHead(staticResult.status, { 'Content-Type': staticResult.contentType });
        res.end(staticResult.body);
      }
    } catch (err) {
      respondJson(res, 500, { error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  return server;
}

function respondJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<any> {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    return {};
  }
}

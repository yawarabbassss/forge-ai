import * as readline from 'readline';
import { Kernel } from '../core/kernel.js';
import { logger } from '../utils/logger.js';
import type { AppConfig } from '../config.js';
import { listSessions, persistMessage } from '../data/db.js';
import { PluginLoader } from '../plugins/loader.js';
import { discoverPlugins } from '../plugins/discover.js';
import { resolve } from 'path';

interface CliOptions {
  config?: AppConfig;
  startWebServer?: boolean;
}

export async function runCli(kernel: Kernel, options: CliOptions = {}): Promise<void> {
  // Guard against non-interactive terminals (e.g. CI, pipes)
  if (!process.stdin.isTTY) {
    logger.info('Not running in an interactive terminal — CLI disabled. Process will stay alive for web server.');
    // Keep process alive: install a no-op interval so Node doesn't exit
    const noop = setInterval(() => {}, 60000);
    noop.unref();
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '>> ',
  });

  // Track current session and sessions list
  let currentSessionId: string | undefined;
  let sessions: Array<{ id: string; title?: string }> = [];
  let cancelled = false;
  const { config, startWebServer = true } = options;

  // Print banner
  console.log('\n  Forge AI Harness v0.1.0');
  console.log('  Type /help for commands, Ctrl+C to quit\n');

  // Show provider info
  if (config?.provider) {
    console.log(`  Provider: ${kernel.getProvider().name} | Model: ${kernel.getProvider().model}`);
  } else {
    console.log('  Provider: Echo (no API key configured)');
  }

  // Start web server if enabled
  if (startWebServer) {
    const { createWebServer } = await import('../web/server.js');
    const port = parseInt(process.env.WEB_PORT || process.env.PORT || '3001');
    const http = await import('http');
    const webServer = await createWebServer(kernel);
    webServer.listen(port, '127.0.0.1', () => {
      console.log(`  Web playground running at http://127.0.0.1:${port}`);
    });
    webServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`  Warning: Port ${port} already in use, web playground not started`);
      }
    });
  }
  console.log();

  // Restore last session from database on startup
  try {
    const recentSessions = await listSessions();
    if (recentSessions.length > 0) {
      const lastSession = recentSessions[0];
      const restored = await kernel.restoreSession(lastSession.id);
      if (restored) {
        currentSessionId = lastSession.id;
        sessions.push({ id: lastSession.id, title: lastSession.title });
        console.log(`Restored session: ${lastSession.id}${lastSession.title ? ` (${lastSession.title})` : ''}\n`);
      } else {
        sessions.push({ id: lastSession.id, title: lastSession.title });
        currentSessionId = lastSession.id;
        console.log(`Loaded empty session: ${lastSession.id}\n`);
      }
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Failed to restore session from database');
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    if (cancelled) {
      process.exit(0);
      return;
    }
    cancelled = true;
    console.log(`\n${signal} received. Finishing current operation...`);
    if (currentSessionId) {
      // Persist final state of session before exit
      const session = kernel.getSession(currentSessionId);
      if (session) {
        void session.persistToDb().catch((e: unknown) => logger.warn({ error: e instanceof Error ? e.message : String(e) }, 'Failed to persist session on exit'));
      }
      kernel.getPluginManager().list().forEach((p) => {
        const hooks = p.getHooks();
        const unmount = hooks.onUnmount;
        if (unmount && typeof unmount === 'function') {
          try {
            const result = unmount();
            if (result && typeof (result as any).then === 'function') {
              (result as Promise<void>).catch(() => {});
            }
          } catch {}
        }
      });
    }
    rl.close();
    setTimeout(() => process.exit(0), 500);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  const showPrompt = () => rl.prompt();

  const handleCommand = async (input: string): Promise<void> => {
    const parts = input.slice(1).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase() ?? '';
    const arg = parts.slice(1).join(' ').trim();

    switch (command) {
      case 'exit':
      case 'quit':
      case 'q':
        await shutdown('User');
        break;

      case 'help':
        console.log(getHelpText());
        showPrompt();
        break;

      case 'clear':
        if (currentSessionId) {
          const session = kernel.getSession(currentSessionId);
          if (session) {
            session.truncate(0);
            console.log('Conversation cleared.\n');
          }
        } else {
          console.log('No active session. Create one with /session new.\n');
        }
        showPrompt();
        break;

      case 'session':
        if (arg === 'new' || arg === 'n') {
          const s = await kernel.createSession({ title: 'New Session' });
          currentSessionId = s.id;
          sessions.push({ id: s.id, title: 'New Session' });
          console.log(`Created session: ${s.id}\n`);
          showPrompt();
        } else if (arg === 'list' || arg === 'l') {
          // Refresh sessions from DB
          try {
            const dbSessions = await listSessions();
            sessions = dbSessions.map(s => ({ id: s.id, title: s.title }));
          } catch {}
          if (sessions.length === 0) {
            console.log('No sessions yet. Run /session new to create one.\n');
          } else {
            console.log('Active sessions:');
            for (const sess of sessions) {
              const marker = sess.id === currentSessionId ? ' *(current)' : '';
              console.log(`  ${sess.id}${marker}${sess.title ? ` — ${sess.title}` : ''}`);
            }
            console.log();
          }
          showPrompt();
        } else if (arg.startsWith('switch ') || arg.startsWith('s ')) {
          const targetId = arg.replace(/^(switch|s)\s+/, '').trim();
          if (!targetId) {
            console.log('Usage: /session switch <id>\n');
          } else {
            const session = kernel.getSession(targetId);
            if (session) {
              currentSessionId = targetId;
              console.log(`Switched to session: ${targetId}\n`);
            } else {
              // Try restoring from DB
              const restored = await kernel.restoreSession(targetId);
              if (restored) {
                currentSessionId = targetId;
                sessions.push({ id: targetId, title: restored.metadata.title });
                console.log(`Restored and switched to session: ${targetId}\n`);
              } else {
                console.log(`Session '${targetId}' not found.\n`);
              }
            }
          }
          showPrompt();
        } else {
          console.log('Unknown session command. Use: /session new, /session list, /session switch <id>\n');
          showPrompt();
        }
        break;

      case 'plugin':
        if (arg === 'list' || arg === 'l' || arg === '') {
          const plugins = kernel.getPluginManager().list();
          if (plugins.length === 0) {
            console.log('No plugins loaded.\n');
          } else {
            console.log('Loaded plugins:');
            for (const p of plugins) {
              console.log(`  [${p.getId()}] ${p.getName()}`);
              for (const t of p.getTools()) {
                console.log(`    - ${t.name}: ${t.description}`);
              }
            }
            console.log();
          }
          showPrompt();
        } else if (arg === 'reload') {
          // Reload all plugins
          try {
            const searchPaths = [resolve(process.cwd(), 'plugins')].filter(Boolean);
            const discoveries = await discoverPlugins(searchPaths);
            const loader = new PluginLoader(kernel.getPluginManager(), kernel.getBus());
            const { loaded, failed } = await loader.loadAll(discoveries);
            console.log(`Reloaded plugins: ${loaded.length} loaded, ${failed.length} failed`);
            if (failed.length > 0) {
              console.log('Failed:', failed.map(f => f.id).join(', '));
            }
            console.log();
          } catch (err) {
            console.log(`Plugin reload failed: ${err instanceof Error ? err.message : String(err)}\n`);
          }
          showPrompt();
        } else {
          console.log('Unknown plugin command. Use: /plugin list, /plugin reload\n');
          showPrompt();
        }
        break;

      case 'status':
        console.log(`Current session: ${currentSessionId ?? '(none)'}`);
        console.log(`Provider: ${kernel.getProvider().name} | Model: ${kernel.getProvider().model}`);
        console.log(`Plugins loaded: ${kernel.getPluginManager().list().length}`);
        console.log(`Tools available: ${kernel.getPluginManager().getTools().length}`);
        if (config?.provider) {
          console.log(`API Key: ${config.provider.apiKey ? '[set]' : '[not set]'}`);
          console.log(`Base URL: ${config.provider.baseUrl}`);
        }
        console.log(`Web Playground: http://127.0.0.1:${process.env.WEB_PORT || process.env.PORT || '3001'}`);
        console.log();
        showPrompt();
        break;

      case 'provider':
        if (arg === 'show' || arg === 'list' || arg === '') {
          console.log(`Current provider: ${kernel.getProvider().name}`);
          console.log(`Model: ${kernel.getProvider().model}`);
          console.log('');
          console.log('Supported providers:');
          console.log('  openai   - OpenAI-compatible APIs (default)');
          console.log('  anthropic- Anthropic Claude');
          console.log('  local    - Local endpoints (Ollama, vLLM, etc.)');
          console.log('');
          console.log('Set provider via env var FORGE_PROVIDER=openai|anthropic|local');
          console.log('OpenAI:     OPENAI_API_KEY + optional OPENAI_BASE_URL');
          console.log('Anthropic:  ANTHROPIC_API_KEY + optional ANTHROPIC_BASE_URL');
          console.log('Local:      LOCAL_BASE_URL (e.g., http://localhost:11434/v1)');
          console.log();
        }
        showPrompt();
        break;

      case 'config':
        if (arg === 'show' || arg === '') {
          console.log('Forge Configuration:');
          console.log(`  Database:       ${config?.databasePath || 'forge.db'}`);
          console.log(`  Plugins dir:    ${config?.pluginsDir || './plugins'}`);
          console.log(`  Log level:      ${config?.logLevel || 'info'}`);
          console.log(`  Provider type:  ${config?.providerType || 'openai'}`);
          if (config?.provider) {
            console.log(`  Provider name:  ${kernel.getProvider().name}`);
            console.log(`  Model:          ${config.provider.model}`);
            console.log(`  Base URL:       ${config.provider.baseUrl}`);
            console.log(`  Temperature:    ${config.provider.temperature}`);
          } else {
            console.log('  API Key:        [not set]');
          }
          console.log();
        }
        showPrompt();
        break;

      default:
        console.log('Unknown command. Type /help for options.\n');
        showPrompt();
    }
  };

  const handleInput = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed || cancelled) return;

    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed);
      return;
    }

    // Normal chat message
    if (!currentSessionId) {
      const s = await kernel.createSession({ title: 'Chat Session' });
      currentSessionId = s.id;
      sessions.push({ id: s.id, title: 'Chat Session' });
    }

    // Persist user message
    try {
      await persistMessage(currentSessionId, 'user', trimmed);
    } catch {}

    try {
      const result = await kernel.execute(trimmed, currentSessionId);
      if (result.content) {
        console.log(result.content);
      }
      if (result.usage) {
        console.log(`\n[Tokens: ${result.usage.promptTokens}+${result.usage.completionTokens}=${result.usage.totalTokens}]\n`);
      } else {
        console.log();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`Error: ${msg}\n`);
    }

    showPrompt();
  };

  rl.on('line', handleInput);
  showPrompt();
}

function getHelpText(): string {
  return `
Forge CLI — Help
================

Commands (type at the ">>" prompt):

  <text>           Send a message to the agent
  /exit            Exit the CLI
  /quit            Same as /exit
  /help            Show this help text
  /clear           Clear the conversation history for the current session
  /session new     Create a new chat session
  /session list    List active sessions
  /session switch  <id>  Switch to another session
  /plugin list     Show loaded plugins and their tools
  /plugin reload   Reload all plugins from disk
  /status          Show current session and agent status
  /provider        Show current provider configuration
  /config          Show full configuration

Examples:
  >> Hello, forge!
  >> What can you do?
  /session list
  /plugin list
  /exit
`;
}

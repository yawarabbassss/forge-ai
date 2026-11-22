import { BaseProvider, ForgePromptMessage, ForgeResponse } from '../providers/base.js';
import { PluginManager } from './plugin-manager.js';
import { PolicyEngine } from './policy.js';
import { Session, SessionMetadata } from './session.js';
import { Agent } from './agent.js';
import { logger } from '../utils/logger.js';
import { ToolDefinition } from './tools.js';
import { EventBus } from '../events/bus.js';
import { persistSession, persistMessage } from '../data/db.js';

export class Kernel {
  private provider: BaseProvider;
  private pluginManager: PluginManager;
  private policyEngine: PolicyEngine;
  private bus: EventBus;
  private sessions: Map<string, Session> = new Map();

  constructor(
    provider: BaseProvider,
    options?: {
      pluginManager?: PluginManager;
      policyEngine?: PolicyEngine;
      bus?: EventBus;
    },
  ) {
    this.provider = provider;
    this.pluginManager = options?.pluginManager || new PluginManager(new PolicyEngine());
    this.policyEngine = options?.policyEngine || new PolicyEngine();
    this.bus = options?.bus || new EventBus();
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  async createSession(metadata?: SessionMetadata): Promise<Session> {
    const sessionId = crypto.randomUUID();
    const session = new Session(sessionId, [], metadata);
    this.sessions.set(sessionId, session);
    // Persist session if DB is available
    try { await persistSession(sessionId, metadata?.title); } catch {}
    await this.bus.emit('session:create', { sessionId, title: metadata?.title });
    logger.info({ id: sessionId }, 'Session created');
    return session;
  }

  deleteSession(id: string): boolean {
    if (!this.sessions.has(id)) {
      return false;
    }
    this.sessions.delete(id);
    logger.info({ id }, 'Session deleted');
    return true;
  }

  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  getBus(): EventBus {
    return this.bus;
  }

  /** Expose a hook so callers can attach event listeners before running. */
  on(event: string, handler: (payload: unknown) => void | Promise<void>): () => void {
    return this.bus.on(event, handler);
  }

  async execute(prompt: string, sessionId?: string): Promise<ForgeResponse> {
    let session: Session;
    if (sessionId) {
      const existingSession = this.getSession(sessionId);
      if (!existingSession) {
        throw new Error(`Session '${sessionId}' not found`);
      }
      session = existingSession;
    } else {
      session = await this.createSession();
    }

    const toolsMap = this.pluginManager.getTools();

    const agent = new Agent(
      this.provider,
      this.policyEngine,
      this.pluginManager,
      session,
    );

    // Wire agent lifecycle events through the bus
    await this.bus.emit('agent:start', { sessionId: session.id, prompt });

    try {
      const result = await agent.execute(prompt);

      // Persist final response if DB is available
      try {
        if (result.content) {
          await persistMessage(session.id, 'assistant', result.content);
        }
      } catch {}

      await this.bus.emit('llm:response', {
        sessionId: session.id,
        hasToolCalls: !!(result.toolCalls && result.toolCalls.length > 0),
        contentLength: result.content?.length ?? 0,
      });

      logger.debug({ session: session.id, result }, 'Execution completed');
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.bus.emit('error', { sessionId: session.id, error: errorMessage });
      throw error;
    }
  }
}
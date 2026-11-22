import { logger } from '../utils/logger.js';
import { EventHandler, EventListener } from './types.js';

const LOG_LEVELS: Record<string, string> = {
  'agent:start': 'info',
  'llm:request': 'debug',
  'llm:response': 'debug',
  'tool:call': 'debug',
  'tool:result': 'debug',
  'session:create': 'info',
  'error': 'error',
  'plugin:load': 'info',
  'plugin:unload': 'info',
};

export class EventBus {
  private listeners: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): () => void {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);

    // Return unsubscribe function
    return () => {
      const current = this.listeners.get(event) ?? [];
      this.listeners.set(
        event,
        current.filter((h) => h !== handler),
      );
    };
  }

  off(event: string, handler: EventHandler): void {
    const current = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      current.filter((h) => h !== handler),
    );
  }

  async emit(event: string, payload?: unknown): Promise<void> {
    const handlers = this.listeners.get(event) ?? [];
    const logLevel = LOG_LEVELS[event] ?? 'debug';

    if (handlers.length > 0 && logLevel === 'info') {
      logger.info({ event, ...(payload as Record<string, unknown> ?? {}) }, `Forge: ${event}`);
    } else if (handlers.length > 0) {
      logger.debug({ event, ...(payload as Record<string, unknown> ?? {}) }, `Forge: ${event}`);
    }

    await Promise.all(handlers.map(async (h) => {
      try {
        await h(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ event, handlerError: msg }, `Event handler error: ${event}`);
      }
    }));
  }

  listenerCount(event: string): number {
    return (this.listeners.get(event) ?? []).length;
  }

  clear(): void {
    this.listeners.clear();
  }
}

import { ForgePromptMessage } from '../providers/base.js';
import { z } from 'zod';
import { loadSessionMessages, persistSession } from '../data/db.js';
import { logger } from '../utils/logger.js';

export const SessionMetadataSchema = z.object({
  title: z.string().optional(),
  userId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

export class Session {
  id: string;
  messages: ForgePromptMessage[];
  metadata: SessionMetadata;
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string, messages: ForgePromptMessage[] = [], metadata?: SessionMetadata) {
    this.id = id;
    this.messages = messages;
    this.metadata = SessionMetadataSchema.parse(metadata || {});
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  addMessage(message: ForgePromptMessage): void {
    this.messages.push(message);
    this.updatedAt = new Date();
  }

  truncate(startIndex: number): void {
    this.messages = this.messages.slice(startIndex);
    this.updatedAt = new Date();
  }

  trimTokens(maxTokens: number): void {
    let currentTokens = this.messages.reduce((sum, msg) => sum + msg.content.length, 0);

    while (currentTokens > maxTokens && this.messages.length > 1) {
      const removed = this.messages.shift();
      if (removed) {
        currentTokens -= removed.content.length;
      }
    }

    this.updatedAt = new Date();
  }

  /** Restore a session from database, replacing in-memory messages with persisted ones. */
  static async restoreFromDb(sessionId: string): Promise<Session | null> {
    try {
      const messages = await loadSessionMessages(sessionId);
      if (messages.length === 0) {
        logger.debug({ sessionId }, 'No persisted messages found for session');
        return null;
      }

      const restored: ForgePromptMessage[] = messages.map(m => ({
        role: m.role as ForgePromptMessage['role'],
        content: m.content ?? '',
        ...(typeof m.metadata?.name === 'string' ? { name: m.metadata.name } : {}),
        ...(typeof m.metadata?.toolCallId === 'string' ? { toolCallId: m.metadata.toolCallId } : {}),
      }));

      const session = new Session(sessionId, restored);
      session.updatedAt = new Date();
      logger.info({ sessionId, messageCount: restored.length }, 'Session restored from database');
      return session;
    } catch (err) {
      logger.warn(
        { sessionId, error: err instanceof Error ? err.message : String(err) },
        'Failed to restore session from database',
      );
      return null;
    }
  }

  /** Persist current messages back to the database. */
  async persistToDb(): Promise<void> {
    try {
      await persistSession(this.id, this.metadata.title);
      for (const msg of this.messages) {
        await import('../data/db.js').then(({ persistMessage }) =>
          persistMessage(this.id, msg.role, msg.content, msg.name ? { name: msg.name } : undefined),
        );
      }
    } catch (err) {
      logger.warn(
        { sessionId: this.id, error: err instanceof Error ? err.message : String(err) },
        'Failed to persist session to database',
      );
    }
  }
}

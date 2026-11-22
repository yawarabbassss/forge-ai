import { ForgePromptMessage } from '../providers/base.js';
import { z } from 'zod';

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
}
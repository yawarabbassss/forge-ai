import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().optional(),
  timeoutMs: z.number().positive().default(60000),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface FunctionToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ForgePromptMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ForgeToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ForgeRequest {
  messages: ForgePromptMessage[];
  tools?: FunctionToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface ForgeUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ForgeResponse {
  content: string | null;
  toolCalls?: ForgeToolCall[];
  usage?: ForgeUsage;
  raw?: any;
}

export interface BaseProvider {
  readonly name: string;
  completion(request: ForgeRequest): Promise<ForgeResponse>;
}

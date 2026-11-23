export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

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
  readonly model: string;
  completion(request: ForgeRequest): Promise<ForgeResponse>;
}

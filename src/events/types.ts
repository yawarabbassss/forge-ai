export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export interface EventListener {
  event: string;
  handler: EventHandler;
}

export interface AgentStartEvent {
  sessionId: string;
  prompt: string;
}

export interface LlmRequestEvent {
  sessionId: string;
  messageCount: number;
  toolCount: number;
}

export interface LlmResponseEvent {
  sessionId: string;
  hasToolCalls: boolean;
  contentLength: number;
}

export interface ToolCallEvent {
  sessionId: string;
  toolName: string;
  pluginId: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent {
  sessionId: string;
  toolName: string;
  success: boolean;
  error?: string;
}

export interface SessionCreateEvent {
  sessionId: string;
  title?: string;
}

export interface AgentErrorEvent {
  sessionId: string;
  error: string;
}

export interface PluginLoadEvent {
  pluginId: string;
  name: string;
}

export interface PluginUnloadEvent {
  pluginId: string;
}

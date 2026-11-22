import { BaseProvider, ForgeRequest, ForgeResponse, ForgeToolCall } from '../providers/base.js';
import { ToolDefinition } from './tools.js';
import { PolicyEngine } from './policy.js';
import { Session } from './session.js';
import { PluginManager } from './plugin-manager.js';
import { EventBus } from '../events/bus.js';
import { logger } from '../utils/logger.js';

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOOL_CALLS_PER_TURN = 5;

export type AgentState = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error' | 'cancelled';

export class Agent {
  private provider: BaseProvider;
  private policyEngine: PolicyEngine;
  private pluginManager: PluginManager;
  private session: Session;
  private bus: EventBus;
  private maxIterations: number;
  private timeoutMs: number;
  private state: AgentState;
  private cancelled: boolean;

  constructor(
    provider: BaseProvider,
    policyEngine: PolicyEngine,
    pluginManager: PluginManager,
    session: Session,
    options?: { maxIterations?: number; timeoutMs?: number; bus?: EventBus },
  ) {
    this.provider = provider;
    this.policyEngine = policyEngine;
    this.pluginManager = pluginManager;
    this.session = session;
    this.bus = options?.bus || new EventBus();
    this.maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.state = 'idle';
    this.cancelled = false;
  }

  getTools(): ToolDefinition[] {
    return this.pluginManager.getTools();
  }

  cancel(): void {
    this.cancelled = true;
    this.state = 'cancelled';
    logger.info('Agent execution cancelled');
  }

  getState(): AgentState {
    return this.state;
  }

  async execute(prompt: string): Promise<ForgeResponse> {
    if (this.state === 'thinking' || this.state === 'executing') {
      throw new Error('Agent is already busy');
    }

    // Only reset cancelled if not already set, so a pre-cancelled agent
    // (e.g. cancelled before execute() is called) retains its state.
    if (!this.cancelled) {
      this.cancelled = false;
    }
    this.state = 'thinking';

    const messages = [...this.session.messages];
    messages.push({ role: 'user', content: prompt });

    let lastResponse: ForgeResponse | null = null;

    try {
      for (let i = 0; i < this.maxIterations && !this.cancelled; i++) {
        await this.bus.emit('llm:request', {
          sessionId: this.session.id,
          messageCount: messages.length,
          toolCount: this.pluginManager.getTools().length,
        });

        lastResponse = await this.callLLM(messages);
        this.state = 'thinking';

        if (!lastResponse) {
          break;
        }

        // Final response: has content and no tool calls
        if (lastResponse.content && (!lastResponse.toolCalls || lastResponse.toolCalls.length === 0)) {
          messages.push({ role: 'assistant', content: lastResponse.content });
          break;
        }

        // Execute tool calls
        if (lastResponse.toolCalls && lastResponse.toolCalls.length > 0) {
          await this.bus.emit('tool:call', {
            sessionId: this.session.id,
            toolCount: lastResponse.toolCalls.length,
          });

          const results = await this.executeToolCalls(lastResponse.toolCalls);

          messages.push({
            role: 'assistant',
            content: '',
            name: JSON.stringify({ toolCalls: lastResponse.toolCalls }),
          });

          for (let j = 0; j < results.length; j++) {
            messages.push({
              role: 'tool',
              content: JSON.stringify(results[j].result ?? results[j].error),
              toolCallId: lastResponse.toolCalls[j].id,
            });
          }

          if (results.some((r) => r.error)) {
            logger.warn('Some tool calls failed');
          }
        } else {
          // No content and no tool calls - treat as final response
          messages.push({ role: 'assistant', content: '' });
          break;
        }
      }

      this.state = this.cancelled ? 'cancelled' : 'idle';
      return lastResponse!;
    } catch (error: unknown) {
      this.state = this.cancelled ? 'cancelled' : 'error';
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error during agent execution');
      throw error;
    }
  }

  private async callLLM(messages: Array<{ role: string; content: string; name?: string; toolCallId?: string }>): Promise<ForgeResponse> {
    const request: ForgeRequest = {
      messages: messages.map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
        content: msg.content,
        ...(msg.name ? { name: msg.name } : {}),
        ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
      })),
      tools: this.pluginManager.getTools().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    };

    try {
      return await this.provider.completion(request);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'LLM completion failed');
      throw new Error(`LLM request failed: ${errorMessage}`);
    }
  }

  private async executeToolCalls(toolCalls: ForgeToolCall[]): Promise<Array<{ id: string; result?: any; error?: string }>> {
    const results: Array<{ id: string; result?: any; error?: string }> = [];

    for (const tc of toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN)) {
      if (this.cancelled) {
        logger.info('Execution cancelled during tool calls');
        break;
      }

      const toolDef = this.pluginManager.getTools().find(t => t.name === tc.name);
      if (!toolDef) {
        logger.warn({ tool: tc.name }, 'Tool not found');
        results.push({ id: tc.id, error: `Tool '${tc.name}' not found` });
        continue;
      }

      // Get the plugin ID for this tool and construct the full registry key
      const pluginId = this.pluginManager.getToolPluginId(tc.name);
      const toolRegistryKey = pluginId ? `${pluginId}:${tc.name}` : tc.name;

      // Check permissions using the plugin manager's tool permissions
      const permissions = this.pluginManager.getToolPermissions(tc.name);
      if (permissions) {
        // Collect all declared permissions for this tool's plugin
        const allPerms = [
          ...(permissions.fs || []),
          ...(permissions.net || []),
          ...(permissions.network || []),
          ...(permissions.inference || []),
          ...(Object.values(permissions.other || {}).flat() || []),
        ];

        // If the plugin declares any permissions, enforce them
        if (allPerms.length > 0) {
          const permissionCheck = this.policyEngine.checkPermissions(toolRegistryKey, allPerms);
          if (!permissionCheck.allowed) {
            logger.warn({ tool: tc.name, reason: permissionCheck.reason }, 'Permission check failed');
            results.push({ id: tc.id, error: `Permission denied: ${permissionCheck.reason}` });
            continue;
          }
        }
      }

      try {
        const result = await this.executeTool(tc.name, tc.arguments);
        await this.bus.emit('tool:result', {
          sessionId: this.session.id,
          toolName: tc.name,
          success: true,
        });
        results.push({ id: tc.id, result });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ tool: tc.name, error: errorMessage }, 'Tool execution failed');
        await this.bus.emit('tool:result', {
          sessionId: this.session.id,
          toolName: tc.name,
          success: false,
          error: errorMessage,
        });
        results.push({ id: tc.id, error: errorMessage });
      }
    }

    return results;
  }

  private async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const pluginId = this.pluginManager.getToolPluginId(name);
    if (!pluginId) {
      throw new Error(`No plugin registered for tool '${name}'`);
    }

    try {
      const result = await this.pluginManager.executePlugin(pluginId, 'execute', { tool: name, args });
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ tool: name, plugin: pluginId, error: errorMessage }, 'Plugin tool execution failed');
      throw new Error(`Tool execution failed: ${errorMessage}`);
    }
  }
}
import { z } from 'zod';
import { BaseProvider, ProviderConfig, ForgeRequest, ForgeResponse } from './base.js';
import { logger } from '../utils/logger.js';

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.string().default('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

export class OpenAICompatibleProvider implements BaseProvider {
  public readonly name: string;
  public readonly model: string;
  private config: ProviderConfig;

  constructor(name = 'OpenAI-Compatible', config: ProviderConfig) {
    this.name = name;
    this.model = config.model;
    this.config = config;
  }

  async completion(request: ForgeRequest): Promise<ForgeResponse> {
    const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const payload: Record<string, any> = {
      model: this.config.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        ...(msg.name ? { name: msg.name } : {}),
        ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
      })),
      temperature: request.temperature ?? this.config.temperature,
    };

    if (request.maxTokens || this.config.maxTokens) {
      payload.max_tokens = request.maxTokens ?? this.config.maxTokens;
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    logger.debug(
      { provider: this.name, model: this.config.model, url },
      'Sending LLM completion request',
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: this.config.timeoutMs ? AbortSignal.timeout(this.config.timeoutMs) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          { provider: this.name, status: response.status },
          'LLM Provider Request Failed',
        );
        throw new Error(
          `Provider ${this.name} request failed with status ${response.status}: ${errorText}`,
        );
      }

      const data = await response.json();
      return this.normalizeResponse(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ provider: this.name, error: message }, 'Error in provider completion');
      throw err;
    }
  }

  protected normalizeResponse(data: unknown): ForgeResponse {
    const choices = Array.isArray(data)
      ? []
      : ((data as any)?.choices || []);
    const choice = choices[0] || {};
    const message = choice.message || {};

    const rawToolCalls = message.tool_calls || [];
    const toolCalls: ForgeResponse['toolCalls'] = rawToolCalls.length > 0
      ? rawToolCalls.map((tc: any) => {
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            parsedArgs = {};
          }
          return {
            id: tc.id,
            name: tc.function?.name,
            arguments: parsedArgs,
          };
        })
      : undefined;

    const usage = (data as any)?.usage
      ? {
          promptTokens: (data as any).usage.prompt_tokens || 0,
          completionTokens: (data as any).usage.completion_tokens || 0,
          totalTokens: (data as any).usage.total_tokens || 0,
        }
      : undefined;

    return {
      content: message.content || null,
      toolCalls,
      usage,
      raw: data,
    };
  }
}

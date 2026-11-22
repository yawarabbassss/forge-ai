import { BaseProvider, ForgeRequest, ForgeResponse, ProviderConfig, ProviderConfigSchema } from './base.js';
import { logger } from '../utils/logger.js';

export class OpenAICompatibleProvider implements BaseProvider {
  public readonly name: string;
  protected config: ProviderConfig;

  constructor(name = 'OpenAI-Compatible', config: ProviderConfig) {
    this.name = name;
    this.config = ProviderConfigSchema.parse(config);
  }

  async completion(request: ForgeRequest): Promise<ForgeResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

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

    logger.debug({ provider: this.name, model: this.config.model, url }, 'Sending LLM completion request');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ provider: this.name, status: response.status, errorText }, 'LLM Provider Request Failed');
        throw new Error(`Provider ${this.name} request failed with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return this.normalizeResponse(data);
    } catch (err: any) {
      logger.error({ provider: this.name, error: err.message }, 'Error in provider completion');
      throw err;
    }
  }

  protected normalizeResponse(data: any): ForgeResponse {
    const choice = data.choices?.[0];
    const message = choice?.message || {};

    const toolCalls = message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }));

    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
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

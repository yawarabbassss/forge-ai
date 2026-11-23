import { BaseProvider, ProviderConfig, ForgeRequest, ForgeResponse } from './base.js';
import { logger } from '../utils/logger.js';

export class AnthropicProvider implements BaseProvider {
  public readonly name = 'Anthropic';
  public readonly model: string;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.model = config.model;
    this.config = config;
  }

  async completion(request: ForgeRequest): Promise<ForgeResponse> {
    const baseUrl = (this.config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const url = `${baseUrl}/v1/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };

    if (this.config.apiKey) {
      headers['x-api-key'] = this.config.apiKey;
    }

    // Extract system message if present
    const systemMessage = request.messages.find((m) => m.role === 'system')?.content;
    const userMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'tool' ? 'user' : msg.role,
        content: msg.content,
      }));

    const payload: Record<string, any> = {
      model: this.config.model,
      messages: userMessages,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 1024,
      temperature: request.temperature ?? this.config.temperature,
    };

    if (systemMessage) {
      payload.system = systemMessage;
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    logger.debug(
      { provider: this.name, model: this.config.model, url },
      'Sending Anthropic API request',
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
          'Anthropic Request Failed',
        );
        throw new Error(
          `Anthropic request failed with status ${response.status}: ${errorText}`,
        );
      }

      const data = await response.json();
      return this.normalizeResponse(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ provider: this.name, error: message }, 'Error in Anthropic completion');
      throw err;
    }
  }

  private normalizeResponse(data: unknown): ForgeResponse {
    let content: string | null = null;
    const toolCalls: ForgeResponse['toolCalls'] = [];

    if (data && typeof data === 'object') {
      const d = data as Record<string, any>;
      if (Array.isArray(d.content)) {
        for (const block of d.content) {
          if (block.type === 'text') {
            content = (content || '') + (block.text || '');
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              arguments: block.input || {},
            });
          }
        }
      }
    }

    const usage = data && typeof data === 'object'
      ? (() => {
          const d = data as Record<string, any>;
          return d.usage
            ? {
                promptTokens: d.usage.input_tokens || 0,
                completionTokens: d.usage.output_tokens || 0,
                totalTokens: (d.usage.input_tokens || 0) + (d.usage.output_tokens || 0),
              }
            : undefined;
        })()
      : undefined;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      raw: data,
    };
  }
}

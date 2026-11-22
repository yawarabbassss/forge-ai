import { BaseProvider, ForgeRequest, ForgeResponse, ProviderConfig, ProviderConfigSchema } from './base.js';
import { logger } from '../utils/logger.js';

export class AnthropicProvider implements BaseProvider {
  public readonly name = 'Anthropic';
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = ProviderConfigSchema.parse(config);
  }

  async completion(request: ForgeRequest): Promise<ForgeResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1';
    const url = `${baseUrl.replace(/\/+$/, '')}/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };

    if (this.config.apiKey) {
      headers['x-api-key'] = this.config.apiKey;
    }

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

    logger.debug({ provider: this.name, model: this.config.model, url }, 'Sending Anthropic API request');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ provider: this.name, status: response.status, errorText }, 'Anthropic Request Failed');
        throw new Error(`Anthropic request failed with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return this.normalizeResponse(data);
    } catch (err: any) {
      logger.error({ provider: this.name, error: err.message }, 'Error in Anthropic completion');
      throw err;
    }
  }

  private normalizeResponse(data: any): ForgeResponse {
    let content: string | null = null;
    const toolCalls: any[] = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          content = (content || '') + block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input || {},
          });
        }
      }
    }

    const usage = data.usage
      ? {
          promptTokens: data.usage.input_tokens || 0,
          completionTokens: data.usage.output_tokens || 0,
          totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
        }
      : undefined;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      raw: data,
    };
  }
}

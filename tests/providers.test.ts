import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from '../src/providers/openai.js';
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { LocalLLMProvider } from '../src/providers/local.js';

describe('Providers', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('OpenAICompatibleProvider', () => {
    it('should correctly format and send request, and normalize response', async () => {
      const mockResponseBody = {
        id: 'chatcmpl-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello world!',
              tool_calls: [
                {
                  id: 'call_abc123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "Tokyo"}',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponseBody,
      } as Response);

      const provider = new OpenAICompatibleProvider('TestOpenAI', {
        apiKey: 'test-key',
        model: 'gpt-4o',
      });

      const response = await provider.completion({
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for location',
            parameters: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
      });

      expect(response.content).toBe('Hello world!');
      expect(response.toolCalls).toEqual([
        {
          id: 'call_abc123',
          name: 'get_weather',
          arguments: { location: 'Tokyo' },
        },
      ]);
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should throw error when API returns non-200 status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response);

      const provider = new OpenAICompatibleProvider('TestOpenAI', {
        apiKey: 'invalid-key',
        model: 'gpt-4o',
      });

      await expect(
        provider.completion({
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('Provider TestOpenAI request failed with status 401: Unauthorized');
    });
  });

  describe('AnthropicProvider', () => {
    it('should format request and normalize text/tool output', async () => {
      const mockResponseBody = {
        id: 'msg_123',
        content: [
          { type: 'text', text: 'Sure, here is your answer.' },
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'calculator',
            input: { expression: '2+2' },
          },
        ],
        usage: {
          input_tokens: 15,
          output_tokens: 25,
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponseBody,
      } as Response);

      const provider = new AnthropicProvider({
        apiKey: 'anthropic-key',
        model: 'claude-3-5-sonnet-20241022',
      });

      const response = await provider.completion({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Calculate 2+2' },
        ],
      });

      expect(response.content).toBe('Sure, here is your answer.');
      expect(response.toolCalls).toEqual([
        {
          id: 'toolu_01',
          name: 'calculator',
          arguments: { expression: '2+2' },
        },
      ]);
      expect(response.usage).toEqual({
        promptTokens: 15,
        completionTokens: 25,
        totalTokens: 40,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'anthropic-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });
  });

  describe('LocalLLMProvider', () => {
    it('should default to local endpoint', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Local response' } }] }),
      } as Response);

      const provider = new LocalLLMProvider({
        model: 'llama3',
      });

      const response = await provider.completion({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.content).toBe('Local response');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.anything()
      );
    });
  });
});

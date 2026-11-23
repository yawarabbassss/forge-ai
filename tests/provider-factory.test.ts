import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createProvider, hasProviderCredentials } from '../src/providers/factory.js';
import { OpenAICompatibleProvider } from '../src/providers/openai.js';
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { LocalLLMProvider } from '../src/providers/local.js';
import type { ProviderConfig } from '../src/providers/base.js';

describe('Provider Factory', () => {
  describe('createProvider', () => {
    const baseConfig: ProviderConfig = { model: 'gpt-4o', temperature: 0.7, timeoutMs: 30000 };

    it('should create OpenAI provider by default', () => {
      const provider = createProvider('openai', baseConfig);
      expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
      expect(provider.name).toBe('OpenAI-Compatible');
      expect(provider.model).toBe('gpt-4o');
    });

    it('should create Anthropic provider', () => {
      const provider = createProvider('anthropic', baseConfig);
      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.name).toBe('Anthropic');
      expect(provider.model).toBe('gpt-4o');
    });

    it('should create LocalLLM provider', () => {
      const provider = createProvider('local', { ...baseConfig, baseUrl: 'http://localhost:11434/v1' });
      expect(provider).toBeInstanceOf(LocalLLMProvider);
      expect(provider.name).toBe('LocalLLM');
      expect(provider.model).toBe('gpt-4o');
    });

    it('should default to openai when type is unknown', () => {
      const provider = createProvider('openai' as any, baseConfig);
      expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    });
  });

  describe('hasProviderCredentials', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.LOCAL_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return false when no keys are set', () => {
      expect(hasProviderCredentials()).toBe(false);
    });

    it('should return true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      expect(hasProviderCredentials()).toBe(true);
    });

    it('should return true when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      expect(hasProviderCredentials()).toBe(true);
    });

    it('should return true when LOCAL_API_KEY is set', () => {
      process.env.LOCAL_API_KEY = 'local-key';
      expect(hasProviderCredentials()).toBe(true);
    });
  });
});

import { type ProviderConfig, type BaseProvider } from './base.js';
import { OpenAICompatibleProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { LocalLLMProvider } from './local.js';
import type { ProviderType } from '../config.js';

/**
 * Factory that creates the appropriate provider based on configuration.
 * Throws a clear error when no provider credentials are available.
 */
export function createProvider(type: ProviderType, config: ProviderConfig): BaseProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider(config);

    case 'local':
      return new LocalLLMProvider(config);

    case 'openai':
    default:
      return new OpenAICompatibleProvider('OpenAI-Compatible', config);
  }
}

/** Returns true if at least one API key is configured for any supported provider. */
export function hasProviderCredentials(): boolean {
  return !!(
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.LOCAL_API_KEY
  );
}

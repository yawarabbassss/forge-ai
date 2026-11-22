import { OpenAICompatibleProvider } from './openai.js';
import { ProviderConfig } from './base.js';

export class LocalLLMProvider extends OpenAICompatibleProvider {
  constructor(config: Omit<ProviderConfig, 'baseUrl'> & { baseUrl?: string }) {
    super('LocalLLM', {
      baseUrl: config.baseUrl || 'http://localhost:11434/v1', // Defaults to local Ollama OpenAI compatible endpoint
      ...config,
    });
  }
}

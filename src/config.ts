import { z } from 'zod';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

dotenv.config();

const ProviderConfigSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().optional(),
  timeoutMs: z.number().positive().default(60_000),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Supported provider types
export type ProviderType = 'openai' | 'anthropic' | 'local';

export interface AppConfig {
  provider?: ProviderConfig;
  providerType?: ProviderType;
  pluginsDir: string;
  databasePath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Max message tokens before trimming (0 = unlimited) */
  maxTokens?: number;
}

/** Determine provider type from environment or return default. */
function detectProviderType(): ProviderType {
  const type = (process.env.FORGE_PROVIDER || '').toLowerCase();
  if (type === 'anthropic') return 'anthropic';
  if (type === 'local') return 'local';
  return 'openai'; // default
}

export function loadConfig(): AppConfig {
  const configPath = process.env.FORGE_CONFIG || resolve(process.cwd(), 'forge.config.json');

  let config: Partial<AppConfig> = {};
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = raw;
    } catch (err) {
      console.warn(`Warning: Failed to parse config file ${configPath}`);
    }
  }

  const providerType = process.env.FORGE_PROVIDER
    ? (process.env.FORGE_PROVIDER.toLowerCase() as ProviderType)
    : (config.providerType || detectProviderType());

  // Build provider config from env vars with sensible defaults per provider
  const providerConfig = buildProviderConfig(providerType, config);

  return {
    provider: providerConfig,
    providerType,
    pluginsDir: (process.env.FORGE_PLUGINS_DIR ?? config.pluginsDir) || './plugins',
    databasePath: (process.env.DATABASE_PATH ?? config.databasePath) || 'forge.db',
    logLevel: ((process.env.LOG_LEVEL as AppConfig['logLevel']) ?? config.logLevel) || 'info',
    maxTokens: config.maxTokens ?? undefined,
  };
}

function buildProviderConfig(type: ProviderType, config: Partial<AppConfig>): ProviderConfig | undefined {
  switch (type) {
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY || config.provider?.apiKey;
      if (!key) return undefined;
      const parsed = ProviderConfigSchema.safeParse({
        apiKey: key,
        baseUrl: process.env.ANTHROPIC_BASE_URL || config.provider?.baseUrl || 'https://api.anthropic.com/v1',
        model: process.env.ANTHROPIC_MODEL || config.provider?.model || 'claude-3-haiku-20240307',
        temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || String(config.provider?.temperature ?? 0.7)),
        maxTokens: process.env.ANTHROPIC_MAX_TOKENS ? parseInt(process.env.ANTHROPIC_MAX_TOKENS) : config.provider?.maxTokens,
        timeoutMs: parseInt(process.env.ANTHROPIC_TIMEOUT_MS || String(config.provider?.timeoutMs ?? 60000)),
      });
      if (!parsed.success) throw new Error(`Invalid Anthropic configuration: ${parsed.error.message}`);
      return parsed.data;
    }

    case 'local': {
      const key = process.env.LOCAL_API_KEY || process.env.OPENAI_API_KEY || config.provider?.apiKey;
      const parsed = ProviderConfigSchema.safeParse({
        apiKey: key || undefined, // local models often don't need keys
        baseUrl: process.env.LOCAL_BASE_URL || process.env.OPENAI_BASE_URL || config.provider?.baseUrl || 'http://localhost:11434/v1',
        model: process.env.LOCAL_MODEL || process.env.OPENAI_MODEL || config.provider?.model || 'llama3',
        temperature: parseFloat(process.env.LOCAL_TEMPERATURE || process.env.OPENAI_TEMPERATURE || String(config.provider?.temperature ?? 0.7)),
        maxTokens: process.env.LOCAL_MAX_TOKENS ? parseInt(process.env.LOCAL_MAX_TOKENS) : config.provider?.maxTokens,
        timeoutMs: parseInt(process.env.LOCAL_TIMEOUT_MS || String(config.provider?.timeoutMs ?? 60000)),
      });
      if (!parsed.success) throw new Error(`Invalid local provider configuration: ${parsed.error.message}`);
      return parsed.data;
    }

    case 'openai':
    default: {
      const key = process.env.OPENAI_API_KEY || config.provider?.apiKey;
      if (!key) return undefined;
      const parsed = ProviderConfigSchema.safeParse({
        apiKey: key,
        baseUrl: process.env.OPENAI_BASE_URL || config.provider?.baseUrl || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || config.provider?.model || 'gpt-4o-mini',
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || String(config.provider?.temperature ?? 0.7)),
        maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : config.provider?.maxTokens,
        timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || String(config.provider?.timeoutMs ?? 60000)),
      });
      if (!parsed.success) throw new Error(`Invalid OpenAI configuration: ${parsed.error.message}`);
      return parsed.data;
    }
  }
}

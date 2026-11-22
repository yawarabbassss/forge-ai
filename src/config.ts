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

export interface AppConfig {
  provider?: ProviderConfig;
  pluginsDir: string;
  databasePath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
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

  // Merge with environment variables (env takes precedence)
  const merged: Partial<AppConfig> = {
    ...config,
    databasePath: process.env.DATABASE_PATH ?? config.databasePath,
    logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel']) ?? config.logLevel,
    pluginsDir: process.env.FORGE_PLUGINS_DIR ?? config.pluginsDir,
  };

  // Parse provider config if available
  if (process.env.OPENAI_API_KEY || config.provider?.apiKey) {
    const providerConfig = ProviderConfigSchema.safeParse({
      apiKey: process.env.OPENAI_API_KEY || config.provider?.apiKey,
      baseUrl: process.env.OPENAI_BASE_URL || config.provider?.baseUrl || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || config.provider?.model || 'gpt-4o-mini',
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || String(config.provider?.temperature ?? 0.7)),
      maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : config.provider?.maxTokens,
      timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || String(config.provider?.timeoutMs ?? 60000)),
    });

    if (!providerConfig.success) {
      throw new Error(`Invalid provider configuration: ${providerConfig.error.message}`);
    }

    merged.provider = providerConfig.data;
  }

  return {
    provider: merged.provider,
    pluginsDir: merged.pluginsDir || './plugins',
    databasePath: merged.databasePath || 'forge.db',
    logLevel: merged.logLevel || 'info',
  };
}

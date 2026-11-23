import { logger } from './utils/logger.js';
import { initDb, listSessions } from './data/db.js';
import { EventBus } from './events/bus.js';
import { Kernel } from './core/kernel.js';
import { PluginManager } from './core/plugin-manager.js';
import { PolicyEngine } from './core/policy.js';
import { PluginLoader } from './plugins/loader.js';
import { discoverPlugins } from './plugins/discover.js';
import { runCli } from './cli/index.js';
import { loadConfig } from './config.js';
import { createProvider, hasProviderCredentials } from './providers/factory.js';
import { resolve } from 'path';

let kernelInstance: Kernel | null = null;

async function bootstrap(): Promise<void> {
  // Load configuration
  const config = loadConfig();

  // Set up logger with config level
  logger.info({ providerType: config.providerType, pluginsDir: config.pluginsDir }, 'Loading Forge configuration');

  // Initialize database
  await initDb();

  // Create core components
  const policyEngine = new PolicyEngine();
  const pluginManager = new PluginManager(policyEngine);
  const bus = new EventBus();

  // Create provider or warn if none configured
  let provider: import('./providers/base.js').BaseProvider;
  if (config.provider) {
    provider = createProvider(config.providerType || 'openai', config.provider);
    logger.info({ provider: provider.name, model: provider.model }, 'Provider initialized');
  } else {
    logger.warn('No API key configured — agent will use echo responses until credentials are provided.');
    // Fall back to a simple echo provider for testing without credentials
    provider = {
      name: 'Echo',
      model: 'echo',
      async completion(request: any) {
        const lastUserMsg = [...request.messages].reverse().find((m: any) => m.role === 'user');
        return {
          content: lastUserMsg ? `Echo: ${lastUserMsg.content}` : 'No user message.',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
    } as any;
  }

  kernelInstance = new Kernel(provider, { pluginManager, policyEngine, bus });
  const loader = new PluginLoader(pluginManager, bus);

  // Discover and load plugins from configured paths
  const pluginSearchPaths = [
    process.env.FORGE_PLUGINS_DIR || resolve(process.cwd(), 'plugins'),
  ].filter(Boolean);

  try {
    const discoveries = await discoverPlugins(pluginSearchPaths);
    logger.info({ count: discoveries.length }, 'Discovered plugins');

    const { loaded, failed } = await loader.loadAll(discoveries);
    logger.info(
      { loaded, failed: failed.map(f => f.id) },
      'Plugin loading complete',
    );
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Plugin discovery failed, continuing without plugins',
    );
  }

  logger.info('Forge Kernel Initialized.');

  // Start interactive CLI
  await runCli(kernelInstance!, { config });
}

bootstrap().catch(err => {
  logger.error(err, 'Failed to initialize Forge.');
  process.exit(1);
});

export { kernelInstance as kernel };
export { loadConfig } from './config.js';
export { createProvider } from './providers/factory.js';

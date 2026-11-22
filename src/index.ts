import { logger } from './utils/logger.js';
import { initDb, getDb } from './data/db.js';
import { EventBus } from './events/bus.js';
import { Kernel } from './core/kernel.js';
import { PluginManager } from './core/plugin-manager.js';
import { PolicyEngine } from './core/policy.js';
import { PluginLoader } from './plugins/loader.js';
import { discoverPlugins } from './plugins/discover.js';
import { runCli } from './cli/index.js';
import { resolve } from 'path';

let kernelInstance: Kernel | null = null;

async function bootstrap(): Promise<void> {
  // Initialize database
  await initDb();

  // Create core components
  const policyEngine = new PolicyEngine();
  const pluginManager = new PluginManager(policyEngine);
  const bus = new EventBus();
  const provider = null; // Will be configured via env/settings

  kernelInstance = new Kernel(provider!, { pluginManager, policyEngine, bus });
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
  await runCli(kernelInstance!);
}

bootstrap().catch(err => {
  logger.error(err, 'Failed to initialize Forge.');
  process.exit(1);
});

export { kernelInstance as kernel };

import { PluginManager } from '../core/plugin-manager.js';
import { PluginDiscovery } from './discover.js';
import { PluginManifest } from '../core/plugin.js';
import { logger } from '../utils/logger.js';
import { EventBus } from '../events/bus.js';

export class PluginLoader {
  private manager: PluginManager;
  private bus: EventBus;
  private loadedPlugins: Map<string, PluginDiscovery> = new Map();

  constructor(manager: PluginManager, bus: EventBus) {
    this.manager = manager;
    this.bus = bus;
  }

  /** Load all discovered plugins */
  async loadAll(discoveries: PluginDiscovery[]): Promise<{
    loaded: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    const loaded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const discovery of discoveries) {
      try {
        await this.loadPlugin(discovery);
        loaded.push(discovery.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(
          { plugin: discovery.id, error: errorMsg },
          'Failed to load plugin',
        );
        failed.push({ id: discovery.id, error: errorMsg });
      }
    }

    return { loaded, failed };
  }

  /** Load a single plugin from discovery metadata */
  async loadPlugin(discovery: PluginDiscovery): Promise<void> {
    if (this.loadedPlugins.has(discovery.id)) {
      throw new Error(`Plugin '${discovery.id}' is already loaded`);
    }

    // If there's a handler JS file, merge its functions into the manifest
    let manifest = discovery.manifest;
    if (discovery.handlerPath) {
      manifest = await this.mergeHandler(manifest, discovery.handlerPath);
    }

    await this.manager.register(manifest);
    this.loadedPlugins.set(discovery.id, discovery);

    await this.bus.emit('plugin:load', {
      pluginId: discovery.id,
      name: discovery.name,
    });

    logger.info({ plugin: discovery.id }, 'Plugin loaded successfully');
  }

  /** Unload a plugin by ID */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    const discovery = this.loadedPlugins.get(pluginId);
    if (!discovery) {
      logger.warn({ plugin: pluginId }, 'Plugin not found for unloading');
      return false;
    }

    const removed = this.manager.unregister(pluginId);
    if (removed) {
      this.loadedPlugins.delete(pluginId);
      await this.bus.emit('plugin:unload', { pluginId });
      logger.info({ plugin: pluginId }, 'Plugin unloaded');
    }

    return removed;
  }

  /** Reload a plugin (unload then load) */
  async reloadPlugin(discovery: PluginDiscovery): Promise<void> {
    await this.unloadPlugin(discovery.id);
    await this.loadPlugin(discovery);
    logger.info({ plugin: discovery.id }, 'Plugin reloaded');
  }

  /** Check for duplicate tool names across all loaded plugins */
  checkCompatibility(discoveries: PluginDiscovery[]): Array<{
    toolName: string;
    conflicts: Array<{ pluginId: string; path: string }>;
  }> {
    const toolMap = new Map<string, Array<{ pluginId: string; path: string }>>();

    for (const discovery of discoveries) {
      for (const tool of discovery.manifest.tools) {
        const existing = toolMap.get(tool.name) ?? [];
        existing.push({ pluginId: discovery.id, path: discovery.path });
        toolMap.set(tool.name, existing);
      }
    }

    const conflicts: Array<{
      toolName: string;
      conflicts: Array<{ pluginId: string; path: string }>;
    }> = [];

    for (const [toolName, entries] of toolMap.entries()) {
      if (entries.length > 1) {
        conflicts.push({ toolName, conflicts: entries });
      }
    }

    return conflicts;
  }

  /** Get list of currently loaded plugins */
  getLoadedPlugins(): PluginDiscovery[] {
    return Array.from(this.loadedPlugins.values());
  }

  /** Get plugin manifest by ID */
  getPlugin(id: string): PluginDiscovery | undefined {
    return this.loadedPlugins.get(id);
  }

  private async mergeHandler(
    manifest: PluginManifest,
    handlerPath: string,
  ): Promise<PluginManifest> {
    try {
      const handlerModule = await import(handlerPath);
      const merged = { ...manifest };

      // Merge hook functions from handler
      if (handlerModule.hooks) {
        merged.hooks = { ...manifest.hooks, ...handlerModule.hooks };
      }

      // Merge lifecycle hooks
      if (handlerModule.onMount) {
        merged.onMount = handlerModule.onMount;
      }
      if (handlerModule.onUnmount) {
        merged.onUnmount = handlerModule.onUnmount;
      }

      return merged;
    } catch (err) {
      logger.warn(
        { handler: handlerPath, error: err instanceof Error ? err.message : String(err) },
        'Failed to merge handler, using manifest only',
      );
      return manifest;
    }
  }
}

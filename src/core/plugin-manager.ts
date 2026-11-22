import { ToolDefinition, ToolPermissions } from './tools.js';
import { PolicyEngine } from './policy.js';
import { Plugin, PluginManifest } from './plugin.js';
import { logger } from '../utils/logger.js';

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private policyEngine: PolicyEngine;
  // Map from tool name -> plugin ID (for permission lookups)
  private toolToPlugin: Map<string, string> = new Map();
  // Map from plugin ID -> its permissions
  private pluginPermissions: Map<string, ToolPermissions> = new Map();
  // All tools keyed by name for quick lookup
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(policyEngine: PolicyEngine) {
    this.policyEngine = policyEngine;
  }

  async register(manifest: unknown): Promise<void> {
    let pluginManifest: PluginManifest;
    try {
      const plugin = new Plugin(manifest);
      pluginManifest = plugin.manifest;
      if (this.plugins.has(pluginManifest.id)) {
        throw new Error(`Plugin '${pluginManifest.id}' already registered`);
      }
      this.plugins.set(pluginManifest.id, plugin);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Plugin registration failed: ${msg}`);
    }

    const plugin = this.plugins.get((manifest as PluginManifest).id)!;
    pluginManifest = plugin.manifest;
    await plugin.install();

    for (const tool of pluginManifest.tools) {
      const toolId = `${pluginManifest.id}:${tool.name}`;
      this.tools.set(tool.name, tool);
      this.toolToPlugin.set(tool.name, pluginManifest.id);
      this.pluginPermissions.set(pluginManifest.id, pluginManifest.permissions);

      // Register with policy engine for permission checks
      this.policyEngine.registerToolPermissions(toolId, pluginManifest.permissions);
    }

    logger.info({ plugin: pluginManifest.id }, 'Plugin registered');
  }

  unregister(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    plugin.uninstall();

    // Remove all tools registered by this plugin
    for (const [toolName, id] of this.toolToPlugin.entries()) {
      if (id === pluginId) {
        this.tools.delete(toolName);
        this.toolToPlugin.delete(toolName);
      }
    }
    this.pluginPermissions.delete(pluginId);

    this.plugins.delete(pluginId);
    logger.info({ plugin: pluginId }, 'Plugin unregistered');
    return true;
  }

  get(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  hasToolName(name: string): boolean {
    return this.tools.has(name);
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Get the plugin ID for a given tool name */
  getToolPluginId(toolName: string): string | undefined {
    return this.toolToPlugin.get(toolName);
  }

  /** Get the tool permissions for a given tool name */
  getToolPermissions(toolName: string): ToolPermissions | undefined {
    const pluginId = this.toolToPlugin.get(toolName);
    if (!pluginId) return undefined;
    return this.pluginPermissions.get(pluginId);
  }

  async executePlugin(pluginId: string, action: string, args?: unknown): Promise<any> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    const hooks = plugin.getHooks();
    if (!hooks[action]) {
      throw new Error(`Hook '${action}' not found in plugin '${pluginId}'`);
    }

    return await hooks[action](args);
  }
}
import { z } from 'zod';
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
  // Map from pluginId:toolName -> zod schema for input validation
  private toolValidators: Map<string, z.ZodTypeAny> = new Map();

  constructor(policyEngine: PolicyEngine) {
    this.policyEngine = policyEngine;
  }

  async register(manifest: unknown): Promise<void> {
    let plugin: Plugin;
    try {
      plugin = new Plugin(manifest);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Plugin registration failed: ${msg}`);
    }

    const pluginManifest = plugin.manifest;
    if (this.plugins.has(pluginManifest.id)) {
      throw new Error(`Plugin '${pluginManifest.id}' already registered`);
    }

    this.plugins.set(pluginManifest.id, plugin);
    await plugin.install();

    for (const tool of pluginManifest.tools) {
      const toolId = `${pluginManifest.id}:${tool.name}`;

      // Register duplicate check on tool name within same plugin
      if (this.tools.has(tool.name) && this.toolToPlugin.get(tool.name) !== pluginManifest.id) {
        logger.warn(
          { tool: tool.name, existingPlugin: this.toolToPlugin.get(tool.name), newPlugin: pluginManifest.id },
          'Tool name conflict — overwriting previous registration',
        );
      }

      this.tools.set(tool.name, tool);
      this.toolToPlugin.set(tool.name, pluginManifest.id);
      this.pluginPermissions.set(pluginManifest.id, pluginManifest.permissions);

      // Build Zod validator for tool input schema (if one exists)
      if (tool.inputSchema && Object.keys(tool.inputSchema).length > 0) {
        try {
          const schema = this.buildZodSchema(tool.inputSchema);
          this.toolValidators.set(toolId, schema);
        } catch {
          logger.warn({ tool: tool.name }, 'Could not build input validator for tool');
        }
      }

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
        this.toolValidators.delete(`${pluginId}:${toolName}`);
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

  /** Execute a tool hook from a plugin with optional input validation. */
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

  /**
   * Validate tool arguments against the tool's input schema using Zod.
   * Returns parsed args or throws.
   */
  validateToolInput(toolName: string, rawArgs: any): any {
    const pluginId = this.toolToPlugin.get(toolName);
    if (!pluginId) return rawArgs; // No validation if tool not found

    const schema = this.toolValidators.get(`${pluginId}:${toolName}`);
    if (!schema) return rawArgs; // No schema → pass through

    try {
      return schema.parse(rawArgs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Tool '${toolName}' input validation failed: ${message}`);
    }
  }

  /**
   * Convert an OpenAI-style input schema (JSON Schema subset) into a Zod schema.
   * Handles object types with properties, required arrays, and basic primitives.
   */
  private buildZodSchema(schema: Record<string, any>): z.ZodTypeAny {
    if (!schema || schema.type !== 'object') {
      return z.object({}).passthrough();
    }

    const shape: Record<string, z.ZodTypeAny> = {};
    const properties = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    for (const [key, propSchema] of Object.entries(properties)) {
      shape[key] = this.zodFromProperty(key, propSchema as Record<string, any>, required.includes(key));
    }

    return z.object(shape).catchall(z.never());
  }

  private zodFromProperty(
    name: string,
    prop: Record<string, any>,
    required: boolean,
  ): z.ZodTypeAny {
    const base = this.zodPrimitive(prop);
    return required ? base : base.optional();
  }

  private zodPrimitive(prop: Record<string, any>): z.ZodTypeAny {
    switch (prop.type) {
      case 'string':
        return z.string();
      case 'number':
      case 'integer':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'array':
        const itemSchema = prop.items ? this.zodPrimitive(prop.items) : z.any();
        return z.array(itemSchema);
      case 'object':
        return this.buildZodSchema(prop);
      default:
        return z.any();
    }
  }
}

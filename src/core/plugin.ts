import { ToolDefinition, ToolPermissions, ToolResult, ToolPermissionsSchema } from './tools.js';
import { z } from 'zod';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  tools: ToolDefinition[];
  permissions: ToolPermissions;
  hooks?: Record<string, (...args: any[]) => void | Promise<void>>;
  onMount?: () => Promise<void>;
  onUnmount?: () => Promise<void>;
}

// Zod v4 schema for plugin manifest validation
export const PluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string().optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: z.record(z.string(), z.any()),
  })).min(1, 'Plugin must have at least one tool'),
  permissions: ToolPermissionsSchema,
  hooks: z.record(z.string(), z.any()).optional(),
  onMount: z.function().optional(),
  onUnmount: z.function().optional(),
});

export class Plugin {
  manifest: PluginManifest;
  private tools: Map<string, ToolDefinition>;

  constructor(manifest: unknown) {
    // Validate at construction time using Zod schema - throws on invalid input
    const validated = PluginManifestSchema.parse(manifest);
    this.manifest = validated as PluginManifest;
    this.tools = new Map();
    for (const tool of this.manifest.tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getName(): string {
    return this.manifest.name;
  }

  getId(): string {
    return this.manifest.id;
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getPermissions(): ToolPermissions {
    return this.manifest.permissions;
  }

  async install(): Promise<void> {
    if (this.manifest.onMount) {
      await this.manifest.onMount();
    }
  }

  async uninstall(): Promise<void> {
    if (this.manifest.onUnmount) {
      await this.manifest.onUnmount();
    }
  }

  async executeTool(toolName: string, args: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return Promise.resolve({
        success: false,
        error: `Tool '${toolName}' not found in plugin '${this.getId()}'`,
      });
    }

    try {
      const result = await this.executeToolFunction(tool, args);
      return Promise.resolve({
        success: true,
        output: result,
      });
    } catch (error: unknown) {
      return Promise.resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async executeToolFunction(tool: ToolDefinition, args: Record<string, any>): Promise<any> {
    // This is a placeholder - actual implementation will call registered tool functions
    return args;
  }

  getHooks(): Record<string, (...args: any[]) => void | Promise<void>> {
    return (this.manifest.hooks || {}) as Record<string, (...args: any[]) => void | Promise<void>>;
  }
}

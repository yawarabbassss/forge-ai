import { ToolDefinition, ToolPermissions } from './tools.js';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private permissions: Map<string, ToolPermissions> = new Map();

  register(manifest: ToolDefinition, pluginId: string): string {
    const toolId = `${pluginId}:${manifest.name}`;

    if (this.tools.has(toolId)) {
      throw new Error(`Tool '${manifest.name}' already registered by plugin '${pluginId}'`);
    }

    this.tools.set(toolId, {
      name: manifest.name,
      description: manifest.description,
      inputSchema: manifest.inputSchema,
    });

    return toolId;
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  list(): Array<{ id: string; tool: ToolDefinition }> {
    const result: Array<{ id: string; tool: ToolDefinition }> = [];
    for (const [id, tool] of this.tools) {
      result.push({ id, tool });
    }
    return result;
  }

  unregister(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  clear(): void {
    this.tools.clear();
    this.permissions.clear();
  }
}
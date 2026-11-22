import { PluginManifest, PluginManifestSchema } from '../core/plugin.js';
import { ToolDefinition } from '../core/tools.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CompatibilityResult {
  compatible: boolean;
  conflicts: Array<{
    type: 'tool-name' | 'plugin-id';
    details: string;
  }>;
}

/**
 * Validate a plugin manifest against schema
 */
export function validateManifest(
  manifest: unknown,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    PluginManifestSchema.parse(manifest);
  } catch (err) {
    if (err instanceof Error) {
      errors.push(err.message);
    } else {
      errors.push(String(err));
    }
  }

  // Additional custom validations
  const m = manifest as PluginManifest;

  if (m.id && m.id.includes(':')) {
    warnings.push("Plugin ID contains ':' which may cause issues in tool IDs");
  }

  if (m.version && !/^\d+\.\d+\.\d+$/.test(m.version)) {
    warnings.push('Version should follow semver format (x.y.z)');
  }

  // Check for empty tool descriptions
  if (m.tools) {
    for (const tool of m.tools) {
      if (!tool.description || tool.description.trim() === '') {
        warnings.push(`Tool '${tool.name}' has empty description`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check compatibility between multiple plugins
 */
export function checkCompatibility(
  plugins: PluginManifest[],
): CompatibilityResult {
  const conflicts: Array<{ type: 'tool-name' | 'plugin-id'; details: string }> = [];

  // Check for duplicate plugin IDs
  const idSet = new Set<string>();
  for (const plugin of plugins) {
    if (idSet.has(plugin.id)) {
      conflicts.push({
        type: 'plugin-id',
        details: `Duplicate plugin ID: '${plugin.id}'`,
      });
    }
    idSet.add(plugin.id);
  }

  // Check for duplicate tool names across all plugins
  const toolNames = new Map<string, string[]>();
  for (const plugin of plugins) {
    for (const tool of plugin.tools) {
      const existing = toolNames.get(tool.name) ?? [];
      existing.push(`${plugin.id}:${plugin.name}`);
      toolNames.set(tool.name, existing);
    }
  }

  for (const [toolName, sources] of toolNames.entries()) {
    if (sources.length > 1) {
      conflicts.push({
        type: 'tool-name',
        details: `Tool '${toolName}' defined in multiple plugins: ${sources.join(', ')}`,
      });
    }
  }

  return {
    compatible: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Validate plugin permissions structure
 */
export function validatePermissions(permissions: Record<string, any>): string[] {
  const warnings: string[] = [];

  if (!permissions || Object.keys(permissions).length === 0) {
    warnings.push('Plugin has no permissions declared');
    return warnings;
  }

  const knownCategories = ['fs', 'net', 'network', 'inference', 'other'];

  for (const category of Object.keys(permissions)) {
    if (!knownCategories.includes(category)) {
      warnings.push(`Unknown permission category: '${category}'`);
    }

    const perms = permissions[category];
    if (Array.isArray(perms) && perms.some(p => typeof p !== 'string')) {
      warnings.push(`Invalid permission value in category '${category}'`);
    }
  }

  return warnings;
}

/**
 * Deep merge two manifests (for handler merging)
 */
export function mergeManifests(
  base: PluginManifest,
  overlay: Partial<PluginManifest>,
): PluginManifest {
  return {
    ...base,
    ...overlay,
    tools: [...(base.tools || []), ...(overlay.tools || [])],
    permissions: { ...base.permissions, ...overlay.permissions },
    hooks: { ...base.hooks, ...overlay.hooks },
  };
}

import { describe, it, expect } from 'vitest';
import { Plugin } from '../src/core/plugin.js';
import { PluginManifestSchema } from '../src/core/plugin.js';

describe('Plugin Manifest Validation', () => {
  it('should accept valid plugin manifest', () => {
    const validManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      tools: [{
        name: 'greet',
        description: 'Greets someone',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
      }],
      permissions: { net: ['request'] },
    };

    const plugin = new Plugin(validManifest);
    expect(plugin.getId()).toBe('test-plugin');
    expect(plugin.getName()).toBe('Test Plugin');
    expect(plugin.getTools()).toHaveLength(1);
  });

  it('should reject missing required fields', () => {
    const invalidManifest = {
      name: 'Missing ID',
      // id is required
      version: '1.0.0',
      description: 'Missing id field',
      tools: [],
      permissions: {},
    };

    expect(() => new Plugin(invalidManifest)).toThrow();
  });

  it('should reject empty tools array', () => {
    const invalidManifest = {
      id: 'empty-tools',
      name: 'Empty Tools',
      version: '1.0.0',
      description: 'No tools',
      tools: [],
      permissions: {},
    };

    expect(() => new Plugin(invalidManifest)).toThrow();
  });

  it('should validate permissions structure', () => {
    const validWithAllPerms = {
      id: 'perms-test',
      name: 'Permissions Test',
      version: '1.0.0',
      description: 'All permissions',
      tools: [{ name: 'tool1', description: 'Desc', inputSchema: {} }],
      permissions: {
        fs: ['read'],
        net: ['request'],
        network: ['external'],
        inference: ['model-access'],
        other: { custom: ['perm1', 'perm2'] },
      },
    };

    const plugin = new Plugin(validWithAllPerms);
    expect(plugin.getPermissions()).toEqual(validWithAllPerms.permissions);
  });

  it('should handle optional hooks', async () => {
    const hookFn = async (data: any) => data;
    
    const manifest = {
      id: 'hooks-test',
      name: 'Hooks Test',
      version: '1.0.0',
      description: 'With hooks',
      tools: [{ name: 't1', description: 'd1', inputSchema: {} }],
      permissions: {},
      hooks: { beforeExecute: hookFn },
      onMount: async () => console.log('mounted'),
      onUnmount: async () => console.log('unmounted'),
    };

    const plugin = new Plugin(manifest);
    expect(Object.keys(plugin.getHooks())).toContain('beforeExecute');
  });
});

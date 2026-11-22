import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../src/core/plugin-manager.js';
import { PolicyEngine } from '../src/core/policy.js';

describe('Plugin Lifecycle Behavior', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager(new PolicyEngine());
  });

  it('should call onMount when registering', async () => {
    const mountSpy = vi.fn();
    const unmountSpy = vi.fn();

    await pluginManager.register({
      id: 'lifecycle-test',
      name: 'Lifecycle Test',
      version: '1.0.0',
      description: 'Tests lifecycle',
      tools: [{ name: 'test', description: 'desc', inputSchema: {} }],
      permissions: {},
      onMount: mountSpy,
      onUnmount: unmountSpy,
    });

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(pluginManager.list()).toHaveLength(1);
  });

  it('should call onUnmount when unregistering', async () => {
    const unmountSpy = vi.fn();

    await pluginManager.register({
      id: 'unregister-test',
      name: 'Unregister Test',
      version: '1.0.0',
      description: 'Tests unmount',
      tools: [{ name: 'test', description: 'desc', inputSchema: {} }],
      permissions: {},
      onUnmount: unmountSpy,
    });

    pluginManager.unregister('unregister-test');
    expect(unmountSpy).toHaveBeenCalledTimes(1);
  });

  it('should prevent duplicate registration', async () => {
    const manifest = {
      id: 'dup-test',
      name: 'Dup Test',
      version: '1.0.0',
      description: 'Duplicate test',
      tools: [{ name: 'tool', description: 'desc', inputSchema: {} }],
      permissions: {},
    };

    await pluginManager.register(manifest);
    
    await expect(pluginManager.register(manifest)).rejects.toThrow(/already registered/i);
  });

  it('should register multiple tools per plugin', async () => {
    await pluginManager.register({
      id: 'multi-tool',
      name: 'Multi Tool',
      version: '1.0.0',
      description: 'Multiple tools',
      tools: [
        { name: 'tool_a', description: 'Tool A', inputSchema: {} },
        { name: 'tool_b', description: 'Tool B', inputSchema: {} },
        { name: 'tool_c', description: 'Tool C', inputSchema: {} },
      ],
      permissions: {},
    });

    const tools = pluginManager.getTools();
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name)).toContain('tool_a');
    expect(tools.map(t => t.name)).toContain('tool_b');
    expect(tools.map(t => t.name)).toContain('tool_c');
  });
});

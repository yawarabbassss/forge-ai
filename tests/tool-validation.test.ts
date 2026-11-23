import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from '../src/core/plugin-manager.js';
import { PolicyEngine } from '../src/core/policy.js';

describe('Tool Input Validation', () => {
  let pluginManager: PluginManager;

  beforeEach(async () => {
    pluginManager = new PluginManager(new PolicyEngine());
    await pluginManager.register({
      id: 'validation-plugin',
      name: 'Validation Test',
      version: '1.0.0',
      description: 'Tests tool validation',
      tools: [
        {
          name: 'greet',
          description: 'Greet a user',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              formal: { type: 'boolean' },
            },
            required: ['name'],
          },
        },
        {
          name: 'calculate',
          description: 'Perform calculation',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
              op: { type: 'string' },
            },
            required: ['a', 'b', 'op'],
          },
        },
      ],
      permissions: {},
    });
  });

  it('should validate correct inputs', () => {
    const result = pluginManager.validateToolInput('greet', { name: 'Alice' });
    expect(result).toEqual({ name: 'Alice' });
  });

  it('should allow optional fields', () => {
    const result = pluginManager.validateToolInput('greet', { name: 'Bob', formal: true });
    expect(result).toEqual({ name: 'Bob', formal: true });
  });

  it('should reject missing required fields', () => {
    expect(() => pluginManager.validateToolInput('greet', {})).toThrow(/name/);
  });

  it('should reject wrong types', () => {
    expect(() => pluginManager.validateToolInput('greet', { name: 123 })).toThrow();
  });

  it('should reject extra fields by default', () => {
    expect(() => pluginManager.validateToolInput('greet', { name: 'Carol', extra: 'data' })).toThrow();
  });

  it('should return raw args for unknown tools', () => {
    const raw = { foo: 'bar' };
    expect(pluginManager.validateToolInput('unknown-tool', raw)).toBe(raw);
  });

  it('should return raw args when no schema exists', () => {
    expect(pluginManager.validateToolInput('nonexistent', { x: 1 })).toEqual({ x: 1 });
  });
});

import { describe, it, expect } from 'vitest';
import { validateManifest, checkCompatibility } from '../src/plugins/validation.js';

describe('Plugin Validation', () => {
  describe('validateManifest', () => {
    it('should validate a correct manifest', () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        tools: [{ name: 'tool1', description: 'Tool one', inputSchema: {} }],
        permissions: {},
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const invalidManifest = {
        name: 'Missing ID',
        version: '1.0.0',
      };

      const result = validateManifest(invalidManifest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about empty tool descriptions', () => {
      const manifest = {
        id: 'warn-test',
        name: 'Warning Test',
        version: '1.0.0',
        description: 'Tests warnings',
        tools: [{ name: 'empty-tool', description: '', inputSchema: {} }],
        permissions: {},
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('empty description'))).toBe(true);
    });
  });

  describe('checkCompatibility', () => {
    it('should allow unique plugins', () => {
      const plugins = [
        { id: 'plugin-a', name: 'Plugin A', tools: [{ name: 'tool-a', description: 'A', inputSchema: {} }] },
        { id: 'plugin-b', name: 'Plugin B', tools: [{ name: 'tool-b', description: 'B', inputSchema: {} }] },
      ];

      const result = checkCompatibility(plugins);
      expect(result.compatible).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect duplicate plugin IDs', () => {
      const plugins = [
        { id: 'dup', name: 'First', tools: [] },
        { id: 'dup', name: 'Second', tools: [] },
      ];

      const result = checkCompatibility(plugins as any);
      expect(result.compatible).toBe(false);
      expect(result.conflicts.some(c => c.type === 'plugin-id')).toBe(true);
    });

    it('should detect duplicate tool names', () => {
      const plugins = [
        { id: 'p1', name: 'P1', tools: [{ name: 'shared-tool', description: 'Shared', inputSchema: {} }] },
        { id: 'p2', name: 'P2', tools: [{ name: 'shared-tool', description: 'Shared v2', inputSchema: {} }] },
      ];

      const result = checkCompatibility(plugins as any);
      expect(result.compatible).toBe(false);
      expect(result.conflicts.some(c => c.type === 'tool-name')).toBe(true);
    });
  });
});

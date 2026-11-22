import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../src/core/plugin-manager.js';
import { PolicyEngine } from '../src/core/policy.js';
import { Session } from '../src/core/session.js';
import { Kernel } from '../src/core/kernel.js';
import { BaseProvider, ForgeRequest, ForgeResponse } from '../src/providers/base.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

describe('Core Components', () => {
  let pluginManager: PluginManager;
  let policyEngine: PolicyEngine;
  let session: Session;

  beforeEach(() => {
    policyEngine = new PolicyEngine();
    pluginManager = new PluginManager(policyEngine);
    session = new Session('test-session');
  });

  describe('PolicyEngine', () => {
    it('should allow permission when tool has required permissions', () => {
      const mockToolId = 'mock-plugin:test-tool';
      policyEngine.registerToolPermissions(mockToolId, { net: ['request'] });

      const result = policyEngine.checkPermissions(mockToolId, ['request']);
      expect(result.allowed).toBe(true);
    });

    it('should deny permission when tool lacks required permissions', () => {
      const mockToolId = 'mock-plugin:test-tool';
      policyEngine.registerToolPermissions(mockToolId, {});

      const result = policyEngine.checkPermissions(mockToolId, ['fs:write']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not have permission');
    });

    it('should return error when tool is not registered', () => {
      const result = policyEngine.checkPermissions('unregistered-tool', ['net:request']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not registered');
    });
  });

  describe('Session', () => {
    it('should add messages', () => {
      session.addMessage({ role: 'user', content: 'Hello' });
      expect(session.messages.length).toBe(1);
      expect(session.messages[0].content).toBe('Hello');
    });

    it('should truncate old messages', () => {
      session.addMessage({ role: 'user', content: 'First message' });
      session.addMessage({ role: 'user', content: 'Second message' });
      session.truncate(1);
      expect(session.messages.length).toBe(1);
    });

    it('should trim tokens', () => {
      session.addMessage({ role: 'user', content: 'A'.repeat(100) });
      session.addMessage({ role: 'user', content: 'B'.repeat(100) });
      session.trimTokens(50);
      expect(session.messages.length).toBeLessThan(2);
    });
  });

  describe('PluginManager', () => {
    it('should register a plugin', async () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        tools: [
          {
            name: 'greet',
            description: 'Greets someone',
            inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
          },
        ],
        permissions: { net: ['request'] },
      };

      await pluginManager.register(manifest as any);
      expect(pluginManager.get('test-plugin')).toBeDefined();
    });

    it('should reject duplicate plugin registration', async () => {
      const manifest = {
        id: 'duplicate-plugin',
        name: 'Duplicate',
        version: '1.0.0',
        description: 'Duplicate',
        tools: [{ name: 'tool1', description: 'Test tool', inputSchema: {} }],
        permissions: {},
      };

      await pluginManager.register(manifest as any);

      await expect(
        pluginManager.register(manifest as any)
      ).rejects.toThrow(/already registered/);
    });

    it('should unregister a plugin', async () => {
      const manifest = {
        id: 'to-unregister',
        name: 'To Unregister',
        version: '1.0.0',
        description: 'Unregister test',
        tools: [{ name: 'test-tool', description: 'Test tool', inputSchema: {} }],
        permissions: {},
      };

      await pluginManager.register(manifest as any);
      const result = pluginManager.unregister('to-unregister');
      expect(result).toBe(true);
      expect(pluginManager.get('to-unregister')).toBeUndefined();
    });
  });

  describe('Kernel', () => {
    let mockProvider: BaseProvider;

    beforeEach(() => {
      mockProvider = {
        name: 'Mock',
        completion: vi.fn().mockResolvedValue({ content: 'Mock response' }),
      };
    });

    it('should create a session', async () => {
      const kernel = new Kernel(mockProvider);
      const session = await kernel.createSession({ title: 'Kernel Test' });
      expect(session.id).toBeDefined();
    });

    it('should execute without sessionId', async () => {
      const kernel = new Kernel(mockProvider);
      const result = await kernel.execute('Hello, world!');
      expect(result.content).toBe('Mock response');
    });
  });
});
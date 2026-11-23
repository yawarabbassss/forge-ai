import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initDb, persistMessage, listSessions } from '../src/data/db.js';
import { Kernel } from '../src/core/kernel.js';
import { PluginManager } from '../src/core/plugin-manager.js';
import { PolicyEngine } from '../src/core/policy.js';
import { EventBus } from '../src/events/bus.js';
import { BaseProvider } from '../src/providers/base.js';

describe('Session Restoration End-to-End', () => {
  let kernel: Kernel;
  let mockProvider: BaseProvider;

  beforeAll(async () => {
    await initDb();
  });

  beforeEach(() => {
    mockProvider = {
      name: 'MockProvider',
      model: 'mock',
      completion: vi.fn().mockResolvedValue({ content: 'OK' }),
    };
    const policyEngine = new PolicyEngine();
    const pluginManager = new PluginManager(policyEngine);
    const bus = new EventBus();
    kernel = new Kernel(mockProvider, { pluginManager, policyEngine, bus });
  });

  it('should restore session messages from database', async () => {
    // Create a session via kernel
    const session = await kernel.createSession({ title: 'Restore Test' });

    // Manually insert messages into the DB
    await persistMessage(session.id, 'user', 'Hello there');
    await persistMessage(session.id, 'assistant', 'Hi! How can I help?');

    // Destroy in-memory session and restore from DB
    kernel.deleteSession(session.id);

    const restored = await kernel.restoreSession(session.id);
    expect(restored).not.toBeNull();
    expect(restored!.messages).toHaveLength(2);
    expect(restored!.messages[0].content).toBe('Hello there');
    expect(restored!.messages[1].content).toBe('Hi! How can I help?');
  });

  it('should return null for non-existent session', async () => {
    const restored = await kernel.restoreSession('non-existent-id');
    expect(restored).toBeNull();
  });

  it('should list sessions created via kernel', async () => {
    await kernel.createSession({ title: 'List Test A' });
    await kernel.createSession({ title: 'List Test B' });

    const sessions = await listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.map((s: any) => s.title).filter(Boolean)).toContain('List Test A');
    expect(sessions.map((s: any) => s.title).filter(Boolean)).toContain('List Test B');
  });

  it('should persist and retrieve tool call metadata', async () => {
    const session = await kernel.createSession({ title: 'Tool Call Session' });
    await persistMessage(session.id, 'assistant', '', { name: '{"toolCalls":[{"name":"calc","id":"tc1"}]}' });
    await persistMessage(session.id, 'tool', '42', { toolCallId: 'tc1' });

    // Restore and verify
    const restored = await kernel.restoreSession(session.id);
    expect(restored).not.toBeNull();
    expect(restored!.messages).toHaveLength(2);
    expect(restored!.messages[0].name).toContain('toolCalls');
    expect(restored!.messages[1].toolCallId).toBe('tc1');
  });
});

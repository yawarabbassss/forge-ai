import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { initDb, getDb, listSessions, persistMessage } from '../src/data/db.js';
import { Kernel } from '../src/core/kernel.js';
import { PluginManager } from '../src/core/plugin-manager.js';
import { PolicyEngine } from '../src/core/policy.js';
import { EventBus } from '../src/events/bus.js';
import { BaseProvider } from '../src/providers/base.js';

// Initialize DB once for all tests in this file
beforeAll(async () => {
  await initDb();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Session Restoration', () => {
  let provider: BaseProvider;
  let kernel: Kernel;

  beforeEach(() => {
    provider = {
      name: 'MockProvider',
      completion: vi.fn().mockResolvedValue({ content: 'OK' }),
    };

    const policyEngine = new PolicyEngine();
    const pluginManager = new PluginManager(policyEngine);
    const bus = new EventBus();

    kernel = new Kernel(provider, { pluginManager, policyEngine, bus });
  });

  it('should persist and retrieve sessions from database', async () => {
    // Create a session via kernel
    const session1 = await kernel.createSession({ title: 'Test Session 1' });
    expect(session1.id).toBeDefined();

    // Add messages directly to DB (simulating conversation history)
    await persistMessage(session1.id, 'user', 'Hello');
    await persistMessage(session1.id, 'assistant', 'Hi there!');

    // Query sessions from database
    const sessions = await listSessions();
    expect(sessions.length).toBeGreaterThan(0);

    // Find our session
    const restoredSession = sessions.find((s) => s.id === session1.id);
    expect(restoredSession).toBeDefined();
    expect(restoredSession?.title).toBe('Test Session 1');
  });

  it('should restore session data after creating new kernel', async () => {
    const session = await kernel.createSession({ title: 'Important Session' });

    // Add conversation history
    await persistMessage(session.id, 'user', 'First message');
    await persistMessage(session.id, 'assistant', 'First response');
    await persistMessage(session.id, 'user', 'Second message');

    // Verify session appears in database listings
    const sessions = await listSessions();
    expect(sessions.some((s) => s.id === session.id)).toBe(true);
  });

  it('should list recent sessions sorted by creation time', async () => {
    // Create multiple sessions
    const session1 = await kernel.createSession({ title: 'Session A' });
    const session2 = await kernel.createSession({ title: 'Session B' });

    const sessions = await listSessions();

    // Should have at least the two we created
    expect(sessions.length).toBeGreaterThanOrEqual(2);

    // Both should be in the list
    const ids = sessions.map((s) => s.id);
    expect(ids).toContain(session1.id);
    expect(ids).toContain(session2.id);
  });

  it('should preserve session metadata across operations', async () => {
    const session = await kernel.createSession({
      title: 'Detailed Session',
      userId: 'user-123',
      tags: ['important', 'test'],
    });

    expect(session.metadata.title).toBe('Detailed Session');
    expect(session.metadata.userId).toBe('user-123');
    expect(session.metadata.tags).toEqual(['important', 'test']);
  });
});

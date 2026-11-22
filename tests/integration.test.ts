import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { initDb, listSessions, persistMessage } from '../src/data/db.js';
import { Agent } from '../src/core/agent.js';
import { Kernel } from '../src/core/kernel.js';
import { PluginManager } from '../src/core/plugin-manager.js';
import { PolicyEngine } from '../src/core/policy.js';
import { EventBus } from '../src/events/bus.js';
import { BaseProvider } from '../src/providers/base.js';

beforeAll(async () => {
  await initDb();
});

describe('Integration Tests', () => {
  let mockProvider: BaseProvider;
  let pluginManager: PluginManager;
  let policyEngine: PolicyEngine;
  let bus: EventBus;

  beforeEach(() => {
    policyEngine = new PolicyEngine();
    pluginManager = new PluginManager(policyEngine);
    bus = new EventBus();
    vi.clearAllMocks();

    mockProvider = {
      name: 'MockProvider',
      completion: vi.fn(),
    };
  });

  it('should emit events during agent execution with tool calls', async () => {
    const events: string[] = [];

    bus.on('agent:start', (_payload) => events.push('agent:start'));
    bus.on('llm:request', (_payload) => events.push('llm:request'));
    bus.on('tool:call', (_payload) => events.push('tool:call'));
    bus.on('tool:result', (_payload) => events.push('tool:result'));
    bus.on('llm:response', (_payload) => events.push('llm:response'));

    await pluginManager.register({
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'Test',
      tools: [{ name: 'test_tool', description: 'A test tool', inputSchema: {} }],
      permissions: {},
      hooks: {
        execute: async ({ tool }: any) => ({ success: true, tool }),
      },
    });

    // LLM returns tool call first, then final response
    mockProvider.completion.mockImplementation(async () => {
      const callCount = mockProvider.completion.mock.calls.length;
      if (callCount === 1) {
        return { content: null, toolCalls: [{ id: '1', name: 'test_tool', arguments: {} }] };
      }
      return { content: 'Done!' };
    });

    const kernel = new Kernel(mockProvider, { pluginManager, policyEngine, bus });
    const session = await kernel.createSession({ title: 'Integration Test' });

    const result = await kernel.execute('Test message', session.id);

    expect(result.content).toBe('Done!');
    expect(events).toContain('agent:start');
    expect(events).toContain('llm:request');
    expect(events).toContain('tool:call');
    expect(events).toContain('tool:result');
    expect(events).toContain('llm:response');
  });

  it('should support multiple sequential tool calls', async () => {
    let callCount = 0;

    mockProvider.completion.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: null,
          toolCalls: [
            { id: '1', name: 'first', arguments: {} },
            { id: '2', name: 'second', arguments: {} },
          ],
        };
      }
      if (callCount === 2) {
        return { content: null, toolCalls: [{ id: '3', name: 'third', arguments: {} }] };
      }
      return { content: 'All done!' };
    });

    await pluginManager.register({
      id: 'multi-tool-plugin',
      name: 'Multi Tool',
      version: '1.0.0',
      description: 'Multiple tools',
      tools: [
        { name: 'first', description: 'First tool', inputSchema: {} },
        { name: 'second', description: 'Second tool', inputSchema: {} },
        { name: 'third', description: 'Third tool', inputSchema: {} },
      ],
      permissions: {},
      hooks: {
        execute: async ({ tool }: any) => ({ executed: tool }),
      },
    });

    const kernel = new Kernel(mockProvider, { pluginManager, policyEngine, bus });
    const session = await kernel.createSession();

    const result = await kernel.execute('Execute all tools', session.id);

    expect(result.content).toBe('All done!');
    expect(callCount).toBe(3);
  });

  it('should handle tool execution errors gracefully', async () => {
    await pluginManager.register({
      id: 'failing-plugin',
      name: 'Failing Plugin',
      version: '1.0.0',
      description: 'Intentionally fails',
      tools: [{ name: 'failing', description: 'Will fail', inputSchema: {} }],
      permissions: {},
      hooks: {
        execute: async () => {
          throw new Error('Intentional failure');
        },
      },
    });

    mockProvider.completion.mockImplementation(async () => {
      const callCount = mockProvider.completion.mock.calls.length;
      if (callCount === 1) {
        return { content: null, toolCalls: [{ id: '1', name: 'failing', arguments: {} }] };
      }
      return { content: 'Recovered after error' };
    });

    const kernel = new Kernel(mockProvider, { pluginManager, policyEngine, bus });
    const session = await kernel.createSession();

    const result = await kernel.execute('Try failing tool', session.id);

    // Should recover despite tool failure
    expect(result.content).toBe('Recovered after error');
  });
});

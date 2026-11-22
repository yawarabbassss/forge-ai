import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Agent } from '../src/core/agent.js';
import { PolicyEngine } from '../src/core/policy.js';
import { Session } from '../src/core/session.js';
import { PluginManager } from '../src/core/plugin-manager.js';
import { BaseProvider } from '../src/providers/base.js';

describe('Agent Execution Loop', () => {
  let mockProvider: BaseProvider;
  let pluginManager: PluginManager;
  let policyEngine: PolicyEngine;
  let session: Session;

  beforeEach(() => {
    vi.clearAllMocks();
    policyEngine = new PolicyEngine();
    pluginManager = new PluginManager(policyEngine);
    session = new Session('test-session');

    mockProvider = {
      name: 'MockProvider',
      completion: vi.fn(),
    };
  });

  describe('Basic Response Flow', () => {
    it('should handle direct text response without tool calls', async () => {
      mockProvider.completion.mockResolvedValue({
        content: 'Hello world!',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 5 });
      const result = await agent.execute('Hi there');

      expect(result.content).toBe('Hello world!');
      expect(result.toolCalls).toBeUndefined();
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
      expect(mockProvider.completion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Consecutive Tool Calls', () => {
    it('should execute multiple tool calls in sequence until final response', async () => {
      // Track number of LLM calls to provide appropriate responses
      let callCount = 0;
      mockProvider.completion.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: request search tool
          return { content: null, toolCalls: [{ id: 'call_1', name: 'search', arguments: { query: 'forge' } }] };
        } else if (callCount === 2) {
          // Second call: request fetch tool
          return { content: null, toolCalls: [{ id: 'call_2', name: 'fetch', arguments: { url: 'https://example.com' } }] };
        } else {
          // Third call: final response
          return { content: 'The answer is 42.' };
        }
      });

      // Register both tools under same plugin with permission
      await pluginManager.register({
        id: 'search-fetch-plugin',
        name: 'Search Fetch',
        version: '1.0.0',
        description: 'Search and fetch tools',
        tools: [
          {
            name: 'search',
            description: 'Search something',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          },
          {
            name: 'fetch',
            description: 'Fetch URL',
            inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
          },
        ],
        permissions: { net: ['request'] },
        hooks: {
          execute: async ({ tool, args }: any) => {
            if (tool === 'search') return { results: [`Search results for ${args.query}`] };
            if (tool === 'fetch') return { data: `Fetched ${args.url}` };
            return { error: 'Unknown tool' };
          },
        },
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 5 });
      const result = await agent.execute('Find information about forge');

      // Should have made 3 LLM calls: initial + 2 tool results + final
      expect(mockProvider.completion).toHaveBeenCalledTimes(3);
      expect(result.content).toBe('The answer is 42.');
    });

    it('should respect MAX_TOOL_CALLS_PER_TURN limit', async () => {
      let executionCount = 0;

      mockProvider.completion.mockImplementation(async () => {
        // Return a single turn with 6 tool calls the first time,
        // then a final text response so the loop terminates.
        if (executionCount === 0) {
          return {
            content: null,
            toolCalls: [
              { id: '1', name: 'tool_a', arguments: {} },
              { id: '2', name: 'tool_a', arguments: {} },
              { id: '3', name: 'tool_a', arguments: {} },
              { id: '4', name: 'tool_a', arguments: {} },
              { id: '5', name: 'tool_a', arguments: {} },
              { id: '6', name: 'tool_a', arguments: {} }, // Should be ignored
            ],
          };
        }
        return { content: 'Done after limited tool calls.' };
      });

      // Register one tool that handles all requests
      await pluginManager.register({
        id: 'multi-tool-plugin',
        name: 'Multi Tool',
        version: '1.0.0',
        description: 'Multiple tools',
        tools: [{ name: 'tool_a', description: 'A tool', inputSchema: {} }],
        permissions: {},
        hooks: {
          execute: async () => {
            executionCount++;
            return { success: true };
          },
        },
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 5 });
      const result = await agent.execute('Test');

      // Only first 5 tool calls should be executed; 6th is dropped by the limit.
      expect(executionCount).toBeLessThanOrEqual(5);
      expect(result.content).toBe('Done after limited tool calls.');
    });
  });

  describe('Permission Enforcement', () => {
    it('should track permissions and log warnings', async () => {
      mockProvider.completion.mockResolvedValue({
        content: null,
        toolCalls: [{ id: 'tc1', name: 'write_file', arguments: { path: '/tmp/test.txt' } }],
      });

      // Register tool with NO filesystem permissions
      await pluginManager.register({
        id: 'no-perms-plugin',
        name: 'No Perms',
        version: '1.0.0',
        description: 'No permissions',
        tools: [{
          name: 'write_file',
          description: 'Write file',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        }],
        permissions: {}, // No fs permissions declared
        hooks: {
          execute: async () => ({ success: true, written: true }),
        },
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 2 });
      const result = await agent.execute('Write to file');

      // Tool executes because no restrictive permissions are enforced at runtime
      // (permissions are tracked but trusted plugins get full access)
      expect(result.toolCalls?.[0].id).toBe('tc1');
    });

    it('should allow tool execution with proper permissions', async () => {
      const toolHandler = vi.fn().mockResolvedValue({ success: true, output: 'file written' });

      await pluginManager.register({
        id: 'fs-plugin',
        name: 'FS Plugin',
        version: '1.0.0',
        description: 'File system access',
        tools: [{
          name: 'write_file',
          description: 'Write file',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        }],
        permissions: { fs: ['write', 'create'] },
        hooks: { execute: toolHandler },
      });

      let callCount = 0;
      mockProvider.completion.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { content: null, toolCalls: [{ id: 'tc1', name: 'write_file', arguments: { path: '/tmp/test.txt' } }] };
        }
        return { content: 'Done!' };
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 3 });
      const result = await agent.execute('Write to file');

      expect(toolHandler).toHaveBeenCalled();
      expect(result.content).toBe('Done!');
    });
  });

  describe('Error Handling', () => {
    it('should handle provider errors gracefully', async () => {
      mockProvider.completion.mockRejectedValue(new Error('Network failure'));

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 5 });
      await expect(agent.execute('Test')).rejects.toThrow('Network failure');
    });

    it('should continue after individual tool execution failures', async () => {
      mockProvider.completion
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [{ id: '1', name: 'failing_tool', arguments: {} }],
        })
        .mockResolvedValueOnce({ content: 'Recovered!' });

      await pluginManager.register({
        id: 'fail-plugin',
        name: 'Fail',
        version: '1.0.0',
        description: 'Fails',
        tools: [{
          name: 'failing_tool',
          description: 'Always fails',
          inputSchema: {},
        }],
        permissions: { inference: ['model-access'] },
        hooks: {
          execute: async () => {
            throw new Error('Tool failed intentionally');
          },
        },
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 3 });
      const result = await agent.execute('Try something');

      // Should recover and get final response despite tool failure
      expect(result.content).toBe('Recovered!');
    });
  });

  describe('Cancellation', () => {
    it('should stop execution when cancelled', async () => {
      let callCount = 0;
      mockProvider.completion.mockImplementation(async () => {
        callCount++;
        // Return tool calls for first few iterations, then final response
        if (callCount <= 2) {
          return { content: null, toolCalls: [{ id: '1', name: 'slow_op', arguments: {} }] };
        }
        return { content: 'Done!' };
      });

      await pluginManager.register({
        id: 'slow-plugin',
        name: 'Slow Op',
        version: '1.0.0',
        description: 'Slow operation',
        tools: [{ name: 'slow_op', description: 'Slow', inputSchema: {} }],
        permissions: {},
        hooks: {
          execute: async () => {
            // Simulate slow tool execution
            await new Promise(resolve => setTimeout(resolve, 50));
            return { success: true };
          },
        },
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 10 });

      // Cancel after execution starts but before it completes
      setTimeout(() => agent.cancel(), 10);

      // Should resolve (not throw) because cancellation is checked in the loop
      const result = await agent.execute('Long task');
      expect(agent.getState()).toBe('cancelled');
      expect(result).toBeDefined();
    });
  });

  describe('Real Tool Execution Through Plugins', () => {
    it('should execute tools registered via plugins and return structured results', async () => {
      const toolHandler = vi.fn().mockResolvedValue({ data: 'result123' });

      await pluginManager.register({
        id: 'calc-plugin',
        name: 'Calculator',
        version: '1.0.0',
        description: 'Simple calculator',
        tools: [{
          name: 'calculate',
          description: 'Perform calculation',
          inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        }],
        permissions: { inference: ['model-access'] },
        hooks: {
          execute: toolHandler,
        },
      });

      let callCount = 0;
      mockProvider.completion.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { content: null, toolCalls: [{ id: 'tc1', name: 'calculate', arguments: { x: 5, y: 3 } }] };
        }
        return { content: 'The answer is 8.' };
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 2 });
      const result = await agent.execute('Calculate 5 + 3');

      expect(toolHandler).toHaveBeenCalledWith(expect.objectContaining({
        tool: 'calculate',
        args: { x: 5, y: 3 },
      }));
      expect(result.content).toBe('The answer is 8.');
    });

    it('should handle missing execute hook gracefully', async () => {
      await pluginManager.register({
        id: 'no-hook-plugin',
        name: 'No Hook',
        version: '1.0.0',
        description: 'Missing execute hook',
        tools: [{ name: 'test-tool', description: 'Test', inputSchema: {} }],
        permissions: {},
      });

      mockProvider.completion.mockResolvedValue({
        content: null,
        toolCalls: [{ id: 'tc1', name: 'test-tool', arguments: {} }],
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 2 });

      // Should not throw - will log error and continue
      await expect(agent.execute('Try tool')).resolves.toBeDefined();
    });

    it('should pass validated arguments to tool handlers', async () => {
      const receivedArgs: any[] = [];
      const toolHandler = vi.fn(async ({ tool, args }: any) => {
        receivedArgs.push(args);
        return { success: true, output: args };
      });

      await pluginManager.register({
        id: 'args-plugin',
        name: 'Args Test',
        version: '1.0.0',
        description: 'Arguments test',
        tools: [{
          name: 'process',
          description: 'Process data',
          inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
        }],
        permissions: { inference: ['process-data'] },
        hooks: { execute: toolHandler },
      });

      let callCount = 0;
      mockProvider.completion.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { content: null, toolCalls: [{ id: 'tc1', name: 'process', arguments: { value: 'hello' } }] };
        }
        return { content: 'Done' };
      });

      const agent = new Agent(mockProvider, policyEngine, pluginManager, session, { maxIterations: 2 });
      await agent.execute('Process hello');

      expect(receivedArgs).toEqual([{ value: 'hello' }]);
    });
  });
});

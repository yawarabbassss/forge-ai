import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../src/events/bus.js';
import {
  AgentStartEvent,
  LlmRequestEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '../src/events/types.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should register and trigger handlers', async () => {
    const handler = vi.fn();
    bus.on('test:event', handler);

    await bus.emit('test:event', { data: 'value' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ data: 'value' });
  });

  it('should support multiple handlers for same event', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('multi:event', handler1);
    bus.on('multi:event', handler2);

    await bus.emit('multi:event', { payload: 'test' });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith({ payload: 'test' });
    expect(handler2).toHaveBeenCalledWith({ payload: 'test' });
  });

  it('should allow unsubscribing from events', async () => {
    const handler = vi.fn();
    const unsubscribe = bus.on('unsubscribe:event', handler);

    unsubscribe();
    await bus.emit('unsubscribe:event', {});

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle async handlers', async () => {
    const handler = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'processed';
    });

    bus.on('async:event', handler);
    await bus.emit('async:event', {});

    expect(handler).toHaveBeenCalled();
  });

  it('should continue despite handler errors', async () => {
    const failingHandler = vi.fn(() => {
      throw new Error('handler error');
    });
    const succeedingHandler = vi.fn();

    bus.on('error:event', failingHandler);
    bus.on('error:event', succeedingHandler);

    await bus.emit('error:event', {});

    expect(failingHandler).toHaveBeenCalled();
    expect(succeedingHandler).toHaveBeenCalled();
  });

  it('should track listener count', () => {
    expect(bus.listenerCount('test')).toBe(0);

    bus.on('test', vi.fn());
    expect(bus.listenerCount('test')).toBe(1);

    bus.on('test', vi.fn());
    expect(bus.listenerCount('test')).toBe(2);
  });

  it('should clear all listeners', () => {
    bus.on('clear:test', vi.fn());
    bus.clear();
    expect(bus.listenerCount('clear:test')).toBe(0);
  });

  it('should emit without payload when undefined', async () => {
    const handler = vi.fn();
    bus.on('no-payload', handler);

    await bus.emit('no-payload');

    expect(handler).toHaveBeenCalledWith(undefined);
  });
});

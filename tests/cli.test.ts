import { describe, it, expect } from 'vitest';
import { parseCommand, isCommand } from '../src/cli/help.js';

describe('CLI Command Parsing', () => {
  describe('isCommand', () => {
    it('should identify command inputs', () => {
      expect(isCommand('/exit')).toBe(true);
      expect(isCommand('/help')).toBe(true);
      expect(isCommand('/session new')).toBe(true);
      expect(isCommand('hello')).toBe(false);
      expect(isCommand('')).toBe(false);
    });
  });

  describe('parseCommand', () => {
    it('should parse exit commands', () => {
      expect(parseCommand('/exit')).toEqual({ handled: true, command: 'exit', exit: true });
      expect(parseCommand('/quit')).toEqual({ handled: true, command: 'quit', exit: true });
      expect(parseCommand('/q')).toEqual({ handled: true, command: 'q', exit: true });
    });

    it('should parse help command', () => {
      expect(parseCommand('/help')).toEqual({ handled: true, command: 'help' });
    });

    it('should parse clear command', () => {
      expect(parseCommand('/clear')).toEqual({ handled: true, command: 'clear', clear: true });
    });

    it('should parse session commands', () => {
      expect(parseCommand('/session new')).toEqual({ handled: true, command: 'session', newSession: true });
      expect(parseCommand('/session list')).toEqual({ handled: true, command: 'session' });
      expect(parseCommand('/session switch id123')).toEqual({ handled: true, command: 'session', switchSession: 'id123' });
    });

    it('should parse plugin commands', () => {
      expect(parseCommand('/plugin list')).toEqual({ handled: true, command: 'plugin' });
      expect(parseCommand('/plugin l')).toEqual({ handled: true, command: 'plugin' });
    });

    it('should parse status command', () => {
      expect(parseCommand('/status')).toEqual({ handled: true, command: 'status' });
    });

    it('should return null for unknown commands', () => {
      expect(parseCommand('/unknown')).toBeNull();
      expect(parseCommand('some text')).toBeNull();
    });
  });
});

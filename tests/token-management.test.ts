import { describe, it, expect } from 'vitest';
import { Session } from '../src/core/session.js';

describe('Token Management & Context Trimming', () => {
  it('should trim messages exceeding token budget', () => {
    const session = new Session('trim-test');
    
    // Add messages with known lengths
    session.addMessage({ role: 'user', content: 'Short' });
    session.addMessage({ role: 'user', content: 'This is a longer message with more content' });
    session.addMessage({ role: 'user', content: 'Another medium length message here' });
    
    const originalLength = session.messages.length;
    const originalTokens = session.messages.reduce((sum, m) => sum + m.content.length, 0);
    
    // Trim to keep under 50 tokens
    session.trimTokens(50);
    
    // Verify some messages were removed
    const newTokens = session.messages.reduce((sum, m) => sum + m.content.length, 0);
    expect(newTokens).toBeLessThanOrEqual(50);
  });

  it('should not remove all messages if one exceeds budget', () => {
    const session = new Session('keep-one-test');
    session.addMessage({ role: 'user', content: 'Important content that must stay' });
    session.addMessage({ role: 'user', content: 'Can be trimmed' });
    
    session.trimTokens(10);
    
    // Should keep at least one message
    expect(session.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('should truncate messages by index', () => {
    const session = new Session('truncate-test');
    session.addMessage({ role: 'user', content: 'First' });
    session.addMessage({ role: 'user', content: 'Second' });
    session.addMessage({ role: 'user', content: 'Third' });
    
    session.truncate(1);
    
    expect(session.messages.length).toBe(2);
    expect(session.messages[0].content).toBe('Second');
  });

  it('should preserve metadata during operations', () => {
    const session = new Session('metadata-test', [], { title: 'My Session', tags: ['test'] });
    
    session.addMessage({ role: 'user', content: 'Test' });
    session.trimTokens(100);
    
    expect(session.metadata.title).toBe('My Session');
    expect(session.metadata.tags).toEqual(['test']);
  });
});

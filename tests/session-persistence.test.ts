import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb } from '../src/data/db.js';

describe('Session Persistence in SQLite', () => {
  let db: any;

  beforeAll(async () => {
    db = await initDb();
  });

  afterAll(async () => {
    if (db) {
      await db.exec('DELETE FROM messages');
      await db.exec('DELETE FROM sessions');
      await db.close();
    }
  });

  it('should persist session creation to SQLite', async () => {
    const sessionId = 'persist-test-' + Date.now();
    await db.run('INSERT INTO sessions (id) VALUES (?)', sessionId);
    
    const session = await db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
    expect(session).toBeDefined();
    expect(session.id).toBe(sessionId);
  });

  it('should persist messages for a session', async () => {
    const sessionId = 'msg-test-' + Date.now();
    await db.run('INSERT INTO sessions (id) VALUES (?)', sessionId);
    
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    for (const msg of messages) {
      await db.run(
        'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
        sessionId,
        msg.role,
        msg.content
      );
    }

    const retrieved = await db.all('SELECT * FROM messages WHERE session_id = ?', sessionId);
    expect(retrieved).toHaveLength(2);
    expect(retrieved[0].role).toBe('user');
    expect(retrieved[1].content).toBe('Hi there!');
  });

  it('should update message timestamps automatically', async () => {
    const sessionId = 'ts-test-' + Date.now();
    await db.run('INSERT INTO sessions (id) VALUES (?)', sessionId);
    
    await db.run('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)', 
      sessionId, 'user', 'test');
    
    const msg = await db.get('SELECT created_at FROM messages WHERE session_id = ?', sessionId);
    expect(msg.created_at).toBeDefined();
    expect(typeof msg.created_at).toBe('string');
  });
});

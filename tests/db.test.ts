import { describe, it, expect } from 'vitest';
import { initDb } from '../src/data/db.js';

describe('Database', () => {
  it('should initialize tables', async () => {
    const db = await initDb();
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.some((t: any) => t.name === 'sessions')).toBe(true);
    expect(tables.some((t: any) => t.name === 'messages')).toBe(true);
    await db.close();
  });
});

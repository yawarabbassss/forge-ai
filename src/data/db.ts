import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { logger } from '../utils/logger.js';

const dbPath = process.env.DATABASE_PATH || 'forge.db';

let _db: Awaited<ReturnType<typeof open>> | null = null;

export const initDb = async () => {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  // Seed existing in-memory sessions into SQLite
  _db = db;
  logger.info(`Database initialized at ${dbPath}`);
  return db;
};

/** Return the active database connection after initDb() has been called. */
export const getDb = () => {
  if (!_db) throw new Error('Database not initialised — call initDb() first');
  return _db;
};

/** Persist a session record (insert or update). */
export const persistSession = async (id: string, title?: string): Promise<void> => {
  const db = getDb();
  await db.run(
    `INSERT OR REPLACE INTO sessions (id, title, updated_at) VALUES (?, ?, datetime('now'))`,
    [id, title ?? null],
  );
};

/** Persist a single message inside a session. */
export const persistMessage = async (
  sessionId: string,
  role: string,
  content: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> => {
  const db = getDb();
  await db.run(
    `INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    [sessionId, role, content, metadata ? JSON.stringify(metadata) : null],
  );
};

/** List recent sessions from the database. */
export const listSessions = async (): Promise<Array<{ id: string; title?: string; created_at: string }>> => {
  const db = getDb();
  return db.all(`SELECT id, title, created_at FROM sessions ORDER BY created_at DESC LIMIT 50`);
};

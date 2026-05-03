import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, nowIso, randomId, sha256 } from './util.js';
import type { AuthContext, Scope } from './types.js';

export type Db = Database.Database;

export const openDatabase = (databasePath: string): Db => {
  ensureDir(path.dirname(databasePath));
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
};

const migrate = (db: Db): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      file_path TEXT NOT NULL,
      section TEXT,
      project TEXT,
      tags TEXT,
      status TEXT NOT NULL DEFAULT 'canonical',
      source_app TEXT,
      reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_chunks (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
      chunk_text,
      title,
      file_path,
      tags,
      content=''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      source_app TEXT,
      action TEXT NOT NULL,
      target_file TEXT,
      input_json TEXT NOT NULL,
      result_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memories_file_path ON memories(file_path);
    CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_memory ON memory_chunks(memory_id);
  `);
};

export const bootstrapAdminClient = (db: Db, adminToken?: string): void => {
  if (!adminToken) return;
  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get('admin') as { id: string } | undefined;
  if (existing) return;
  createClient(db, {
    id: 'admin',
    name: 'Local Admin',
    token: adminToken,
    scopes: ['memory:read', 'memory:write', 'memory:propose', 'memory:admin']
  });
};

export const createClient = (
  db: Db,
  input: { id?: string; name: string; token: string; scopes: Scope[] }
): { id: string; name: string; scopes: Scope[] } => {
  const id = input.id ?? randomId('client');
  const timestamp = nowIso();
  db.prepare(
    `INSERT OR REPLACE INTO clients (id, name, token_hash, scopes, created_at, last_used_at)
     VALUES (@id, @name, @token_hash, @scopes, @created_at, NULL)`
  ).run({
    id,
    name: input.name,
    token_hash: sha256(input.token),
    scopes: input.scopes.join(','),
    created_at: timestamp
  });
  return { id, name: input.name, scopes: input.scopes };
};

export const authenticateToken = (db: Db, token: string): AuthContext | null => {
  const row = db
    .prepare('SELECT id, name, scopes FROM clients WHERE token_hash = ?')
    .get(sha256(token)) as { id: string; name: string; scopes: string } | undefined;
  if (!row) return null;
  db.prepare('UPDATE clients SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
  return {
    clientId: row.id,
    clientName: row.name,
    scopes: row.scopes.split(',').map((scope) => scope.trim()).filter(Boolean) as Scope[]
  };
};

export const exportSchema = (dbPath: string, outputFile: string): void => {
  const db = openDatabase(dbPath);
  const rows = db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name").all() as Array<{ sql: string }>;
  fs.writeFileSync(outputFile, rows.map((row) => `${row.sql};`).join('\n\n'), 'utf8');
  db.close();
};

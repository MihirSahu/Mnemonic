import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, nowIso, randomId, sha256 } from './util';
import type { AuthContext, Scope } from './types';

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

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_memories_file_path ON memories(file_path);
    CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_memory ON memory_chunks(memory_id);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_client ON admin_sessions(client_id);
  `);
  migrateFtsTable(db);
};

const createFtsTable = (db: Db): void => {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
      chunk_text,
      title,
      file_path,
      tags
    );
  `);
};

const populateFtsFromChunks = (db: Db): void => {
  db.prepare(
    `INSERT INTO memory_chunks_fts (rowid, chunk_text, title, file_path, tags)
     SELECT c.rowid, c.chunk_text, m.title, c.file_path, COALESCE(m.tags, '')
     FROM memory_chunks c
     JOIN memories m ON m.id = c.memory_id`
  ).run();
};

const migrateFtsTable = (db: Db): void => {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memory_chunks_fts'")
    .get() as { sql: string } | undefined;

  if (!row) {
    createFtsTable(db);
    populateFtsFromChunks(db);
    return;
  }

  if (/content\s*=\s*(['"])\s*\1/i.test(row.sql)) {
    db.exec('DROP TABLE memory_chunks_fts;');
    createFtsTable(db);
    populateFtsFromChunks(db);
  }
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
    `INSERT INTO clients (id, name, token_hash, scopes, created_at, last_used_at)
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

export type ClientRow = {
  id: string;
  name: string;
  scopes: Scope[];
  created_at: string;
  last_used_at: string | null;
};

const mapClientRow = (row: { id: string; name: string; scopes: string; created_at: string; last_used_at: string | null }): ClientRow => ({
  id: row.id,
  name: row.name,
  scopes: row.scopes.split(',').map((scope) => scope.trim()).filter(Boolean) as Scope[],
  created_at: row.created_at,
  last_used_at: row.last_used_at
});

export const listClients = (db: Db): ClientRow[] => {
  const rows = db
    .prepare('SELECT id, name, scopes, created_at, last_used_at FROM clients ORDER BY created_at ASC, name ASC')
    .all() as Array<{ id: string; name: string; scopes: string; created_at: string; last_used_at: string | null }>;
  return rows.map(mapClientRow);
};

export const getClientById = (db: Db, id: string): ClientRow | null => {
  const row = db
    .prepare('SELECT id, name, scopes, created_at, last_used_at FROM clients WHERE id = ?')
    .get(id) as { id: string; name: string; scopes: string; created_at: string; last_used_at: string | null } | undefined;
  return row ? mapClientRow(row) : null;
};

export const updateClient = (db: Db, input: { id: string; name: string; scopes: Scope[] }): ClientRow => {
  db.prepare('UPDATE clients SET name = ?, scopes = ? WHERE id = ?').run(input.name, input.scopes.join(','), input.id);
  const client = getClientById(db, input.id);
  if (!client) throw new Error('Client not found.');
  return client;
};

export const rotateClientToken = (db: Db, input: { id: string; token: string }): void => {
  db.prepare('UPDATE clients SET token_hash = ? WHERE id = ?').run(sha256(input.token), input.id);
};

export const deleteClient = (db: Db, id: string): void => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
};

export const countAdminClients = (db: Db, exceptId?: string): number => {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM clients
      WHERE instr(',' || scopes || ',', ',memory:admin,') > 0
      ${exceptId ? 'AND id != @exceptId' : ''}
    `)
    .get({ exceptId }) as { count: number };
  return row.count;
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

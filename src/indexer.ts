import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.js';
import type { SearchFilters } from './types.js';
import { chunkMarkdown, parseMemoryFile, walkMarkdownFiles } from './markdown.js';
import { nowIso, parseCsv, randomId, relativeTo, sha256, tagsToString } from './util.js';

const memoryIdForFile = (relativePath: string): string => `mem_${sha256(relativePath).slice(0, 24)}`;
const chunkIdForFile = (relativePath: string, index: number): string => `chunk_${sha256(`${relativePath}:${index}`).slice(0, 24)}`;

export const indexFile = (db: Db, vaultPath: string, filePath: string): void => {
  const parsed = parseMemoryFile(vaultPath, filePath);
  const timestamp = nowIso();
  const id = memoryIdForFile(parsed.relativePath);

  db.prepare(
    `INSERT INTO memories
      (id, type, title, content, file_path, section, project, tags, status, source_app, reason, created_at, updated_at)
     VALUES
      (@id, @type, @title, @content, @file_path, NULL, @project, @tags, @status, NULL, 'indexed from markdown', @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      content = excluded.content,
      file_path = excluded.file_path,
      project = excluded.project,
      tags = excluded.tags,
      status = excluded.status,
      updated_at = excluded.updated_at`
  ).run({
    id,
    type: parsed.type,
    title: parsed.title,
    content: parsed.content,
    file_path: parsed.relativePath,
    project: parsed.project ?? null,
    tags: tagsToString(parsed.tags),
    status: parsed.status,
    created_at: timestamp,
    updated_at: timestamp
  });

  const oldRows = db.prepare('SELECT rowid FROM memory_chunks WHERE memory_id = ?').all(id) as Array<{ rowid: number }>;
  const deleteFts = db.prepare('DELETE FROM memory_chunks_fts WHERE rowid = ?');
  for (const row of oldRows) deleteFts.run(row.rowid);
  db.prepare('DELETE FROM memory_chunks WHERE memory_id = ?').run(id);

  const chunks = chunkMarkdown(parsed.content);
  const insertChunk = db.prepare(
    `INSERT INTO memory_chunks (id, memory_id, chunk_text, chunk_index, file_path, created_at, updated_at)
     VALUES (@id, @memory_id, @chunk_text, @chunk_index, @file_path, @created_at, @updated_at)`
  );
  const insertFts = db.prepare(
    `INSERT INTO memory_chunks_fts (rowid, chunk_text, title, file_path, tags)
     VALUES (@rowid, @chunk_text, @title, @file_path, @tags)`
  );

  for (let i = 0; i < chunks.length; i += 1) {
    const chunkId = chunkIdForFile(parsed.relativePath, i);
    const result = insertChunk.run({
      id: chunkId,
      memory_id: id,
      chunk_text: chunks[i],
      chunk_index: i,
      file_path: parsed.relativePath,
      created_at: timestamp,
      updated_at: timestamp
    });
    insertFts.run({
      rowid: result.lastInsertRowid,
      chunk_text: chunks[i],
      title: parsed.title,
      file_path: parsed.relativePath,
      tags: tagsToString(parsed.tags)
    });
  }
};

export const reindexVault = (db: Db, vaultPath: string): { filesIndexed: number; chunksIndexed: number } => {
  const files = walkMarkdownFiles(vaultPath);
  const tx = db.transaction(() => {
    db.exec('DELETE FROM memory_chunks_fts; DELETE FROM memory_chunks; DELETE FROM memories;');
    for (const filePath of files) {
      indexFile(db, vaultPath, filePath);
    }
  });
  tx();
  const chunks = db.prepare('SELECT COUNT(*) AS count FROM memory_chunks').get() as { count: number };
  return { filesIndexed: files.length, chunksIndexed: chunks.count };
};

const ftsQuery = (query: string): string => {
  const tokens = query
    .toLowerCase()
    .match(/[a-z0-9_\-]{2,}/g)
    ?.slice(0, 12);
  if (!tokens?.length) return 'memory';
  return tokens.map((token) => `${token.replace(/"/g, '""')}*`).join(' OR ');
};

export type SearchResult = {
  id: string;
  title: string;
  content: string;
  chunk: string;
  file_path: string;
  score: number;
  tags: string[];
  type: string;
  project?: string | null;
  status: string;
  updated_at: string;
};

export const searchMemory = (db: Db, filters: SearchFilters & { defaultLimit: number }): SearchResult[] => {
  const limit = Math.min(Math.max(filters.limit ?? filters.defaultLimit, 1), 25);
  const where: string[] = [];
  const params: Record<string, unknown> = { query: ftsQuery(filters.query), limit };

  if (!filters.include_pending) {
    where.push("m.status = 'canonical'");
  }
  if (filters.scope && filters.scope !== 'all' && filters.scope !== 'global') {
    const typeMap: Record<string, string> = {
      project: 'project_context',
      preference: 'preference',
      decision: 'decision',
      person: 'person',
      profile: 'profile'
    };
    params.scopeType = typeMap[filters.scope] ?? filters.scope;
    where.push('m.type = @scopeType');
  }
  if (filters.project) {
    params.project = filters.project;
    where.push('m.project = @project');
  }

  const whereSql = where.length ? `AND ${where.join(' AND ')}` : '';
  const stmt = db.prepare(`
    SELECT
      m.id,
      m.title,
      m.content,
      c.chunk_text AS chunk,
      m.file_path,
      bm25(memory_chunks_fts) * -1 AS score,
      m.tags,
      m.type,
      m.project,
      m.status,
      m.updated_at
    FROM memory_chunks_fts
    JOIN memory_chunks c ON c.rowid = memory_chunks_fts.rowid
    JOIN memories m ON m.id = c.memory_id
    WHERE memory_chunks_fts MATCH @query
    ${whereSql}
    ORDER BY score DESC
    LIMIT @limit
  `);

  try {
    const rows = stmt.all(params) as Array<Omit<SearchResult, 'tags'> & { tags: string | null }>;
    return rows.map((row) => ({ ...row, tags: parseCsv(row.tags) }));
  } catch {
    const fallback = db.prepare(`
      SELECT
        m.id,
        m.title,
        m.content,
        c.chunk_text AS chunk,
        m.file_path,
        0 AS score,
        m.tags,
        m.type,
        m.project,
        m.status,
        m.updated_at
      FROM memory_chunks c
      JOIN memories m ON m.id = c.memory_id
      WHERE LOWER(c.chunk_text || ' ' || m.title || ' ' || m.file_path) LIKE @like
      ${whereSql}
      ORDER BY m.updated_at DESC
      LIMIT @limit
    `);
    const rows = fallback.all({ ...params, like: `%${filters.query.toLowerCase()}%` }) as Array<Omit<SearchResult, 'tags'> & { tags: string | null }>;
    return rows.map((row) => ({ ...row, tags: parseCsv(row.tags) }));
  }
};

export const getMemoryByIdOrPath = (
  db: Db,
  vaultPath: string,
  input: { id?: string; file_path?: string }
): { id: string; title: string; content: string; file_path: string; metadata: Record<string, unknown> } | null => {
  let row: any;
  if (input.id) {
    row = db.prepare('SELECT * FROM memories WHERE id = ?').get(input.id);
  } else if (input.file_path) {
    row = db.prepare('SELECT * FROM memories WHERE file_path = ?').get(input.file_path);
  }
  if (!row) return null;

  const fullPath = path.resolve(vaultPath, row.file_path);
  const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : row.content;
  return {
    id: row.id,
    title: row.title,
    content,
    file_path: row.file_path,
    metadata: {
      type: row.type,
      project: row.project,
      tags: parseCsv(row.tags),
      status: row.status,
      source_app: row.source_app,
      reason: row.reason,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  };
};

export const listMemoryFiles = (db: Db, scope?: string): Array<{ file_path: string; title: string; updated_at: string; type: string; status: string }> => {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (scope && scope !== 'all') {
    params.scope = scope;
    where.push('type = @scope OR status = @scope');
  }
  const stmt = db.prepare(`
    SELECT file_path, title, updated_at, type, status
    FROM memories
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY updated_at DESC, file_path ASC
  `);
  return stmt.all(params) as Array<{ file_path: string; title: string; updated_at: string; type: string; status: string }>;
};

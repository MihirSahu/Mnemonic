import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import {
  countAdminClients,
  createClient,
  deleteClient,
  getClientById,
  listClients,
  rotateClientToken,
  updateClient
} from './db';
import { appendSection } from './markdown';
import { indexFile, reindexVault, searchMemory } from './indexer';
import { config } from './config';
import type { AuthContext, Scope } from './types';
import { nowIso, randomId, relativeTo, safeJoin, sha256 } from './util';
import { MemoryService } from './service';

export const ADMIN_SESSION_COOKIE = 'mnemonic_admin_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const VALID_SCOPES: Scope[] = ['memory:read', 'memory:write', 'memory:propose', 'memory:admin'];

export type AdminSession = {
  id: string;
  clientId: string;
  clientName: string;
  scopes: Scope[];
  expiresAt: string;
};

const generateToken = (): string => crypto.randomBytes(32).toString('base64url');

export const sanitizeScopes = (scopes: unknown): Scope[] => {
  if (!Array.isArray(scopes)) throw new Error('Scopes must be an array.');
  const unique = [...new Set(scopes.map(String))] as Scope[];
  if (!unique.length) throw new Error('At least one scope is required.');
  for (const scope of unique) {
    if (!VALID_SCOPES.includes(scope)) throw new Error(`Invalid scope: ${scope}`);
  }
  return unique;
};

export const createAdminSession = (db: Db, auth: AuthContext): { token: string; session: AdminSession } => {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const id = randomId('session');
  db.prepare(
    `INSERT INTO admin_sessions (id, client_id, token_hash, created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, auth.clientId, sha256(token), now.toISOString(), expiresAt, now.toISOString());
  return {
    token,
    session: {
      id,
      clientId: auth.clientId,
      clientName: auth.clientName,
      scopes: auth.scopes,
      expiresAt
    }
  };
};

export const getAdminSession = (db: Db, token: string | undefined): AdminSession | null => {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.id, s.client_id, s.expires_at, c.name, c.scopes
       FROM admin_sessions s
       JOIN clients c ON c.id = s.client_id
       WHERE s.token_hash = ?`
    )
    .get(sha256(token)) as
    | { id: string; client_id: string; expires_at: string; name: string; scopes: string }
    | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(row.id);
    return null;
  }
  const scopes = row.scopes.split(',').map((scope) => scope.trim()).filter(Boolean) as Scope[];
  if (!scopes.includes('memory:admin')) return null;
  db.prepare('UPDATE admin_sessions SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.name,
    scopes,
    expiresAt: row.expires_at
  };
};

export const deleteAdminSession = (db: Db, token: string | undefined): void => {
  if (!token) return;
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token));
};

export const listAdminClients = (db: Db) => listClients(db);

export const createAdminClient = (
  db: Db,
  input: { id?: string; name: string; scopes: Scope[] }
): { client: ReturnType<typeof createClient>; token: string } => {
  if (input.id && getClientById(db, input.id)) throw new Error('Client id already exists.');
  const token = generateToken();
  const client = createClient(db, {
    id: input.id,
    name: input.name.trim(),
    scopes: input.scopes,
    token
  });
  return { client, token };
};

export const updateAdminClient = (
  db: Db,
  currentClientId: string,
  input: { id: string; name: string; scopes: Scope[] }
) => {
  const existing = getClientById(db, input.id);
  if (!existing) throw new Error('Client not found.');
  if (existing.scopes.includes('memory:admin') && !input.scopes.includes('memory:admin')) {
    if (countAdminClients(db, input.id) === 0) throw new Error('Cannot remove the last admin client.');
    if (input.id === currentClientId) throw new Error('Cannot remove admin access from your current client.');
  }
  return updateClient(db, { id: input.id, name: input.name.trim(), scopes: input.scopes });
};

export const rotateAdminClientToken = (db: Db, id: string): { token: string } => {
  const existing = getClientById(db, id);
  if (!existing) throw new Error('Client not found.');
  const token = generateToken();
  rotateClientToken(db, { id, token });
  return { token };
};

export const deleteAdminClient = (db: Db, currentClientId: string, id: string): void => {
  const existing = getClientById(db, id);
  if (!existing) throw new Error('Client not found.');
  if (id === currentClientId) throw new Error('Cannot delete the client used by your current admin session.');
  if (existing.scopes.includes('memory:admin') && countAdminClients(db, id) === 0) {
    throw new Error('Cannot delete the last admin client.');
  }
  deleteClient(db, id);
};

export const listAuditLog = (db: Db, input: { limit?: number; offset?: number }) => {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  return db
    .prepare(
      `SELECT id, tool_name, source_app, action, target_file, input_json, result_json, created_at
       FROM audit_log
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
};

export const getSystemStatus = (db: Db) => {
  const memoryCount = db.prepare('SELECT COUNT(*) AS count FROM memories').get() as { count: number };
  const chunkCount = db.prepare('SELECT COUNT(*) AS count FROM memory_chunks').get() as { count: number };
  const clientCount = db.prepare('SELECT COUNT(*) AS count FROM clients').get() as { count: number };
  const pendingCount = db.prepare("SELECT COUNT(*) AS count FROM memories WHERE status = 'pending'").get() as { count: number };
  return {
    name: 'personal-memory-mcp',
    publicUrl: config.publicUrl,
    vaultPath: config.vaultPath,
    databasePath: config.databasePath,
    gitEnabled: config.gitEnabled,
    defaultSearchLimit: config.defaultSearchLimit,
    memoryCount: memoryCount.count,
    chunkCount: chunkCount.count,
    clientCount: clientCount.count,
    pendingFileCount: pendingCount.count
  };
};

export const searchAdminMemory = (db: Db, input: { query: string; scope?: string; project?: string; limit?: number; include_pending?: boolean }) =>
  searchMemory(db, { ...input, defaultLimit: config.defaultSearchLimit });

type PendingProposal = {
  id: string;
  title: string;
  type?: string;
  project?: string;
  sourceApp?: string;
  confidence?: string;
  suggestedDestination?: string;
  tags: string[];
  reason?: string;
  content: string;
  rawSection: string;
  start: number;
  end: number;
};

const pendingPath = (vaultPath: string) => safeJoin(vaultPath, 'inbox/pending.md');

const parseMetadata = (body: string): { metadata: Record<string, string>; content: string } => {
  const lines = body.trim().split('\n');
  const metadata: Record<string, string> = {};
  let contentStart = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      contentStart = i + 1;
      break;
    }
    const match = /^-\s+([^:]+):\s*(.*)$/.exec(line);
    if (!match) {
      contentStart = i;
      break;
    }
    metadata[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return { metadata, content: lines.slice(contentStart).join('\n').trim() };
};

export const listPendingProposals = (vaultPath: string): PendingProposal[] => {
  const filePath = pendingPath(vaultPath);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const headings = [...raw.matchAll(/^##\s+(.+)$/gm)];
  const contentCounts = new Map<string, number>();
  return headings.map((heading, index) => {
    const title = heading[1].trim();
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? raw.length;
    const rawSection = raw.slice(start, end).trimEnd();
    const contentHash = sha256(rawSection).slice(0, 24);
    const occurrence = contentCounts.get(contentHash) ?? 0;
    contentCounts.set(contentHash, occurrence + 1);
    const body = rawSection.slice(heading[0].length).trimStart();
    const { metadata, content } = parseMetadata(body);
    return {
      id: occurrence === 0 ? contentHash : `${contentHash}-${occurrence + 1}`,
      title,
      type: metadata.type,
      project: metadata.project,
      sourceApp: metadata['source app'],
      confidence: metadata.confidence,
      suggestedDestination: metadata['suggested destination'],
      tags: metadata.tags ? metadata.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      reason: metadata.reason,
      content,
      rawSection,
      start,
      end
    };
  });
};

const removePendingSection = (vaultPath: string, proposal: PendingProposal): void => {
  const filePath = pendingPath(vaultPath);
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.slice(proposal.start, proposal.end).trimEnd() !== proposal.rawSection) {
    throw new Error('Pending proposals changed. Refresh and try again.');
  }
  const next = `${raw.slice(0, proposal.start)}${raw.slice(proposal.end)}`
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
  fs.writeFileSync(filePath, next, 'utf8');
};

const findPendingProposal = (vaultPath: string, id: string): PendingProposal => {
  const proposal = listPendingProposals(vaultPath).find((item) => item.id === id);
  if (!proposal) throw new Error('Pending proposal not found.');
  return proposal;
};

const validatePendingDestination = (destination: string): void => {
  if (!destination.endsWith('.md')) throw new Error('Pending proposal destination must be a Markdown file.');
  if (fs.existsSync(destination) && fs.statSync(destination).isDirectory()) {
    throw new Error('Pending proposal destination cannot be a directory.');
  }
  const parent = path.dirname(destination);
  if (fs.existsSync(parent) && !fs.statSync(parent).isDirectory()) {
    throw new Error('Pending proposal destination parent must be a directory.');
  }
};

export const approvePendingProposal = (db: Db, service: MemoryService, vaultPath: string, id: string) => {
  const proposal = findPendingProposal(vaultPath, id);
  if (!proposal.suggestedDestination) throw new Error('Pending proposal is missing a suggested destination.');
  const destination = safeJoin(vaultPath, proposal.suggestedDestination);
  validatePendingDestination(destination);
  removePendingSection(vaultPath, proposal);
  appendSection(destination, proposal.title, [
    `- Approved at: ${nowIso()}`,
    `- Source app: ${proposal.sourceApp ?? 'unknown'}`,
    proposal.reason ? `- Reason: ${proposal.reason}` : undefined,
    proposal.tags.length ? `- Tags: ${proposal.tags.join(', ')}` : undefined,
    '',
    proposal.content
  ].filter((line) => line !== undefined).join('\n'));
  indexFile(db, vaultPath, destination);
  indexFile(db, vaultPath, pendingPath(vaultPath));
  const relativePath = relativeTo(vaultPath, destination);
  service.recordAudit('approve_pending_memory', 'admin-ui', 'write', relativePath, { id }, { file_path: relativePath });
  service.commitVaultChange(`memory: approve pending ${proposal.id}`);
  return { status: 'approved' as const, file_path: relativePath };
};

export const dismissPendingProposal = (db: Db, service: MemoryService, vaultPath: string, id: string) => {
  const proposal = findPendingProposal(vaultPath, id);
  const archivePath = safeJoin(vaultPath, 'archive/pending-dismissed.md');
  removePendingSection(vaultPath, proposal);
  appendSection(archivePath, `Dismissed ${proposal.title}`, proposal.rawSection.replace(/^##\s+.+\n/, '').trim());
  indexFile(db, vaultPath, archivePath);
  indexFile(db, vaultPath, pendingPath(vaultPath));
  const relativePath = relativeTo(vaultPath, archivePath);
  service.recordAudit('dismiss_pending_memory', 'admin-ui', 'archive', relativePath, { id }, { file_path: relativePath });
  service.commitVaultChange(`memory: dismiss pending ${proposal.id}`);
  return { status: 'dismissed' as const, file_path: relativePath };
};

export const runAdminReindex = (db: Db, service: MemoryService, vaultPath: string) => {
  const result = reindexVault(db, vaultPath);
  service.recordAudit('admin_reindex_memory', 'admin-ui', 'reindex', undefined, {}, result);
  return result;
};

export const getVaultFile = (db: Db, vaultPath: string, filePath: string) => {
  const fullPath = safeJoin(vaultPath, filePath);
  if (!fullPath.endsWith('.md')) throw new Error('Only Markdown files can be read.');
  if (!fs.existsSync(fullPath)) throw new Error('Memory file not found.');
  const row = db.prepare('SELECT title, type, status, updated_at FROM memories WHERE file_path = ?').get(filePath);
  return {
    file_path: filePath,
    content: fs.readFileSync(fullPath, 'utf8'),
    metadata: row ?? null
  };
};

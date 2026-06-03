import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { NextResponse } from 'next/server';
import {
  approvePendingProposal,
  createAdminClient,
  createAdminSession,
  deleteAdminSession,
  deleteAdminClient,
  dismissPendingProposal,
  getAdminSession,
  listPendingProposals,
  updateAdminClient
} from './admin';
import { createClient, openDatabase } from './db';
import { indexFile } from './indexer';
import { initializeVault } from './markdown';
import { MemoryService } from './service';
import { setSessionCookie } from './web';

const makeFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemonic-admin-test-'));
  const vaultPath = path.join(root, 'memory');
  const db = openDatabase(path.join(root, 'memory.db'));
  initializeVault(vaultPath);
  const service = new MemoryService(db, { vaultPath, gitEnabled: false, defaultSearchLimit: 8 });
  service.init();
  return { root, vaultPath, db, service };
};

test('admin sessions are created, resolved, and deleted by token hash', () => {
  const { db } = makeFixture();
  const client = createClient(db, {
    id: 'admin',
    name: 'Admin',
    token: 'secret',
    scopes: ['memory:read', 'memory:admin']
  });
  const { token, session } = createAdminSession(db, {
    clientId: client.id,
    clientName: client.name,
    scopes: client.scopes
  });

  assert.equal(session.clientId, 'admin');
  assert.equal(getAdminSession(db, token)?.clientName, 'Admin');
  assert.equal(getAdminSession(db, 'wrong'), null);

  db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(session.id);
  assert.equal(getAdminSession(db, token), null);
});

test('expired admin sessions are rejected and removed', () => {
  const { db } = makeFixture();
  const client = createClient(db, {
    id: 'admin',
    name: 'Admin',
    token: 'secret',
    scopes: ['memory:read', 'memory:admin']
  });
  const { token, session } = createAdminSession(db, {
    clientId: client.id,
    clientName: client.name,
    scopes: client.scopes
  });

  db.prepare('UPDATE admin_sessions SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), session.id);

  assert.equal(getAdminSession(db, token), null);
  const row = db.prepare('SELECT id FROM admin_sessions WHERE id = ?').get(session.id);
  assert.equal(row, undefined);
});

test('admin logout deletes only the matching session token', () => {
  const { db } = makeFixture();
  const client = createClient(db, {
    id: 'admin',
    name: 'Admin',
    token: 'secret',
    scopes: ['memory:read', 'memory:admin']
  });
  const first = createAdminSession(db, {
    clientId: client.id,
    clientName: client.name,
    scopes: client.scopes
  });
  const second = createAdminSession(db, {
    clientId: client.id,
    clientName: client.name,
    scopes: client.scopes
  });

  deleteAdminSession(db, first.token);

  assert.equal(getAdminSession(db, first.token), null);
  assert.equal(getAdminSession(db, second.token)?.id, second.session.id);
});

test('client guards prevent deleting or demoting the active or last admin client', () => {
  const { db } = makeFixture();
  createClient(db, {
    id: 'admin',
    name: 'Admin',
    token: 'secret',
    scopes: ['memory:read', 'memory:admin']
  });

  assert.throws(
    () => updateAdminClient(db, 'admin', { id: 'admin', name: 'Admin', scopes: ['memory:read'] }),
    /Cannot remove/
  );
  assert.throws(() => deleteAdminClient(db, 'admin', 'admin'), /current admin session/);

  createAdminClient(db, { id: 'backup', name: 'Backup', scopes: ['memory:admin'] });
  assert.doesNotThrow(() => updateAdminClient(db, 'backup', { id: 'admin', name: 'Admin', scopes: ['memory:read'] }));
});

test('last admin guard ignores scope names that merely contain memory:admin', () => {
  const { db } = makeFixture();
  createClient(db, {
    id: 'admin',
    name: 'Admin',
    token: 'secret',
    scopes: ['memory:read', 'memory:admin']
  });
  createClient(db, {
    id: 'almost-admin',
    name: 'Almost Admin',
    token: 'other-secret',
    scopes: ['memory:administrator' as never]
  });

  assert.throws(
    () => updateAdminClient(db, 'backup', { id: 'admin', name: 'Admin', scopes: ['memory:read'] }),
    /last admin/
  );
});

test('admin client creation rejects duplicate ids instead of replacing existing clients', () => {
  const { db } = makeFixture();
  createClient(db, {
    id: 'admin',
    name: 'Admin',
    token: 'secret',
    scopes: ['memory:read', 'memory:admin']
  });

  assert.throws(
    () => createAdminClient(db, { id: 'admin', name: 'Replacement', scopes: ['memory:read'] }),
    /already exists/
  );

  const admin = db.prepare('SELECT name, scopes FROM clients WHERE id = ?').get('admin') as { name: string; scopes: string };
  assert.equal(admin.name, 'Admin');
  assert.equal(admin.scopes, 'memory:read,memory:admin');
});

test('client creation helper rejects duplicate ids instead of replacing existing clients', () => {
  const { db } = makeFixture();
  createClient(db, {
    id: 'admin',
    name: 'Admin',
    token: 'secret',
    scopes: ['memory:read', 'memory:admin']
  });

  assert.throws(
    () => createClient(db, { id: 'admin', name: 'Replacement', token: 'new-secret', scopes: ['memory:read'] }),
    /UNIQUE constraint failed/
  );

  const admin = db.prepare('SELECT name, scopes FROM clients WHERE id = ?').get('admin') as { name: string; scopes: string };
  assert.equal(admin.name, 'Admin');
  assert.equal(admin.scopes, 'memory:read,memory:admin');
});

test('opening an existing database does not clear FTS rows', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemonic-admin-test-'));
  const vaultPath = path.join(root, 'memory');
  const dbPath = path.join(root, 'memory.db');
  const db = openDatabase(dbPath);
  initializeVault(vaultPath);
  const service = new MemoryService(db, { vaultPath, gitEnabled: false, defaultSearchLimit: 8 });
  service.init();
  const before = db.prepare('SELECT COUNT(*) AS count FROM memory_chunks_fts').get() as { count: number };
  assert.ok(before.count > 0);
  db.close();

  const reopened = openDatabase(dbPath);
  const after = reopened.prepare('SELECT COUNT(*) AS count FROM memory_chunks_fts').get() as { count: number };
  reopened.close();

  assert.equal(after.count, before.count);
});

test('opening an existing database migrates old contentless FTS without losing rows', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemonic-admin-test-'));
  const vaultPath = path.join(root, 'memory');
  const dbPath = path.join(root, 'memory.db');
  const db = openDatabase(dbPath);
  initializeVault(vaultPath);
  const service = new MemoryService(db, { vaultPath, gitEnabled: false, defaultSearchLimit: 8 });
  service.init();
  const before = db.prepare('SELECT COUNT(*) AS count FROM memory_chunks_fts').get() as { count: number };
  assert.ok(before.count > 0);
  db.exec(`
    DROP TABLE memory_chunks_fts;
    CREATE VIRTUAL TABLE memory_chunks_fts USING fts5(
      chunk_text,
      title,
      file_path,
      tags,
      content=''
    );
  `);
  db.prepare(
    `INSERT INTO memory_chunks_fts (rowid, chunk_text, title, file_path, tags)
     SELECT c.rowid, c.chunk_text, m.title, c.file_path, COALESCE(m.tags, '')
     FROM memory_chunks c
     JOIN memories m ON m.id = c.memory_id`
  ).run();
  db.close();

  const reopened = openDatabase(dbPath);
  const after = reopened.prepare('SELECT COUNT(*) AS count FROM memory_chunks_fts').get() as { count: number };
  assert.equal(after.count, before.count);
  assert.doesNotThrow(() => indexFile(reopened, vaultPath, path.join(vaultPath, 'MEMORY.md')));
  reopened.close();
});

test('admin session cookie is not marked secure for HTTP public URLs', () => {
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, 'token', new Date(Date.now() + 1000).toISOString());

  assert.doesNotMatch(response.headers.get('set-cookie') ?? '', /;\s*Secure/i);
});

test('pending proposals can be approved into canonical memory', () => {
  const { db, service, vaultPath } = makeFixture();
  fs.writeFileSync(
    path.join(vaultPath, 'inbox', 'pending.md'),
    [
      '# Pending Memory Updates',
      '',
      '## Prefer Markdown',
      '',
      '- Type: preference',
      '- Source app: test',
      '- Confidence: 0.9',
      '- Suggested destination: preferences/prefer-markdown.md',
      '- Tags: markdown, memory',
      '- Reason: explicit preference',
      '',
      'The user prefers Markdown-backed memory.',
      ''
    ].join('\n'),
    'utf8'
  );

  const proposal = listPendingProposals(vaultPath)[0];
  const result = approvePendingProposal(db, service, vaultPath, proposal.id);

  assert.equal(result.status, 'approved');
  assert.match(fs.readFileSync(path.join(vaultPath, 'preferences', 'prefer-markdown.md'), 'utf8'), /Markdown-backed memory/);
  assert.equal(listPendingProposals(vaultPath).length, 0);
});

test('memory search returns chunk previews without full file content', () => {
  const { service } = makeFixture();
  service.saveMemory({
    type: 'general',
    title: 'Search payload shape',
    content: [
      'The searchable marker is mnemonic-search-preview.',
      'This extra sentence should remain available through get_memory, but search results should not include a content field.'
    ].join('\n'),
    source_app: 'test',
    reason: 'Verify search payloads stay lightweight.'
  });

  const [result] = service.search({ query: 'mnemonic-search-preview', include_pending: true });
  assert.ok(result);
  assert.equal('content' in result, false);
  assert.match(result.chunk, /mnemonic-search-preview/);
  assert.equal(result.file_path, 'MEMORY.md');
});

test('pending proposals can be dismissed into archive', () => {
  const { db, service, vaultPath } = makeFixture();
  fs.writeFileSync(
    path.join(vaultPath, 'inbox', 'pending.md'),
    [
      '# Pending Memory Updates',
      '',
      '## Temporary detail',
      '',
      '- Type: general',
      '- Source app: test',
      '- Confidence: 0.4',
      '- Suggested destination: MEMORY.md',
      '- Reason: uncertain',
      '',
      'This might not be durable.',
      ''
    ].join('\n'),
    'utf8'
  );

  const proposal = listPendingProposals(vaultPath)[0];
  const result = dismissPendingProposal(db, service, vaultPath, proposal.id);

  assert.equal(result.status, 'dismissed');
  assert.match(fs.readFileSync(path.join(vaultPath, 'archive', 'pending-dismissed.md'), 'utf8'), /Temporary detail/);
  assert.equal(listPendingProposals(vaultPath).length, 0);
});

test('duplicate pending proposals get distinct ids and remove the selected occurrence', () => {
  const { db, service, vaultPath } = makeFixture();
  const section = [
    '## Retry detail',
    '',
    '- Type: general',
    '- Source app: test',
    '- Confidence: 0.5',
    '- Suggested destination: MEMORY.md',
    '- Reason: retry',
    '',
    'This proposal was retried.',
    ''
  ].join('\n');
  fs.writeFileSync(
    path.join(vaultPath, 'inbox', 'pending.md'),
    ['# Pending Memory Updates', '', section, section].join('\n'),
    'utf8'
  );

  const proposals = listPendingProposals(vaultPath);
  assert.equal(proposals.length, 2);
  assert.notEqual(proposals[0].id, proposals[1].id);

  dismissPendingProposal(db, service, vaultPath, proposals[1].id);

  const remaining = listPendingProposals(vaultPath);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, proposals[0].id);
});

test('pending proposal removal rejects stale source offsets', () => {
  const { db, service, vaultPath } = makeFixture();
  const pendingFile = path.join(vaultPath, 'inbox', 'pending.md');
  const archiveFile = path.join(vaultPath, 'archive', 'pending-dismissed.md');
  fs.writeFileSync(
    pendingFile,
    [
      '# Pending Memory Updates',
      '',
      '## Stale detail',
      '',
      '- Type: general',
      '- Source app: test',
      '- Confidence: 0.5',
      '- Suggested destination: MEMORY.md',
      '- Reason: stale',
      '',
      'This proposal may move.',
      ''
    ].join('\n'),
    'utf8'
  );

  const originalReadFileSync = fs.readFileSync;
  let pendingReads = 0;
  const changed = [
    '# Pending Memory Updates',
    '',
    'Intro text that shifts offsets.',
    '',
    '## Stale detail',
    '',
    '- Type: general',
    '- Source app: test',
    '- Confidence: 0.5',
    '- Suggested destination: MEMORY.md',
    '- Reason: stale',
    '',
    'This proposal may move.',
    ''
  ].join('\n');
  fs.readFileSync = ((file, ...args) => {
    if (String(file) === pendingFile) {
      pendingReads += 1;
      if (pendingReads === 2) return changed;
    }
    return originalReadFileSync(file, ...args);
  }) as typeof fs.readFileSync;

  try {
    const proposal = listPendingProposals(vaultPath)[0];
    assert.throws(() => dismissPendingProposal(db, service, vaultPath, proposal.id), /changed/);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  assert.equal(fs.existsSync(archiveFile), false);
});

test('stale pending approve does not write canonical memory', () => {
  const { db, service, vaultPath } = makeFixture();
  const pendingFile = path.join(vaultPath, 'inbox', 'pending.md');
  const destinationFile = path.join(vaultPath, 'preferences', 'stale-approve.md');
  fs.writeFileSync(
    pendingFile,
    [
      '# Pending Memory Updates',
      '',
      '## Stale approve',
      '',
      '- Type: preference',
      '- Source app: test',
      '- Confidence: 0.8',
      '- Suggested destination: preferences/stale-approve.md',
      '- Reason: stale',
      '',
      'This should not be written after a stale pending change.',
      ''
    ].join('\n'),
    'utf8'
  );

  const originalReadFileSync = fs.readFileSync;
  let pendingReads = 0;
  const changed = [
    '# Pending Memory Updates',
    '',
    'Intro text that shifts offsets.',
    '',
    '## Stale approve',
    '',
    '- Type: preference',
    '- Source app: test',
    '- Confidence: 0.8',
    '- Suggested destination: preferences/stale-approve.md',
    '- Reason: stale',
    '',
    'This should not be written after a stale pending change.',
    ''
  ].join('\n');
  fs.readFileSync = ((file, ...args) => {
    if (String(file) === pendingFile) {
      pendingReads += 1;
      if (pendingReads === 2) return changed;
    }
    return originalReadFileSync(file, ...args);
  }) as typeof fs.readFileSync;

  try {
    const proposal = listPendingProposals(vaultPath)[0];
    assert.throws(() => approvePendingProposal(db, service, vaultPath, proposal.id), /changed/);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  assert.equal(fs.existsSync(destinationFile), false);
});

test('invalid pending approve destination keeps proposal pending', () => {
  const { db, service, vaultPath } = makeFixture();
  const pendingFile = path.join(vaultPath, 'inbox', 'pending.md');
  fs.writeFileSync(
    pendingFile,
    [
      '# Pending Memory Updates',
      '',
      '## Bad destination',
      '',
      '- Type: preference',
      '- Source app: test',
      '- Confidence: 0.8',
      '- Suggested destination: preferences',
      '- Reason: malformed destination',
      '',
      'This should remain pending if approval cannot write it.',
      ''
    ].join('\n'),
    'utf8'
  );

  const proposal = listPendingProposals(vaultPath)[0];
  assert.throws(() => approvePendingProposal(db, service, vaultPath, proposal.id), /Markdown file/);

  const pending = fs.readFileSync(pendingFile, 'utf8');
  assert.match(pending, /## Bad destination/);
  assert.match(pending, /This should remain pending/);
});

test('pending approve validates destination parent before removing proposal', () => {
  const { db, service, vaultPath } = makeFixture();
  const pendingFile = path.join(vaultPath, 'inbox', 'pending.md');
  fs.writeFileSync(
    pendingFile,
    [
      '# Pending Memory Updates',
      '',
      '## Bad parent',
      '',
      '- Type: general',
      '- Source app: test',
      '- Confidence: 0.8',
      '- Suggested destination: MEMORY.md/child.md',
      '- Reason: malformed destination',
      '',
      'This should also remain pending.',
      ''
    ].join('\n'),
    'utf8'
  );

  const proposal = listPendingProposals(vaultPath)[0];
  assert.throws(() => approvePendingProposal(db, service, vaultPath, proposal.id), /parent/);

  const pending = fs.readFileSync(pendingFile, 'utf8');
  assert.match(pending, /## Bad parent/);
  assert.match(pending, /This should also remain pending/);
});

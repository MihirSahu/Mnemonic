import crypto from 'node:crypto';
import { config } from '../config';
import { createClient, openDatabase } from '../db';
import type { Scope } from '../types';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const value = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  args.set(key, value);
}

const name = args.get('name');
if (!name) {
  console.error('Usage: pnpm client:create -- --name claude --scopes memory:read,memory:propose[,memory:write] [--token your-token] [--id claude]');
  process.exit(1);
}

const scopes = (args.get('scopes') ?? 'memory:read,memory:propose')
  .split(',')
  .map((scope) => scope.trim())
  .filter(Boolean) as Scope[];

const token = args.get('token') ?? crypto.randomBytes(32).toString('base64url');
const db = openDatabase(config.databasePath);

try {
  const client = createClient(db, { id: args.get('id'), name, token, scopes });
  console.log(JSON.stringify({ ...client, token }, null, 2));
  console.log('\nStore this token somewhere safe. Only the SHA-256 hash is stored in SQLite.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  db.close();
}

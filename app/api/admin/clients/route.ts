import { createAdminClient, listAdminClients, sanitizeScopes } from '@/src/admin';
import { getRuntime } from '@/src/runtime';
import { json, requireAdmin, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const { db } = getRuntime();
    return json({ clients: listAdminClients(db) });
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = await request.json() as { id?: string; name?: string; scopes?: unknown };
    if (!body.name?.trim()) throw new Error('Name is required.');
    const { db } = getRuntime();
    return json(createAdminClient(db, {
      id: body.id?.trim() || undefined,
      name: body.name,
      scopes: sanitizeScopes(body.scopes)
    }));
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

import { deleteAdminClient, sanitizeScopes, updateAdminClient } from '@/src/admin';
import { getRuntime } from '@/src/runtime';
import { json, requireAdmin, type RouteContextWithId, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: RouteContextWithId) {
  try {
    const session = requireAdmin(request);
    const { id } = await context.params;
    const body = await request.json() as { name?: string; scopes?: unknown };
    if (!body.name?.trim()) throw new Error('Name is required.');
    const { db } = getRuntime();
    return json({ client: updateAdminClient(db, session.clientId, { id, name: body.name, scopes: sanitizeScopes(body.scopes) }) });
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

export async function DELETE(request: Request, context: RouteContextWithId) {
  try {
    const session = requireAdmin(request);
    const { id } = await context.params;
    const { db } = getRuntime();
    deleteAdminClient(db, session.clientId, id);
    return json({ ok: true });
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

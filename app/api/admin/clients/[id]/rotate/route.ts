import { rotateAdminClientToken } from '@/src/admin';
import { getRuntime } from '@/src/runtime';
import { json, requireAdmin, type RouteContextWithId, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: RouteContextWithId) {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    const { db } = getRuntime();
    return json(rotateAdminClientToken(db, id));
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

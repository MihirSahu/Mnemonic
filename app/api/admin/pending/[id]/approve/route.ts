import { approvePendingProposal } from '@/src/admin';
import { config } from '@/src/config';
import { getRuntime } from '@/src/runtime';
import { json, requireAdmin, type RouteContextWithId, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: RouteContextWithId) {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    const { db, service } = getRuntime();
    return json(approvePendingProposal(db, service, config.vaultPath, id));
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

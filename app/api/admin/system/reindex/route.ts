import { runAdminReindex } from '@/src/admin';
import { config } from '@/src/config';
import { getRuntime } from '@/src/runtime';
import { json, requireAdmin, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const { db, service } = getRuntime();
    return json(runAdminReindex(db, service, config.vaultPath));
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

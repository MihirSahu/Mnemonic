import { getSystemStatus } from '@/src/admin';
import { getRuntime } from '@/src/runtime';
import { json, requireAdmin, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const { db } = getRuntime();
    return json({ status: getSystemStatus(db) });
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

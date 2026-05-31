import { listAuditLog } from '@/src/admin';
import { getRuntime } from '@/src/runtime';
import { json, requireAdmin, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const url = new URL(request.url);
    const { db } = getRuntime();
    return json({
      audit: listAuditLog(db, {
        limit: Number(url.searchParams.get('limit') ?? 50),
        offset: Number(url.searchParams.get('offset') ?? 0)
      })
    });
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

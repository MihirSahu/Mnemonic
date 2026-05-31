import { ADMIN_SESSION_COOKIE, deleteAdminSession } from '@/src/admin';
import { getRuntime } from '@/src/runtime';
import { clearSessionCookie, getCookieValue, json } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { db } = getRuntime();
  deleteAdminSession(db, getCookieValue(request, ADMIN_SESSION_COOKIE));
  const response = json({ ok: true });
  clearSessionCookie(response);
  return response;
}

import { createAdminSession } from '@/src/admin';
import { authenticateToken } from '@/src/db';
import { getRuntime } from '@/src/runtime';
import { json, jsonError, setSessionCookie } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: string };
    if (!body.token) throw new Error('Token is required.');
    const { db } = getRuntime();
    const auth = authenticateToken(db, body.token);
    if (!auth || !auth.scopes.includes('memory:admin')) throw new Error('Invalid admin token.');
    const { token, session } = createAdminSession(db, auth);
    const response = json({ session });
    setSessionCookie(response, token, session.expiresAt);
    return response;
  } catch (error) {
    return jsonError(error, 401);
  }
}

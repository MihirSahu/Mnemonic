import { json, requireAdmin, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    return json({ session: requireAdmin(request) });
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

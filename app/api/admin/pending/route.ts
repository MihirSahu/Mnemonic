import { listPendingProposals } from '@/src/admin';
import { config } from '@/src/config';
import { json, requireAdmin, unauthorizedIfNeeded } from '@/src/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return json({ proposals: listPendingProposals(config.vaultPath) });
  } catch (error) {
    return unauthorizedIfNeeded(error);
  }
}

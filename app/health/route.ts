import { config } from '@/src/config';
import { withCors } from '@/src/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return withCors(Response.json({ ok: true, name: 'personal-memory-mcp', public_url: config.publicUrl }));
}

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

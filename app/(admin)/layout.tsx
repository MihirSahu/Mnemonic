import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '@/src/admin';
import { getRuntime } from '@/src/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const { db } = getRuntime();
  const session = getAdminSession(db, token);
  if (!session) redirect('/login');
  return <AdminShell clientName={session.clientName}>{children}</AdminShell>;
}

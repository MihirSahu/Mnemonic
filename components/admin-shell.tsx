'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BookOpen, ClipboardList, Database, KeyRound, LogOut, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/src/lib/utils';

const navItems = [
  { href: '/system', label: 'System', icon: Activity },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/pending', label: 'Pending', icon: ClipboardList },
  { href: '/memory', label: 'Memory', icon: BookOpen },
  { href: '/audit', label: 'Audit', icon: Database }
];

export function AdminShell({ children, clientName }: { children: React.ReactNode; clientName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2 text-base font-semibold">
            <KeyRound className="h-5 w-5 text-cyan-800" />
            Mnemonic
          </div>
          <div className="mt-1 truncate text-xs text-slate-500">{clientName}</div>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (pathname === '/' && item.href === '/system');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100',
                  active && 'bg-cyan-50 text-cyan-900'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex gap-1 overflow-x-auto lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium text-slate-700',
                  (pathname === item.href || (pathname === '/' && item.href === '/system')) && 'bg-cyan-50 text-cyan-900'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="hidden text-sm text-slate-500 lg:block">Admin console</div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
      </div>
    </div>
  );
}

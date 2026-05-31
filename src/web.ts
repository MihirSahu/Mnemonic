import { NextResponse } from 'next/server';
import { getRuntime } from './runtime';
import { ADMIN_SESSION_COOKIE, getAdminSession, type AdminSession } from './admin';
import { config } from './config';

export const json = (value: unknown, status = 200) => NextResponse.json(value, { status });

export const jsonError = (error: unknown, status = 400) =>
  NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });

export const getCookieValue = (request: Request, name: string): string | undefined => {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
};

export const requireAdmin = (request: Request): AdminSession => {
  const { db } = getRuntime();
  const token = getCookieValue(request, ADMIN_SESSION_COOKIE);
  const session = getAdminSession(db, token);
  if (!session) throw new Error('Unauthorized');
  return session;
};

export const unauthorizedIfNeeded = (error: unknown) =>
  error instanceof Error && error.message === 'Unauthorized' ? jsonError(error, 401) : jsonError(error);

export const setSessionCookie = (response: NextResponse, token: string, expiresAt: string): void => {
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl.startsWith('https://'),
    path: '/',
    expires: new Date(expiresAt)
  });
};

export const clearSessionCookie = (response: NextResponse): void => {
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl.startsWith('https://'),
    path: '/',
    expires: new Date(0)
  });
};

export type RouteContextWithId = {
  params: Promise<{ id: string }>;
};

import type { Db } from './db';
import { authenticateToken } from './db';
import type { AuthContext, Scope } from './types';

export const authFromBearerHeader = (db: Db, header: string | null): AuthContext | null => {
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
  if (!token) return null;
  return authenticateToken(db, token);
};

export const hasScope = (auth: AuthContext, scope: Scope): boolean => auth.scopes.includes(scope);

export const requireScope = (auth: AuthContext, scope: Scope): void => {
  if (!hasScope(auth, scope)) {
    throw new Error(`Client ${auth.clientName} is missing required scope: ${scope}`);
  }
};

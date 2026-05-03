import type { NextFunction, Request, Response } from 'express';
import type { Db } from './db.js';
import { authenticateToken } from './db.js';
import type { AuthContext, Scope } from './types.js';

export type AuthedRequest = Request & { authContext?: AuthContext };

export const authMiddleware = (db: Db) => (req: AuthedRequest, res: Response, next: NextFunction): void => {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
    return;
  }
  const auth = authenticateToken(db, token);
  if (!auth) {
    res.status(401).json({ error: 'Invalid bearer token' });
    return;
  }
  req.authContext = auth;
  next();
};

export const hasScope = (auth: AuthContext, scope: Scope): boolean => auth.scopes.includes(scope);

export const requireScope = (auth: AuthContext, scope: Scope): void => {
  if (!hasScope(auth, scope)) {
    throw new Error(`Client ${auth.clientName} is missing required scope: ${scope}`);
  }
};

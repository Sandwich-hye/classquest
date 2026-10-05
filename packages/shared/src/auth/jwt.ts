/**
 * Human authentication: JWT issue/verify + password hashing + RBAC guard.
 * Implements the zero-trust human-facing side (report 2.3.6, 6.1).
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config.js';
import type { UserRole } from '../domain/types.js';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  displayName: string;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, loadConfig().bcryptRounds);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function issueToken(payload: JwtPayload): string {
  const cfg = loadConfig();
  return jwt.sign(payload, cfg.jwtSecret, { expiresIn: cfg.jwtExpiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const cfg = loadConfig();
  return jwt.verify(token, cfg.jwtSecret) as JwtPayload;
}

// ----- Express middleware -----
declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/** Require a valid JWT. Attaches req.user. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
}

/** Require one of the given roles (least-privilege RBAC, report 2.3.6). */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
      return;
    }
    next();
  };
}

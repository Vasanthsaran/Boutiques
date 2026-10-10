import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  emailVerifiedAt: Date | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export async function createSession(res: Response, user: { id: string; role: Role }, userAgent?: string) {
  const token = randomToken(32);
  const ttl = config.sessionTtlMs[user.role];
  await prisma.session.create({
    data: {
      id: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + ttl),
      userAgent: userAgent?.slice(0, 300),
    },
  });
  res.cookie(config.cookies.session, token, cookieOptions(ttl));
}

export async function destroySession(req: Request, res: Response) {
  if (req.sessionId) await prisma.session.deleteMany({ where: { id: req.sessionId } });
  res.clearCookie(config.cookies.session, { path: '/' });
}

/** Loads the user for the session cookie (if any). Never trusts client-supplied identity. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[config.cookies.session];
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return next();
  try {
    const sessionId = sha256(token);
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, emailVerifiedAt: true },
        },
      },
    });
    if (!session || session.expiresAt < new Date() || !session.user.isActive) {
      if (session) await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
      return next();
    }
    const { isActive: _ignored, ...user } = session.user;
    req.user = user;
    req.sessionId = sessionId;
    // Touch lastSeenAt at most every 5 minutes.
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      prisma.session
        .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'CUSTOMER') return next(forbidden('This area is for customer accounts.'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized('Please sign in as an administrator.'));
  if (req.user.role !== 'ADMIN') return next(forbidden());
  next();
}

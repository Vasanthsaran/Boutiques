import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { hmac, randomToken, safeEqual } from '../lib/crypto.js';
import { HttpError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function signCsrf(nonce: string) {
  return `${nonce}.${hmac(config.SESSION_SECRET, `csrf:${nonce}`)}`;
}

function validCsrf(token: string) {
  const [nonce, sig] = token.split('.');
  if (!nonce || !sig) return false;
  return safeEqual(signCsrf(nonce), token);
}

/** Issues (or re-uses) a signed double-submit CSRF token. */
export function issueCsrf(req: Request, res: Response) {
  const existing = req.cookies?.[config.cookies.csrf];
  if (typeof existing === 'string' && validCsrf(existing)) return existing;
  const token = signCsrf(randomToken(18));
  res.cookie(config.cookies.csrf, token, {
    httpOnly: false, // must be readable by the SPA to echo in a header
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

/**
 * CSRF protection for state-changing requests:
 *  1. Origin/Referer (when present) must match APP_ORIGIN.
 *  2. X-CSRF-Token header must equal the signed csrf cookie.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  const allowed = new URL(config.APP_ORIGIN).origin;
  if (origin && origin !== allowed && !(config.NODE_ENV !== 'production' && isSameHost(origin, req))) {
    return next(new HttpError(403, 'Request origin not allowed.', 'BAD_ORIGIN'));
  }
  const header = req.get('x-csrf-token');
  const cookie = req.cookies?.[config.cookies.csrf];
  if (!header || !cookie || header !== cookie || !validCsrf(header)) {
    return next(new HttpError(403, 'Your session security token expired. Please refresh the page and try again.', 'CSRF'));
  }
  next();
}

function isSameHost(origin: string, req: Request) {
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

const limiterMessage = (msg: string) => ({ error: { code: 'RATE_LIMITED', message: msg } });
const skip = () => config.isTest && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== '1';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip,
  message: limiterMessage('Too many sign-in attempts. Please wait 15 minutes and try again.'),
});

export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip,
  message: limiterMessage('Too many sign-in attempts. Please wait 15 minutes and try again.'),
});

export const accountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: limiterMessage('Too many requests. Please try again later.'),
});

export const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: limiterMessage('You have sent several requests already. Please try again in a little while.'),
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: limiterMessage('Too many requests. Please slow down.'),
});

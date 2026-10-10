import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { getDummyHash, hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, HttpError } from '../lib/errors.js';
import { body, email, password, phone, text } from '../lib/validate.js';
import { appUrl, sendMail } from '../lib/mailer.js';
import { createSession, destroySession } from '../middleware/auth.js';
import { accountLimiter, adminLoginLimiter, issueCsrf, loginLimiter } from '../middleware/security.js';

export const authRouter = Router();

export function publicUser(u: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerifiedAt: Date | null;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    emailVerified: Boolean(u.emailVerifiedAt),
  };
}

authRouter.get('/csrf', (req, res) => {
  res.json({ csrfToken: issueCsrf(req, res) });
});

authRouter.get('/me', (req, res) => {
  res.json({
    user: req.user ? publicUser(req.user) : null,
    emailVerificationRequired: config.requireEmailVerification,
  });
});

const RegisterSchema = z.object({
  name: text(80, 2),
  email,
  phone: z.union([phone, z.literal(''), z.null()]).optional().transform((v) => v || null),
  password,
});

authRouter.post('/register', accountLimiter, async (req, res) => {
  const data = body(req, RegisterSchema);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw conflict('An account with this email already exists. Please sign in instead.', 'EMAIL_TAKEN');
  // Public registration can only ever create CUSTOMER accounts.
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash: await hashPassword(data.password),
      role: 'CUSTOMER',
    },
  });
  await sendVerification(user.id, user.email);
  await createSession(res, user, req.get('user-agent'));
  res.status(201).json({ user: publicUser(user) });
});

const LoginSchema = z.object({ email, password: z.string().min(1).max(200) });

async function authenticate(emailAddr: string, pw: string) {
  const user = await prisma.user.findUnique({ where: { email: emailAddr } });
  if (!user) {
    await verifyPassword(pw, await getDummyHash());
    return null;
  }
  const ok = await verifyPassword(pw, user.passwordHash);
  if (!ok || !user.isActive) return null;
  return user;
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email: e, password: pw } = body(req, LoginSchema);
  const user = await authenticate(e, pw);
  if (!user) throw new HttpError(401, 'Incorrect email or password.', 'INVALID_CREDENTIALS');
  if (user.role === 'ADMIN') {
    throw new HttpError(403, 'Administrators must sign in through the admin login page.', 'USE_ADMIN_LOGIN');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(res, user, req.get('user-agent'));
  res.json({ user: publicUser(user) });
});

authRouter.post('/admin/login', adminLoginLimiter, async (req, res) => {
  const { email: e, password: pw } = body(req, LoginSchema);
  const user = await authenticate(e, pw);
  // Same message for "not an admin" to avoid revealing which accounts are admins.
  if (!user || user.role !== 'ADMIN') throw new HttpError(401, 'Incorrect email or password.', 'INVALID_CREDENTIALS');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(res, user, req.get('user-agent'));
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

// ───────── Password recovery ─────────

authRouter.post('/forgot-password', accountLimiter, async (req, res) => {
  const { email: e } = body(req, z.object({ email }));
  const user = await prisma.user.findUnique({ where: { email: e } });
  if (user && user.isActive) {
    const link = await createToken(user.id, 'PASSWORD_RESET', 60);
    const url = appUrl(`/reset-password?token=${link}`);
    const sent = await sendMail(
      user.email,
      'Reset your SVSS Boutique password',
      `Hello ${user.name},\n\nUse this link to set a new password (valid for 60 minutes):\n${url}\n\nIf you did not ask for this, you can ignore this email.`,
    );
    if (!sent && config.NODE_ENV === 'development') console.info(`[dev] password reset link for ${user.email}: ${url}`);
  }
  // Same response whether or not the account exists.
  res.json({
    ok: true,
    emailEnabled: config.smtpConfigured,
    message: config.smtpConfigured
      ? 'If an account exists for that email, a reset link is on its way.'
      : 'Password reset emails are not enabled yet. Please contact the boutique and we will send you a reset link.',
  });
});

authRouter.post('/reset-password', accountLimiter, async (req, res) => {
  const data = body(req, z.object({ token: z.string().min(20).max(200), password }));
  const token = await prisma.authToken.findUnique({ where: { tokenHash: sha256(data.token) } });
  if (!token || token.purpose !== 'PASSWORD_RESET' || token.usedAt || token.expiresAt < new Date()) {
    throw badRequest('This reset link is invalid or has expired. Please request a new one.');
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: token.userId }, data: { passwordHash: await hashPassword(data.password) } }),
    prisma.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    // Sign out every existing session for safety.
    prisma.session.deleteMany({ where: { userId: token.userId } }),
  ]);
  res.json({ ok: true });
});

// ───────── Email verification ─────────

authRouter.post('/verify-email', accountLimiter, async (req, res) => {
  const { token: raw } = body(req, z.object({ token: z.string().min(20).max(200) }));
  const token = await prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!token || token.purpose !== 'EMAIL_VERIFY' || token.usedAt || token.expiresAt < new Date()) {
    throw badRequest('This verification link is invalid or has expired.');
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
  ]);
  res.json({ ok: true });
});

authRouter.post('/resend-verification', accountLimiter, async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Please sign in to continue.', 'UNAUTHORIZED');
  if (!config.smtpConfigured) throw badRequest('Email is not configured for this site.');
  if (req.user.emailVerifiedAt) return res.json({ ok: true });
  await sendVerification(req.user.id, req.user.email);
  res.json({ ok: true });
});

export async function createToken(userId: string, purpose: 'PASSWORD_RESET' | 'EMAIL_VERIFY', minutes: number) {
  const raw = randomToken(32);
  await prisma.authToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { usedAt: new Date() }, // invalidate older links
  });
  await prisma.authToken.create({
    data: { userId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + minutes * 60 * 1000) },
  });
  return raw;
}

export async function sendVerification(userId: string, to: string) {
  if (!config.smtpConfigured) return;
  const raw = await createToken(userId, 'EMAIL_VERIFY', 60 * 24);
  await sendMail(
    to,
    'Verify your email for SVSS Boutique',
    `Welcome to SVSS Boutique!\n\nPlease confirm your email address:\n${appUrl(`/verify-email?token=${raw}`)}\n`,
  );
}


/**
 * Creates (or promotes / resets) the boutique administrator.
 *
 *   ADMIN_NAME="Owner" ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='long-passphrase' npm run create-admin
 *
 * Values are read from the environment (or .env). Public registration can never create admins.
 */
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/crypto.js';

async function main() {
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Set ADMIN_EMAIL to a valid email address.');
  // Production requires a strong password; local development allows short ones (with a warning).
  const minLength = process.env.NODE_ENV === 'production' ? 12 : 6;
  if (!password || password.length < minLength) throw new Error(`Set ADMIN_PASSWORD (at least ${minLength} characters).`);
  if (password.length < 12) console.warn('[warn] Short admin password — fine for local testing, change it before going live.');

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: 'ADMIN', passwordHash, isActive: true, name } });
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    console.info(`Updated existing account ${email}: role=ADMIN, password reset.`);
  } else {
    await prisma.user.create({ data: { name, email, passwordHash, role: 'ADMIN', emailVerifiedAt: new Date() } });
    console.info(`Created admin ${email}.`);
  }
  console.info('Sign in at /admin/login. Remove ADMIN_PASSWORD from your environment afterwards.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

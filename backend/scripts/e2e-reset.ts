/** Resets the dedicated *_e2e database and creates the e2e admin. Refuses any other database. */
import { execSync } from 'node:child_process';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/crypto.js';

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  if (!db.endsWith('_e2e')) throw new Error(`Refusing to reset "${db}" — only *_e2e databases.`);
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
  await prisma.user.create({
    data: { name: 'E2E Admin', email: 'admin@e2e.local', passwordHash: await hashPassword('e2e-admin-password'), role: 'ADMIN' },
  });
}
main().finally(() => prisma.$disconnect());

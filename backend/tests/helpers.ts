import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/crypto.js';
import { invalidatePublic } from '../src/lib/cache.js';
import { DEFAULT_BOOKING, DEFAULT_ENQUIRY, DEFAULT_HOME, write } from '../src/lib/settings.js';

export const app = createApp();

/** A cookie-keeping client that automatically sends the CSRF header. */
export class Client {
  agent = request.agent(app);
  csrf = '';
  async init() {
    const res = await this.agent.get('/api/auth/csrf');
    this.csrf = res.body.csrfToken;
    return this;
  }
  get(url: string) {
    return this.agent.get(url);
  }
  post(url: string, body?: object) {
    return this.agent.post(url).set('X-CSRF-Token', this.csrf).send(body ?? {});
  }
  put(url: string, body?: object) {
    return this.agent.put(url).set('X-CSRF-Token', this.csrf).send(body ?? {});
  }
  patch(url: string, body?: object) {
    return this.agent.patch(url).set('X-CSRF-Token', this.csrf).send(body ?? {});
  }
  delete(url: string) {
    return this.agent.delete(url).set('X-CSRF-Token', this.csrf);
  }
  upload(url: string) {
    return this.agent.post(url).set('X-CSRF-Token', this.csrf);
  }
}

export async function client() {
  return new Client().init();
}

export async function resetDb() {
  // Safety: only ever wipe a dedicated *_test database.
  const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  if (process.env.NODE_ENV !== 'test' || !dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset database "${dbName}" — tests must run against a *_test database.`);
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await write('booking', DEFAULT_BOOKING);
  await write('enquiries', DEFAULT_ENQUIRY);
  await write('homepage', { draft: DEFAULT_HOME, published: DEFAULT_HOME });
  invalidatePublic();
}

let counter = 0;
export async function createAdmin() {
  const email = `admin${++counter}@test.local`;
  await prisma.user.create({
    data: { name: 'Admin', email, passwordHash: await hashPassword('admin-password-123'), role: 'ADMIN' },
  });
  const c = await client();
  const res = await c.post('/api/auth/admin/login', { email, password: 'admin-password-123' });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
  return c;
}

export async function createCustomer(name = 'Customer') {
  const email = `cust${++counter}@test.local`;
  const c = await client();
  const res = await c.post('/api/auth/register', { name, email, password: 'customer-pass-1' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return Object.assign(c, { email, userId: res.body.user.id as string });
}

export async function makeCategory() {
  return prisma.category.create({ data: { name: `Bridal ${++counter}`, slug: `bridal-${counter}` } });
}

export async function makeService(overrides: Partial<{ status: 'DRAFT' | 'PUBLISHED'; isAvailable: boolean }> = {}) {
  return prisma.service.create({
    data: {
      title: `Stitching ${++counter}`,
      slug: `stitching-${counter}`,
      description: 'Expert stitching',
      status: overrides.status ?? 'PUBLISHED',
      isAvailable: overrides.isAvailable ?? true,
    },
  });
}

export async function pngBuffer(width = 64, height = 96) {
  return sharp({ create: { width, height, channels: 3, background: { r: 232, g: 184, b: 196 } } }).png().toBuffer();
}

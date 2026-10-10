import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { client, createAdmin, createCustomer, resetDb } from './helpers.js';

beforeAll(resetDb);

describe('auth', () => {
  it('registers a customer and keeps them signed in', async () => {
    const c = await client();
    const res = await c.post('/api/auth/register', { name: 'Anita', email: 'Anita@Example.com', password: 'secret-pass-1' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Anita', email: 'anita@example.com', role: 'CUSTOMER' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const me = await c.get('/api/auth/me');
    expect(me.body.user.email).toBe('anita@example.com');
  });

  it('cannot create an admin through public registration', async () => {
    const c = await client();
    const res = await c.post('/api/auth/register', { name: 'Sneaky', email: 'sneaky@example.com', password: 'secret-pass-1', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('CUSTOMER');
    const u = await prisma.user.findUnique({ where: { email: 'sneaky@example.com' } });
    expect(u?.role).toBe('CUSTOMER');
  });

  it('rejects duplicate emails and weak input with clear messages', async () => {
    const c = await client();
    const dup = await c.post('/api/auth/register', { name: 'Anita', email: 'anita@example.com', password: 'secret-pass-1' });
    expect(dup.status).toBe(409);
    const weak = await c.post('/api/auth/register', { name: 'A', email: 'nope', password: '123' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.message).toMatch(/Please check the form/);
    expect(Object.keys(weak.body.error.details.fields)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('logs in with valid credentials and rejects invalid ones', async () => {
    const c = await client();
    const bad = await c.post('/api/auth/login', { email: 'anita@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Incorrect email or password.');
    const unknown = await c.post('/api/auth/login', { email: 'ghost@example.com', password: 'whatever-123' });
    expect(unknown.status).toBe(401);
    const ok = await c.post('/api/auth/login', { email: 'anita@example.com', password: 'secret-pass-1' });
    expect(ok.status).toBe(200);
    const logout = await c.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect((await c.get('/api/auth/me')).body.user).toBeNull();
  });

  it('requires a CSRF token for state-changing requests', async () => {
    const c = await client();
    const res = await c.agent.post('/api/auth/login').send({ email: 'anita@example.com', password: 'secret-pass-1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
    const forged = await c.agent.post('/api/auth/login').set('X-CSRF-Token', 'abc.def').send({});
    expect(forged.status).toBe(403);
  });

  it('rejects requests from a foreign origin', async () => {
    const c = await client();
    const res = await c.agent
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', c.csrf)
      .send({ email: 'anita@example.com', password: 'secret-pass-1' });
    expect(res.status).toBe(403);
  });

  it('keeps admin and customer logins separate', async () => {
    await createAdmin();
    const c = await client();
    const viaCustomer = await c.post('/api/auth/login', { email: 'admin1@test.local', password: 'admin-password-123' });
    expect(viaCustomer.status).toBe(403);
    const customerViaAdmin = await c.post('/api/auth/admin/login', { email: 'anita@example.com', password: 'secret-pass-1' });
    expect(customerViaAdmin.status).toBe(401);
  });
});

describe('role-based access', () => {
  it('blocks anonymous and customer users from admin APIs', async () => {
    const anon = await client();
    expect((await anon.get('/api/admin/stats')).status).toBe(401);
    expect((await anon.get('/api/me/profile')).status).toBe(401);

    const cust = await createCustomer();
    for (const url of ['/api/admin/stats', '/api/admin/work', '/api/admin/enquiries', '/api/admin/appointments', '/api/admin/customers']) {
      expect((await cust.get(url)).status).toBe(403);
    }
    expect((await cust.post('/api/admin/work', { title: 'x' })).status).toBe(403);
    expect((await cust.put('/api/admin/settings/business', {})).status).toBe(403);
  });

  it('lets admins into admin APIs but not the customer dashboard', async () => {
    const admin = await createAdmin();
    expect((await admin.get('/api/admin/stats')).status).toBe(200);
    expect((await admin.get('/api/me/overview')).status).toBe(403);
  });

  it('ignores client-supplied user ids when updating a profile', async () => {
    const a = await createCustomer('Alpha');
    const b = await createCustomer('Beta');
    const res = await a.patch('/api/me/profile', { id: b.userId, userId: b.userId, name: 'Alpha Renamed', email: a.email });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: b.userId } }))?.name).toBe('Beta');
    expect((await prisma.user.findUnique({ where: { id: a.userId } }))?.name).toBe('Alpha Renamed');
  });

  it('requires the current password to change email', async () => {
    const a = await createCustomer();
    const res = await a.patch('/api/me/profile', { name: 'Customer', email: 'new-address@test.local' });
    expect(res.status).toBe(400);
    const ok = await a.patch('/api/me/profile', { name: 'Customer', email: 'new-address@test.local', currentPassword: 'customer-pass-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('new-address@test.local');
  });

  it('disabled customers are signed out immediately', async () => {
    const admin = await createAdmin();
    const c = await createCustomer();
    expect((await c.get('/api/me/profile')).status).toBe(200);
    expect((await admin.patch(`/api/admin/customers/${c.userId}`, { isActive: false })).status).toBe(200);
    expect((await c.get('/api/me/profile')).status).toBe(401);
  });

  it('resets passwords with a one-time link and signs out old sessions', async () => {
    const admin = await createAdmin();
    const c = await createCustomer();
    const link = await admin.post(`/api/admin/customers/${c.userId}/reset-link`);
    expect(link.status).toBe(200);
    const token = new URL(link.body.url).searchParams.get('token')!;
    const anon = await client();
    expect((await anon.post('/api/auth/reset-password', { token, password: 'brand-new-pass-1' })).status).toBe(200);
    expect((await anon.post('/api/auth/reset-password', { token, password: 'another-pass-12' })).status).toBe(400);
    expect((await c.get('/api/me/profile')).status).toBe(401);
    expect((await anon.post('/api/auth/login', { email: c.email, password: 'brand-new-pass-1' })).status).toBe(200);
  });
});

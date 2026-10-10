import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { client, createAdmin, createCustomer, makeService, pngBuffer, resetDb, type Client } from './helpers.js';

let admin: Client;
let serviceId: string;

beforeAll(async () => {
  await resetDb();
  admin = await createAdmin();
  serviceId = (await makeService()).id;
});

describe('enquiries', () => {
  it('requires sign-in unless the owner enables guest enquiries', async () => {
    const anon = await client();
    const res = await anon.post('/api/enquiries', {
      name: 'Guest',
      email: 'guest@example.com',
      subject: 'Bridal blouse',
      message: 'I would like a bridal blouse with maggam work.',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('LOGIN_REQUIRED');
    expect(await prisma.enquiry.count()).toBe(0);
  });

  it('accepts guest enquiries when enabled, with spam protection', async () => {
    await admin.put('/api/admin/settings/enquiries', { allowGuests: true }).expect(200);
    const anon = await client();
    const base = { name: 'Guest', email: 'guest@example.com', subject: 'Bridal blouse', message: 'I would like a bridal blouse.' };
    const spam = await anon.post('/api/enquiries', { ...base, website: 'http://spam' });
    expect(spam.status).toBe(400);
    const tooFast = await anon.post('/api/enquiries', { ...base, startedAt: Date.now() });
    expect(tooFast.status).toBe(400);
    const ok = await anon.post('/api/enquiries', { ...base, startedAt: Date.now() - 10_000 });
    expect(ok.status).toBe(201);
    expect(ok.body.enquiry.reference).toMatch(/^ENQ-/);
    const saved = await prisma.enquiry.findUnique({ where: { id: ok.body.enquiry.id }, include: { messages: true } });
    expect(saved?.userId).toBeNull();
    expect(saved?.messages[0].body).toBe(base.message);
    await admin.put('/api/admin/settings/enquiries', { allowGuests: false }).expect(200);
  });

  it('validates required fields', async () => {
    const cust = await createCustomer();
    const res = await cust.post('/api/enquiries', { name: 'C', subject: '', message: 'short' });
    expect(res.status).toBe(400);
  });

  it('full conversation: submit with image → admin reply + private note → customer reads reply only', async () => {
    const alice = await createCustomer('Alice');
    const bob = await createCustomer('Bob');

    const submit = await alice
      .upload('/api/enquiries')
      .field('name', 'Alice')
      .field('subject', 'Maggam blouse for reception')
      .field('message', 'Can you do peacock motifs on a maroon blouse?')
      .field('serviceId', serviceId)
      .attach('images', await pngBuffer(), 'ref.png');
    expect(submit.status).toBe(201);
    const enquiryId = submit.body.enquiry.id;
    expect(submit.body.enquiry.linkedToAccount).toBe(true);

    // Admin sees it, adds an internal note and replies.
    const list = await admin.get('/api/admin/enquiries?status=awaiting');
    expect(list.body.items.map((e: { id: string }) => e.id)).toContain(enquiryId);
    const SECRET_NOTE = 'INTERNAL: quote higher, customer is flexible';
    await admin.post(`/api/admin/enquiries/${enquiryId}/notes`, { note: SECRET_NOTE }).expect(201);
    const reply = await admin.post(`/api/admin/enquiries/${enquiryId}/reply`, { message: 'Yes! Please book a consultation.' });
    expect(reply.status).toBe(200);
    expect(reply.body.enquiry.status).toBe('RESPONDED');
    expect(reply.body.enquiry.notes).toHaveLength(1);

    // Customer sees the reply but never the internal note.
    const mine = await alice.get(`/api/me/enquiries/${enquiryId}`);
    expect(mine.status).toBe(200);
    expect(mine.body.enquiry.messages.map((m: { authorType: string }) => m.authorType)).toEqual(['CUSTOMER', 'ADMIN']);
    expect(JSON.stringify(mine.body)).not.toContain(SECRET_NOTE);
    expect(mine.body.enquiry.notes).toBeUndefined();
    const listMine = await alice.get('/api/me/enquiries');
    expect(JSON.stringify(listMine.body)).not.toContain(SECRET_NOTE);
    const overview = await alice.get('/api/me/overview');
    expect(overview.body.recentReplies[0].body).toContain('Please book a consultation');
    expect(JSON.stringify(overview.body)).not.toContain(SECRET_NOTE);

    // Customer gets an in-app notification.
    const notes = await alice.get('/api/me/notifications');
    expect(notes.body.unread).toBeGreaterThan(0);

    // Reference image is private to the owner and admins.
    const attUrl = mine.body.enquiry.attachments[0].url;
    expect((await alice.get(attUrl)).status).toBe(200);
    expect((await admin.get(attUrl)).status).toBe(200);
    expect((await bob.get(attUrl)).status).toBe(404);
    expect((await (await client()).get(attUrl)).status).toBe(401);

    // Another customer cannot read or post to it by changing the id.
    expect((await bob.get(`/api/me/enquiries/${enquiryId}`)).status).toBe(404);
    expect((await bob.post(`/api/me/enquiries/${enquiryId}/messages`, { message: 'hijack' })).status).toBe(404);
    expect((await bob.get('/api/me/enquiries')).body.enquiries).toHaveLength(0);

    // Follow-up from the customer re-opens it for review.
    const follow = await alice.post(`/api/me/enquiries/${enquiryId}/messages`, { message: 'Great, which dates work?' });
    expect(follow.status).toBe(201);
    expect(follow.body.enquiry.status).toBe('UNDER_REVIEW');

    // Closed enquiries cannot receive further messages.
    await admin.patch(`/api/admin/enquiries/${enquiryId}`, { status: 'CLOSED' }).expect(200);
    expect((await alice.post(`/api/me/enquiries/${enquiryId}/messages`, { message: 'one more' })).status).toBe(400);
  });

  it('rejects non-image reference files', async () => {
    const cust = await createCustomer();
    const res = await cust
      .upload('/api/enquiries')
      .field('name', 'Cust')
      .field('subject', 'With attachment')
      .field('message', 'Please see the attached file.')
      .attach('images', Buffer.from('not an image at all'), 'file.jpg');
    expect(res.status).toBe(400);
    expect(await prisma.enquiry.count({ where: { subject: 'With attachment' } })).toBe(0);
  });
});

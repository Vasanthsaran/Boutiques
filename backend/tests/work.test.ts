import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { config } from '../src/config.js';
import { client, createAdmin, createCustomer, makeCategory, pngBuffer, resetDb, type Client } from './helpers.js';

let admin: Client;
let categoryId: string;

beforeAll(async () => {
  await resetDb();
  admin = await createAdmin();
  categoryId = (await makeCategory()).id;
});

async function uploadImage(c: Client, name = 'photo.png') {
  const res = await c.upload('/api/admin/media').attach('file', await pngBuffer(120, 160), name);
  expect(res.status).toBe(201);
  return res.body.asset as { id: string; url: string; thumbUrl: string; width: number; height: number };
}

describe('recent work publishing', () => {
  it('stores uploads in persistent storage with correct dimensions', async () => {
    const asset = await uploadImage(admin);
    expect(asset.width).toBe(120);
    expect(asset.height).toBe(160);
    expect(asset.url).toMatch(/^\/media\/public\/.+\.webp$/);
    const key = asset.url.replace('/media/', '');
    expect(fs.existsSync(path.resolve(config.LOCAL_STORAGE_DIR, key))).toBe(true);
    const anon = await client();
    const served = await anon.get(asset.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
  });

  it('rejects files that are not real images, with a clear message', async () => {
    const fake = Buffer.from('<?php echo "hi"; ?>');
    const res = await admin.upload('/api/admin/media').attach('file', fake, { filename: 'evil.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Unsupported file type/);
    const corrupt = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
    const res2 = await admin.upload('/api/admin/media').attach('file', corrupt, 'broken.png');
    expect(res2.status).toBe(400);
    expect(res2.body.error.message).toMatch(/could not be read|Unsupported/);
  });

  it('keeps drafts private and publishes on demand', async () => {
    const cover = await uploadImage(admin);
    const gallery = await uploadImage(admin);
    const create = await admin.post('/api/admin/work', {
      title: 'Peach Maggam Blouse',
      description: 'Hand-done maggam work with zari.',
      categoryId,
      coverId: cover.id,
      media: [{ assetId: gallery.id, role: 'GALLERY' }],
      status: 'DRAFT',
    });
    expect(create.status).toBe(201);
    const work = create.body.work;
    expect(work.slug).toBe('peach-maggam-blouse');

    const anon = await client();
    expect((await anon.get(`/api/public/work/${work.slug}`)).status).toBe(404);
    expect((await anon.get('/api/public/work')).body.items).toHaveLength(0);

    // Customer cannot favourite a draft either.
    const cust = await createCustomer();
    expect((await cust.post(`/api/me/favorites/${work.id}`)).status).toBe(404);

    const pub = await admin.post(`/api/admin/work/${work.id}/status`, { status: 'PUBLISHED' });
    expect(pub.status).toBe(200);

    const list = await anon.get('/api/public/work');
    expect(list.body.items.map((w: { slug: string }) => w.slug)).toContain(work.slug);
    const detail = await anon.get(`/api/public/work/${work.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.work.gallery).toHaveLength(1);
    expect(detail.body.work.status).toBeUndefined(); // public shape exposes no admin fields

    // Appears on the homepage (fallback to latest when nothing is featured).
    const home = await anon.get('/api/public/home');
    expect(home.body.featuredWork.map((w: { id: string }) => w.id)).toContain(work.id);

    // Edits show immediately.
    const edit = await admin.put(`/api/admin/work/${work.id}`, {
      title: 'Peach Maggam Bridal Blouse',
      slug: work.slug,
      description: 'Updated description.',
      categoryId,
      coverId: cover.id,
      media: [],
      status: 'PUBLISHED',
    });
    expect(edit.status).toBe(200);
    const after = await anon.get(`/api/public/work/${work.slug}`);
    expect(after.body.work.title).toBe('Peach Maggam Bridal Blouse');
    expect(after.body.work.gallery).toHaveLength(0);
    // The removed gallery image is deleted from storage.
    expect((await anon.get(gallery.url)).status).toBe(404);

    // Unpublishing removes it from every public endpoint.
    await cust.post(`/api/me/favorites/${work.id}`).expect(201);
    await admin.post(`/api/admin/work/${work.id}/status`, { status: 'DRAFT' }).expect(200);
    expect((await anon.get(`/api/public/work/${work.slug}`)).status).toBe(404);
    expect((await anon.get('/api/public/work')).body.items).toHaveLength(0);
    expect((await anon.get('/api/public/home')).body.featuredWork).toHaveLength(0);
    // Favourites handle unpublished designs gracefully.
    const favs = await cust.get('/api/me/favorites');
    expect(favs.body.favorites).toEqual([expect.objectContaining({ workId: work.id, available: false, work: null })]);
  });

  it('will not publish without a cover photo', async () => {
    const res = await admin.post('/api/admin/work', {
      title: 'No cover',
      description: 'desc',
      categoryId,
      status: 'PUBLISHED',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/cover photo/);
  });

  it('filters by category and search', async () => {
    const other = await makeCategory();
    for (const [title, cat] of [
      ['Ruby Embroidered Lehenga', categoryId],
      ['Ivory Saree Blouse', other.id],
    ] as const) {
      const cover = await uploadImage(admin);
      await admin
        .post('/api/admin/work', { title, description: 'Lovely work', categoryId: cat, coverId: cover.id, status: 'PUBLISHED' })
        .expect(201);
    }
    const anon = await client();
    const byCat = await anon.get(`/api/public/work?category=${other.slug}`);
    expect(byCat.body.items.map((w: { title: string }) => w.title)).toEqual(['Ivory Saree Blouse']);
    const search = await anon.get('/api/public/work?q=ruby');
    expect(search.body.items.map((w: { title: string }) => w.title)).toEqual(['Ruby Embroidered Lehenga']);
  });

  it('deletes work together with its media files', async () => {
    const cover = await uploadImage(admin);
    const res = await admin.post('/api/admin/work', { title: 'Temp', description: 'x', categoryId, coverId: cover.id, status: 'PUBLISHED' });
    const anon = await client();
    expect((await anon.get(cover.url)).status).toBe(200);
    await admin.delete(`/api/admin/work/${res.body.work.id}`).expect(200);
    expect((await anon.get(cover.url)).status).toBe(404);
    expect(await prisma.mediaAsset.findUnique({ where: { id: cover.id } })).toBeNull();
  });

  it('does not let one design reuse another design’s files', async () => {
    const cover = await uploadImage(admin);
    await admin.post('/api/admin/work', { title: 'Owner', description: 'x', categoryId, coverId: cover.id }).expect(201);
    const res = await admin.post('/api/admin/work', { title: 'Thief', description: 'x', categoryId, coverId: cover.id });
    expect(res.status).toBe(400);
  });

  it('does not serve private files through the public media route', async () => {
    const anon = await client();
    expect((await anon.get('/media/private/2026/01/abc.webp')).status).toBe(404);
    expect((await anon.get('/media/public/../../.env')).status).toBe(404);
  });

  it('reports live dashboard stats', async () => {
    const stats = await admin.get('/api/admin/stats');
    expect(stats.status).toBe(200);
    const [pub, drafts] = await Promise.all([
      prisma.recentWork.count({ where: { status: 'PUBLISHED' } }),
      prisma.recentWork.count({ where: { status: 'DRAFT' } }),
    ]);
    expect(stats.body.work).toEqual({ published: pub, drafts });
    expect(stats.body.recentActivity.length).toBeGreaterThan(0);
  });
});

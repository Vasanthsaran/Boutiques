import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { body, id, optionalText, slug, text } from '../../lib/validate.js';
import { adminService, publicCategory, publicCollection, publicWorkCard, serviceInclude, workCardInclude } from '../../lib/serialize.js';
import { assertAssetsUsable, deleteAssets } from '../../lib/media.js';
import { invalidatePublic } from '../../lib/cache.js';
import { logActivity } from '../../lib/activity.js';
import { uniqueSlug } from './work.js';

export const adminCatalogRouter = Router();

const nullableId = z.union([id, z.null()]).optional().default(null);
const reorderSchema = z.object({ ids: z.array(id).max(200) });

// ════════════════════ Services ════════════════════

const ServiceSchema = z.object({
  title: text(100, 2),
  slug: z.union([slug, z.literal('')]).optional(),
  summary: optionalText(300),
  description: text(5000, 1),
  coverId: nullableId,
  imageIds: z.array(id).max(20).default([]),
  priceRange: optionalText(80),
  duration: optionalText(80),
  isAvailable: z.boolean().default(true),
  availability: optionalText(200),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

adminCatalogRouter.get('/services', async (_req, res) => {
  const rows = await prisma.service.findMany({ orderBy: { sortOrder: 'asc' }, include: serviceInclude });
  res.json({ services: rows.map(adminService) });
});

adminCatalogRouter.get('/services/:id', async (req, res) => {
  const s = await prisma.service.findUnique({ where: { id: id.parse(req.params.id) }, include: serviceInclude });
  if (!s) throw notFound('Service not found.');
  res.json({ service: adminService(s) });
});

async function checkServiceAssets(data: z.infer<typeof ServiceSchema>, serviceId?: string) {
  const ids = [...(data.coverId ? [data.coverId] : []), ...data.imageIds];
  const map = await assertAssetsUsable(ids, { type: 'service', id: serviceId });
  for (const a of map.values()) if (a.kind !== 'IMAGE') throw badRequest('Services accept images only.');
}

adminCatalogRouter.post('/services', async (req, res) => {
  const data = body(req, ServiceSchema);
  await checkServiceAssets(data);
  const max = await prisma.service.aggregate({ _max: { sortOrder: true } });
  const s = await prisma.$transaction(async (tx) => {
    const created = await tx.service.create({
      data: {
        title: data.title,
        slug: await uniqueSlug('service', data.slug || data.title, undefined, tx),
        summary: data.summary,
        description: data.description,
        coverId: data.coverId,
        priceRange: data.priceRange,
        duration: data.duration,
        isAvailable: data.isAvailable,
        availability: data.availability,
        status: data.status,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        images: { create: data.imageIds.map((assetId, i) => ({ assetId, sortOrder: i })) },
      },
      include: serviceInclude,
    });
    await logActivity(req.user!.id, 'CREATE', 'Service', created.id, `Created service “${created.title}”`, undefined, tx);
    return created;
  });
  invalidatePublic();
  res.status(201).json({ service: adminService(s) });
});

adminCatalogRouter.put('/services/:id', async (req, res) => {
  const sid = id.parse(req.params.id);
  const data = body(req, ServiceSchema);
  const existing = await prisma.service.findUnique({ where: { id: sid }, include: { images: true } });
  if (!existing) throw notFound('Service not found.');
  await checkServiceAssets(data, sid);
  const keep = new Set([data.coverId, ...data.imageIds].filter(Boolean));
  const removed = [existing.coverId, ...existing.images.map((i) => i.assetId)].filter(
    (a): a is string => Boolean(a) && !keep.has(a),
  );
  const s = await prisma.$transaction(async (tx) => {
    await tx.serviceImage.deleteMany({ where: { serviceId: sid } });
    const updated = await tx.service.update({
      where: { id: sid },
      data: {
        title: data.title,
        slug: data.slug && data.slug !== existing.slug ? await uniqueSlug('service', data.slug, sid, tx) : existing.slug,
        summary: data.summary,
        description: data.description,
        coverId: data.coverId,
        priceRange: data.priceRange,
        duration: data.duration,
        isAvailable: data.isAvailable,
        availability: data.availability,
        status: data.status,
        images: { create: data.imageIds.map((assetId, i) => ({ assetId, sortOrder: i })) },
      },
      include: serviceInclude,
    });
    await logActivity(req.user!.id, 'UPDATE', 'Service', sid, `Updated service “${updated.title}”`, undefined, tx);
    return updated;
  });
  await deleteAssets(removed);
  invalidatePublic();
  res.json({ service: adminService(s) });
});

adminCatalogRouter.put('/services-order', async (req, res) => {
  const { ids } = body(req, reorderSchema);
  await prisma.$transaction(ids.map((sid, i) => prisma.service.updateMany({ where: { id: sid }, data: { sortOrder: i } })));
  await logActivity(req.user!.id, 'REORDER', 'Service', null, 'Reordered services');
  invalidatePublic();
  res.json({ ok: true });
});

adminCatalogRouter.delete('/services/:id', async (req, res) => {
  const sid = id.parse(req.params.id);
  const s = await prisma.service.findUnique({ where: { id: sid }, include: { images: true } });
  if (!s) throw notFound('Service not found.');
  const assets = [s.coverId, ...s.images.map((i) => i.assetId)].filter(Boolean) as string[];
  await prisma.$transaction(async (tx) => {
    await tx.service.delete({ where: { id: sid } });
    await logActivity(req.user!.id, 'DELETE', 'Service', sid, `Deleted service “${s.title}”`, undefined, tx);
  });
  await deleteAssets(assets);
  invalidatePublic();
  res.json({ ok: true });
});

// ════════════════════ Categories ════════════════════

const CategorySchema = z.object({
  name: text(80, 2),
  slug: z.union([slug, z.literal('')]).optional(),
  description: optionalText(500),
  coverId: nullableId,
  isActive: z.boolean().default(true),
});

adminCatalogRouter.get('/categories', async (_req, res) => {
  const rows = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { cover: true, _count: { select: { works: true } } },
  });
  res.json({ categories: rows.map((c) => ({ ...publicCategory(c, c._count.works), isActive: c.isActive, sortOrder: c.sortOrder })) });
});

adminCatalogRouter.post('/categories', async (req, res) => {
  const data = body(req, CategorySchema);
  if (data.coverId) await assertAssetsUsable([data.coverId], { type: 'category' });
  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const c = await prisma.category.create({
    data: {
      name: data.name,
      slug: await uniqueSlug('category', data.slug || data.name),
      description: data.description,
      coverId: data.coverId,
      isActive: data.isActive,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    include: { cover: true },
  });
  await logActivity(req.user!.id, 'CREATE', 'Category', c.id, `Created category “${c.name}”`);
  invalidatePublic();
  res.status(201).json({ category: publicCategory(c) });
});

adminCatalogRouter.put('/categories/:id', async (req, res) => {
  const cid = id.parse(req.params.id);
  const data = body(req, CategorySchema);
  const existing = await prisma.category.findUnique({ where: { id: cid } });
  if (!existing) throw notFound('Category not found.');
  if (data.coverId) await assertAssetsUsable([data.coverId], { type: 'category', id: cid });
  const c = await prisma.category.update({
    where: { id: cid },
    data: {
      name: data.name,
      slug: data.slug && data.slug !== existing.slug ? await uniqueSlug('category', data.slug, cid) : existing.slug,
      description: data.description,
      coverId: data.coverId,
      isActive: data.isActive,
    },
    include: { cover: true },
  });
  if (existing.coverId && existing.coverId !== data.coverId) await deleteAssets([existing.coverId]);
  await logActivity(req.user!.id, 'UPDATE', 'Category', cid, `Updated category “${c.name}”`);
  invalidatePublic();
  res.json({ category: publicCategory(c) });
});

adminCatalogRouter.put('/categories-order', async (req, res) => {
  const { ids } = body(req, reorderSchema);
  await prisma.$transaction(ids.map((cid, i) => prisma.category.updateMany({ where: { id: cid }, data: { sortOrder: i } })));
  await logActivity(req.user!.id, 'REORDER', 'Category', null, 'Reordered categories');
  invalidatePublic();
  res.json({ ok: true });
});

adminCatalogRouter.delete('/categories/:id', async (req, res) => {
  const cid = id.parse(req.params.id);
  const c = await prisma.category.findUnique({ where: { id: cid }, include: { _count: { select: { works: true } } } });
  if (!c) throw notFound('Category not found.');
  if (c._count.works > 0) {
    throw conflict(`“${c.name}” still has ${c._count.works} design(s). Move them to another category first.`);
  }
  await prisma.category.delete({ where: { id: cid } });
  if (c.coverId) await deleteAssets([c.coverId]);
  await logActivity(req.user!.id, 'DELETE', 'Category', cid, `Deleted category “${c.name}”`);
  invalidatePublic();
  res.json({ ok: true });
});

// ════════════════════ Collections ════════════════════

const CollectionSchema = z.object({
  title: text(100, 2),
  slug: z.union([slug, z.literal('')]).optional(),
  description: optionalText(1000),
  coverId: nullableId,
  featured: z.boolean().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  workIds: z.array(id).max(200).default([]),
});

adminCatalogRouter.get('/collections', async (_req, res) => {
  const rows = await prisma.collection.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { cover: true, works: { orderBy: { sortOrder: 'asc' }, select: { workId: true } } },
  });
  res.json({
    collections: rows.map((c) => ({
      ...publicCollection(c, c.works.length),
      status: c.status,
      sortOrder: c.sortOrder,
      workIds: c.works.map((w) => w.workId),
    })),
  });
});

adminCatalogRouter.get('/collections/:id', async (req, res) => {
  const c = await prisma.collection.findUnique({
    where: { id: id.parse(req.params.id) },
    include: { cover: true, works: { orderBy: { sortOrder: 'asc' }, include: { work: { include: workCardInclude } } } },
  });
  if (!c) throw notFound('Collection not found.');
  res.json({
    collection: {
      ...publicCollection(c, c.works.length),
      status: c.status,
      workIds: c.works.map((w) => w.workId),
      works: c.works.map((w) => ({ ...publicWorkCard(w.work), status: w.work.status })),
    },
  });
});

async function saveCollection(data: z.infer<typeof CollectionSchema>, actorId: string, existingId?: string) {
  if (data.coverId) await assertAssetsUsable([data.coverId], { type: 'collection', id: existingId });
  if (data.workIds.length) {
    const count = await prisma.recentWork.count({ where: { id: { in: data.workIds } } });
    if (count !== new Set(data.workIds).size) throw badRequest('Some selected designs no longer exist.');
  }
  return prisma.$transaction(async (tx) => {
    const existing = existingId ? await tx.collection.findUnique({ where: { id: existingId } }) : null;
    const max = await tx.collection.aggregate({ _max: { sortOrder: true } });
    const fields = {
      title: data.title,
      description: data.description,
      coverId: data.coverId,
      featured: data.featured,
      status: data.status,
    };
    const c = existing
      ? await tx.collection.update({
          where: { id: existing.id },
          data: {
            ...fields,
            slug: data.slug && data.slug !== existing.slug ? await uniqueSlug('collection', data.slug, existing.id, tx) : existing.slug,
          },
        })
      : await tx.collection.create({
          data: { ...fields, slug: await uniqueSlug('collection', data.slug || data.title, undefined, tx), sortOrder: (max._max.sortOrder ?? 0) + 1 },
        });
    await tx.collectionWork.deleteMany({ where: { collectionId: c.id } });
    const uniqueIds = [...new Set(data.workIds)];
    if (uniqueIds.length) {
      await tx.collectionWork.createMany({ data: uniqueIds.map((workId, i) => ({ collectionId: c.id, workId, sortOrder: i })) });
    }
    await logActivity(actorId, existing ? 'UPDATE' : 'CREATE', 'Collection', c.id, `${existing ? 'Updated' : 'Created'} collection “${c.title}”`, undefined, tx);
    return { c, oldCover: existing?.coverId && existing.coverId !== data.coverId ? existing.coverId : null };
  });
}

adminCatalogRouter.post('/collections', async (req, res) => {
  const data = body(req, CollectionSchema);
  const { c } = await saveCollection(data, req.user!.id);
  invalidatePublic();
  res.status(201).json({ collection: { id: c.id, slug: c.slug } });
});

adminCatalogRouter.put('/collections/:id', async (req, res) => {
  const cid = id.parse(req.params.id);
  if (!(await prisma.collection.findUnique({ where: { id: cid } }))) throw notFound('Collection not found.');
  const data = body(req, CollectionSchema);
  const { c, oldCover } = await saveCollection(data, req.user!.id, cid);
  if (oldCover) await deleteAssets([oldCover]);
  invalidatePublic();
  res.json({ collection: { id: c.id, slug: c.slug } });
});

adminCatalogRouter.put('/collections-order', async (req, res) => {
  const { ids } = body(req, reorderSchema);
  await prisma.$transaction(ids.map((cid, i) => prisma.collection.updateMany({ where: { id: cid }, data: { sortOrder: i } })));
  await logActivity(req.user!.id, 'REORDER', 'Collection', null, 'Reordered collections');
  invalidatePublic();
  res.json({ ok: true });
});

adminCatalogRouter.delete('/collections/:id', async (req, res) => {
  const cid = id.parse(req.params.id);
  const c = await prisma.collection.findUnique({ where: { id: cid } });
  if (!c) throw notFound('Collection not found.');
  await prisma.collection.delete({ where: { id: cid } });
  if (c.coverId) await deleteAssets([c.coverId]);
  await logActivity(req.user!.id, 'DELETE', 'Collection', cid, `Deleted collection “${c.title}”`);
  invalidatePublic();
  res.json({ ok: true });
});

// ════════════════════ Testimonials (owner-entered, genuine only) ════════════════════

const TestimonialSchema = z.object({
  name: text(80, 1),
  context: optionalText(120),
  text: text(1500, 5),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

adminCatalogRouter.get('/testimonials', async (_req, res) => {
  const rows = await prisma.testimonial.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ testimonials: rows });
});

adminCatalogRouter.post('/testimonials', async (req, res) => {
  const data = body(req, TestimonialSchema);
  const max = await prisma.testimonial.aggregate({ _max: { sortOrder: true } });
  const t = await prisma.testimonial.create({ data: { ...data, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  await logActivity(req.user!.id, 'CREATE', 'Testimonial', t.id, `Added testimonial from ${t.name}`);
  invalidatePublic();
  res.status(201).json({ testimonial: t });
});

adminCatalogRouter.put('/testimonials/:id', async (req, res) => {
  const tid = id.parse(req.params.id);
  const data = body(req, TestimonialSchema);
  const t = await prisma.testimonial.update({ where: { id: tid }, data }).catch(() => null);
  if (!t) throw notFound('Testimonial not found.');
  await logActivity(req.user!.id, 'UPDATE', 'Testimonial', tid, `Updated testimonial from ${t.name}`);
  invalidatePublic();
  res.json({ testimonial: t });
});

adminCatalogRouter.delete('/testimonials/:id', async (req, res) => {
  const tid = id.parse(req.params.id);
  const t = await prisma.testimonial.delete({ where: { id: tid } }).catch(() => null);
  if (!t) throw notFound('Testimonial not found.');
  await logActivity(req.user!.id, 'DELETE', 'Testimonial', tid, `Deleted testimonial from ${t.name}`);
  invalidatePublic();
  res.json({ ok: true });
});

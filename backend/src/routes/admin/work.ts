import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { body, id, isoDate, optionalText, query, slug, slugify, text } from '../../lib/validate.js';
import { adminWork, workDetailInclude } from '../../lib/serialize.js';
import { assertAssetsUsable, deleteAssets } from '../../lib/media.js';
import { invalidatePublic } from '../../lib/cache.js';
import { logActivity } from '../../lib/activity.js';

export const adminWorkRouter = Router();

type Tx = Prisma.TransactionClient | PrismaClient;

export async function uniqueSlug(
  model: 'recentWork' | 'service' | 'collection' | 'category',
  base: string,
  excludeId?: string,
  tx: Tx = prisma,
) {
  const root = slugify(base);
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (tx[model] as any).findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${root}-${Date.now()}`;
}

const MediaItem = z.object({
  assetId: id,
  role: z.enum(['GALLERY', 'BEFORE', 'AFTER', 'VIDEO']),
  caption: optionalText(200),
});

const WorkSchema = z.object({
  title: text(140, 2),
  slug: z.union([slug, z.literal('')]).optional(),
  description: text(5000, 1),
  categoryId: id,
  coverId: z.union([id, z.null()]).optional().default(null),
  media: z.array(MediaItem).max(40).default([]),
  completedAt: z.union([isoDate, z.literal(''), z.null()]).optional().transform((v) => v || null),
  featured: z.boolean().default(false),
  priceRange: optionalText(80),
  enquiryEnabled: z.boolean().default(true),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  collectionIds: z.array(id).max(20).default([]),
});
type WorkInput = z.infer<typeof WorkSchema>;

async function validateWorkInput(data: WorkInput, workId?: string) {
  const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!category) throw badRequest('Please choose a valid category.');

  const assetIds = [...(data.coverId ? [data.coverId] : []), ...data.media.map((m) => m.assetId)];
  const byId = await assertAssetsUsable(assetIds, { type: 'work', id: workId });
  if (data.coverId && byId.get(data.coverId)!.kind !== 'IMAGE') throw badRequest('The cover must be an image.');
  for (const m of data.media) {
    const kind = byId.get(m.assetId)!.kind;
    if (m.role === 'VIDEO' && kind !== 'VIDEO') throw badRequest('Only video files can be added as the video.');
    if (m.role !== 'VIDEO' && kind !== 'IMAGE') throw badRequest('Videos can only be added in the video slot.');
  }
  if (data.media.filter((m) => m.role === 'VIDEO').length > 1) throw badRequest('Only one video can be added per design.');
  if (data.media.filter((m) => m.role === 'BEFORE').length > 1 || data.media.filter((m) => m.role === 'AFTER').length > 1) {
    throw badRequest('Add at most one “before” and one “after” photo.');
  }
  const hasBefore = data.media.some((m) => m.role === 'BEFORE');
  const hasAfter = data.media.some((m) => m.role === 'AFTER');
  if (hasBefore !== hasAfter) throw badRequest('Before/after needs both a “before” and an “after” photo.');

  if (data.status === 'PUBLISHED' && !data.coverId) {
    throw badRequest('Add a cover photo before publishing. You can save as a draft without one.');
  }
  if (data.collectionIds.length) {
    const count = await prisma.collection.count({ where: { id: { in: data.collectionIds } } });
    if (count !== data.collectionIds.length) throw badRequest('One of the selected collections no longer exists.');
  }
}

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'all']).default('all'),
  category: z.string().max(40).optional(),
  featured: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

adminWorkRouter.get('/', async (req, res) => {
  const q = query(req, listQuery);
  const where: Prisma.RecentWorkWhereInput = {};
  if (q.status !== 'all') where.status = q.status;
  if (q.category) where.categoryId = q.category;
  if (q.featured) where.featured = q.featured === 'true';
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { slug: { contains: q.q, mode: 'insensitive' } },
      { description: { contains: q.q, mode: 'insensitive' } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.recentWork.count({ where }),
    prisma.recentWork.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { ...workDetailInclude, _count: { select: { favorites: true, enquiries: true } } },
    }),
  ]);
  res.json({
    items: rows.map((w) => ({ ...adminWork(w), favoriteCount: w._count.favorites, enquiryCount: w._count.enquiries })),
    total,
    page: q.page,
    limit: q.limit,
  });
});

adminWorkRouter.get('/featured', async (_req, res) => {
  const rows = await prisma.recentWork.findMany({
    where: { featured: true },
    orderBy: [{ featuredOrder: 'asc' }, { publishedAt: 'desc' }],
    include: workDetailInclude,
  });
  res.json({ items: rows.map((w) => adminWork(w)) });
});

adminWorkRouter.put('/featured-order', async (req, res) => {
  const { ids } = body(req, z.object({ ids: z.array(id).max(100) }));
  await prisma.$transaction(ids.map((wid, i) => prisma.recentWork.updateMany({ where: { id: wid }, data: { featuredOrder: i } })));
  await logActivity(req.user!.id, 'REORDER', 'RecentWork', null, 'Reordered featured work');
  invalidatePublic();
  res.json({ ok: true });
});

adminWorkRouter.get('/:id', async (req, res) => {
  const w = await prisma.recentWork.findUnique({
    where: { id: id.parse(req.params.id) },
    include: { ...workDetailInclude, collections: { select: { collectionId: true } } },
  });
  if (!w) throw notFound('Design not found.');
  res.json({ work: adminWork(w) });
});

async function writeWork(tx: Prisma.TransactionClient, workId: string, data: WorkInput) {
  await tx.recentWorkMedia.deleteMany({ where: { workId } });
  if (data.media.length) {
    await tx.recentWorkMedia.createMany({
      data: data.media.map((m, i) => ({ workId, assetId: m.assetId, role: m.role, caption: m.caption, sortOrder: i })),
    });
  }
  await tx.collectionWork.deleteMany({ where: { workId, collectionId: { notIn: data.collectionIds } } });
  for (const cid of data.collectionIds) {
    await tx.collectionWork.upsert({
      where: { collectionId_workId: { collectionId: cid, workId } },
      create: { collectionId: cid, workId, sortOrder: 999 },
      update: {},
    });
  }
}

adminWorkRouter.post('/', async (req, res) => {
  const data = body(req, WorkSchema);
  await validateWorkInput(data);
  const work = await prisma.$transaction(async (tx) => {
    const finalSlug = data.slug ? await uniqueSlug('recentWork', data.slug, undefined, tx) : await uniqueSlug('recentWork', data.title, undefined, tx);
    const w = await tx.recentWork.create({
      data: {
        title: data.title,
        slug: finalSlug,
        description: data.description,
        categoryId: data.categoryId,
        coverId: data.coverId,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
        featured: data.featured,
        priceRange: data.priceRange,
        enquiryEnabled: data.enquiryEnabled,
        status: data.status,
        publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
      },
    });
    await writeWork(tx, w.id, data);
    await logActivity(
      req.user!.id,
      data.status === 'PUBLISHED' ? 'PUBLISH' : 'CREATE_DRAFT',
      'RecentWork',
      w.id,
      `${data.status === 'PUBLISHED' ? 'Published' : 'Saved draft'} “${w.title}”`,
      undefined,
      tx,
    );
    return tx.recentWork.findUniqueOrThrow({
      where: { id: w.id },
      include: { ...workDetailInclude, collections: { select: { collectionId: true } } },
    });
  });
  invalidatePublic();
  res.status(201).json({ work: adminWork(work) });
});

adminWorkRouter.put('/:id', async (req, res) => {
  const workId = id.parse(req.params.id);
  const data = body(req, WorkSchema);
  const existing = await prisma.recentWork.findUnique({ where: { id: workId }, include: { media: true } });
  if (!existing) throw notFound('Design not found.');
  await validateWorkInput(data, workId);

  const keep = new Set([data.coverId, ...data.media.map((m) => m.assetId)].filter(Boolean));
  const removed = [existing.coverId, ...existing.media.map((m) => m.assetId)].filter(
    (a): a is string => Boolean(a) && !keep.has(a),
  );

  const work = await prisma.$transaction(async (tx) => {
    const finalSlug =
      data.slug && data.slug !== existing.slug ? await uniqueSlug('recentWork', data.slug, workId, tx) : existing.slug;
    const w = await tx.recentWork.update({
      where: { id: workId },
      data: {
        title: data.title,
        slug: finalSlug,
        description: data.description,
        categoryId: data.categoryId,
        coverId: data.coverId,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
        featured: data.featured,
        priceRange: data.priceRange,
        enquiryEnabled: data.enquiryEnabled,
        status: data.status,
        publishedAt: data.status === 'PUBLISHED' ? existing.publishedAt ?? new Date() : null,
      },
    });
    await writeWork(tx, workId, data);
    const action =
      existing.status !== data.status ? (data.status === 'PUBLISHED' ? 'PUBLISH' : 'UNPUBLISH') : 'UPDATE';
    await logActivity(req.user!.id, action, 'RecentWork', workId, `${action === 'UPDATE' ? 'Updated' : action === 'PUBLISH' ? 'Published' : 'Unpublished'} “${w.title}”`, undefined, tx);
    return tx.recentWork.findUniqueOrThrow({
      where: { id: workId },
      include: { ...workDetailInclude, collections: { select: { collectionId: true } } },
    });
  });
  await deleteAssets(removed);
  invalidatePublic();
  res.json({ work: adminWork(work) });
});

adminWorkRouter.post('/:id/status', async (req, res) => {
  const workId = id.parse(req.params.id);
  const { status } = body(req, z.object({ status: z.enum(['DRAFT', 'PUBLISHED']) }));
  const w = await prisma.recentWork.findUnique({ where: { id: workId } });
  if (!w) throw notFound('Design not found.');
  if (status === 'PUBLISHED' && !w.coverId) throw badRequest('Add a cover photo before publishing.');
  const updated = await prisma.recentWork.update({
    where: { id: workId },
    data: { status, publishedAt: status === 'PUBLISHED' ? w.publishedAt ?? new Date() : null },
    include: { ...workDetailInclude, collections: { select: { collectionId: true } } },
  });
  await logActivity(req.user!.id, status === 'PUBLISHED' ? 'PUBLISH' : 'UNPUBLISH', 'RecentWork', workId, `${status === 'PUBLISHED' ? 'Published' : 'Unpublished'} “${w.title}”`);
  invalidatePublic();
  res.json({ work: adminWork(updated) });
});

adminWorkRouter.post('/:id/featured', async (req, res) => {
  const workId = id.parse(req.params.id);
  const { featured } = body(req, z.object({ featured: z.boolean() }));
  const w = await prisma.recentWork.update({
    where: { id: workId },
    data: { featured },
    include: { ...workDetailInclude, collections: { select: { collectionId: true } } },
  }).catch(() => null);
  if (!w) throw notFound('Design not found.');
  await logActivity(req.user!.id, featured ? 'FEATURE' : 'UNFEATURE', 'RecentWork', workId, `${featured ? 'Featured' : 'Unfeatured'} “${w.title}”`);
  invalidatePublic();
  res.json({ work: adminWork(w) });
});

adminWorkRouter.delete('/:id', async (req, res) => {
  const workId = id.parse(req.params.id);
  const w = await prisma.recentWork.findUnique({ where: { id: workId }, include: { media: true } });
  if (!w) throw notFound('Design not found.');
  const assetIds = [w.coverId, ...w.media.map((m) => m.assetId)].filter(Boolean) as string[];
  await prisma.$transaction(async (tx) => {
    await tx.recentWork.delete({ where: { id: workId } });
    await logActivity(req.user!.id, 'DELETE', 'RecentWork', workId, `Deleted “${w.title}”`, undefined, tx);
  });
  await deleteAssets(assetIds);
  invalidatePublic();
  res.json({ ok: true });
});

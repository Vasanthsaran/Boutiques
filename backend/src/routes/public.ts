import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { cached } from '../lib/cache.js';
import { notFound } from '../lib/errors.js';
import { query, slug } from '../lib/validate.js';
import { getBooking, getBusiness, getEnquirySettings, getHomepage, resolveHomeImages, type HomeContent } from '../lib/settings.js';
import {
  publicCategory,
  publicCollection,
  publicService,
  publicWorkCard,
  publicWorkDetail,
  serviceInclude,
  workCardInclude,
  workDetailInclude,
} from '../lib/serialize.js';
import { config } from '../config.js';

export const publicRouter = Router();

// Browsers revalidate on every visit (ETag), so published edits show immediately.
publicRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
});

const PUBLISHED = { status: 'PUBLISHED' } as const;

/** Site-wide settings needed by every page (header/footer/contact/forms). */
publicRouter.get('/site', async (_req, res) => {
  const data = await cached('site', async () => {
    const [business, booking, enquiries, services, categories] = await Promise.all([
      getBusiness(),
      getBooking(),
      getEnquirySettings(),
      prisma.service.findMany({
        where: PUBLISHED,
        orderBy: { sortOrder: 'asc' },
        select: { id: true, slug: true, title: true, isAvailable: true },
      }),
      prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, slug: true, name: true },
      }),
    ]);
    const hasHours = (await prisma.appointmentAvailability.count()) > 0;
    const home = await getHomepage();
    return {
      footerBlurb: home.published.footer.blurb,
      announcement: home.published.announcement,
      business,
      booking: {
        enabled: booking.enabled && hasHours,
        configured: hasHours,
        timezone: booking.timezone,
        slotMinutes: booking.slotMinutes,
        allowGuests: booking.allowGuests,
        maxAdvanceDays: booking.maxAdvanceDays,
      },
      enquiries: { allowGuests: enquiries.allowGuests },
      services,
      categories,
      emailEnabled: config.smtpConfigured,
    };
  });
  res.json(data);
});

export async function buildHome(content: HomeContent) {
  const [services, featuredWork, collections, testimonials] = await Promise.all([
    prisma.service.findMany({ where: PUBLISHED, orderBy: { sortOrder: 'asc' }, include: serviceInclude }),
    prisma.recentWork.findMany({
      where: { ...PUBLISHED, featured: true },
      orderBy: [{ featuredOrder: 'asc' }, { publishedAt: 'desc' }],
      take: content.featuredWork.limit,
      include: workCardInclude,
    }),
    (async () => {
      const ids = content.collections.collectionIds;
      const where: Prisma.CollectionWhereInput = ids.length ? { ...PUBLISHED, id: { in: ids } } : { ...PUBLISHED, featured: true };
      const rows = await prisma.collection.findMany({ where, include: { cover: true }, orderBy: { sortOrder: 'asc' }, take: 8 });
      if (ids.length) rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return rows.map((c) => publicCollection(c));
    })(),
    prisma.testimonial.findMany({ where: PUBLISHED, orderBy: { sortOrder: 'asc' }, take: 12 }),
  ]);
  // If nothing is flagged featured yet, fall back to the latest published work.
  const work = featuredWork.length
    ? featuredWork
    : await prisma.recentWork.findMany({
        where: PUBLISHED,
        orderBy: { publishedAt: 'desc' },
        take: content.featuredWork.limit,
        include: workCardInclude,
      });
  return {
    content: await resolveHomeImages(content),
    services: services.map(publicService),
    featuredWork: work.map(publicWorkCard),
    collections,
    testimonials: testimonials.map((t) => ({ id: t.id, name: t.name, context: t.context, text: t.text })),
  };
}

publicRouter.get('/home', async (_req, res) => {
  const data = await cached('home', async () => buildHome((await getHomepage()).published));
  res.json(data);
});

publicRouter.get('/services', async (_req, res) => {
  const data = await cached('services', async () => {
    const rows = await prisma.service.findMany({ where: PUBLISHED, orderBy: { sortOrder: 'asc' }, include: serviceInclude });
    return { services: rows.map(publicService) };
  });
  res.json(data);
});

publicRouter.get('/services/:slug', async (req, res) => {
  const s = slug.parse(req.params.slug);
  const data = await cached(`service:${s}`, async () => {
    const service = await prisma.service.findFirst({ where: { slug: s, ...PUBLISHED }, include: serviceInclude });
    return service ? { service: publicService(service) } : null;
  });
  if (!data) throw notFound('This service is not available.');
  res.json(data);
});

publicRouter.get('/categories', async (_req, res) => {
  const data = await cached('categories', async () => {
    const [rows, counts] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { cover: true } }),
      prisma.recentWork.groupBy({ by: ['categoryId'], where: PUBLISHED, _count: true }),
    ]);
    const countMap = new Map(counts.map((c) => [c.categoryId, c._count]));
    return { categories: rows.map((c) => publicCategory(c, countMap.get(c.id) ?? 0)) };
  });
  res.json(data);
});

publicRouter.get('/collections', async (_req, res) => {
  const data = await cached('collections', async () => {
    const rows = await prisma.collection.findMany({
      where: PUBLISHED,
      orderBy: { sortOrder: 'asc' },
      include: { cover: true, _count: { select: { works: { where: { work: PUBLISHED } } } } },
    });
    return { collections: rows.map((c) => publicCollection(c, c._count.works)) };
  });
  res.json(data);
});

publicRouter.get('/collections/:slug', async (req, res) => {
  const s = slug.parse(req.params.slug);
  const data = await cached(`collection:${s}`, async () => {
    const c = await prisma.collection.findFirst({
      where: { slug: s, ...PUBLISHED },
      include: {
        cover: true,
        works: {
          where: { work: PUBLISHED },
          orderBy: { sortOrder: 'asc' },
          include: { work: { include: workCardInclude } },
        },
      },
    });
    if (!c) return null;
    return { collection: publicCollection(c, c.works.length), works: c.works.map((cw) => publicWorkCard(cw.work)) };
  });
  if (!data) throw notFound('This collection is not available.');
  res.json(data);
});

const WorkQuery = z.object({
  category: z.string().max(120).optional(),
  q: z.string().trim().max(100).optional(),
  featured: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(18),
});

publicRouter.get('/work', async (req, res) => {
  const q = query(req, WorkQuery);
  const key = `work:${JSON.stringify(q)}`;
  const data = await cached(key, async () => {
    const where: Prisma.RecentWorkWhereInput = { ...PUBLISHED };
    if (q.category && q.category !== 'all') where.category = { slug: q.category, isActive: true };
    if (q.featured === 'true') where.featured = true;
    if (q.q) {
      where.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
        { category: { name: { contains: q.q, mode: 'insensitive' } } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.recentWork.count({ where }),
      prisma.recentWork.findMany({
        where,
        orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: workCardInclude,
      }),
    ]);
    return {
      items: rows.map(publicWorkCard),
      page: q.page,
      limit: q.limit,
      total,
      hasMore: q.page * q.limit < total,
    };
  });
  res.json(data);
});

publicRouter.get('/work/:slug', async (req, res) => {
  const s = slug.parse(req.params.slug);
  const data = await cached(`work:${s}`, async () => {
    const work = await prisma.recentWork.findFirst({ where: { slug: s, ...PUBLISHED }, include: workDetailInclude });
    if (!work) return null;
    const related = await prisma.recentWork.findMany({
      where: { ...PUBLISHED, categoryId: work.categoryId, id: { not: work.id } },
      orderBy: { publishedAt: 'desc' },
      take: 4,
      include: workCardInclude,
    });
    if (related.length < 4) {
      const more = await prisma.recentWork.findMany({
        where: { ...PUBLISHED, id: { notIn: [work.id, ...related.map((r) => r.id)] } },
        orderBy: { publishedAt: 'desc' },
        take: 4 - related.length,
        include: workCardInclude,
      });
      related.push(...more);
    }
    return { work: publicWorkDetail(work), related: related.map(publicWorkCard) };
  });
  if (!data) throw notFound('This design is not available.');
  res.json(data);
});

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DateTime } from 'luxon';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { body, id, optionalText, query } from '../../lib/validate.js';
import { assertAssetsUsable, serializeAsset, storeUpload } from '../../lib/media.js';
import { logActivity } from '../../lib/activity.js';
import { invalidatePublic } from '../../lib/cache.js';
import { appUrl } from '../../lib/mailer.js';
import {
  BusinessSchema,
  EnquirySettingsSchema,
  getBooking,
  getBusiness,
  getEnquirySettings,
  getHomepage,
  HomeContentSchema,
  write,
} from '../../lib/settings.js';
import { requireAdmin } from '../../middleware/auth.js';
import { buildHome } from '../public.js';
import { createToken } from '../auth.js';
import { adminWorkRouter } from './work.js';
import { adminCatalogRouter } from './catalog.js';
import { adminEnquiriesRouter } from './enquiries.js';
import { adminAppointmentsRouter } from './appointments.js';

export const adminRouter = Router();

// Server-side RBAC: everything below requires an ADMIN session.
adminRouter.use(requireAdmin);
adminRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

adminRouter.use('/work', adminWorkRouter);
adminRouter.use('/enquiries', adminEnquiriesRouter);
adminRouter.use('/appointments', adminAppointmentsRouter);
adminRouter.use('/', adminCatalogRouter);

// ───────── Dashboard stats (always live from the DB) ─────────

adminRouter.get('/stats', async (_req, res) => {
  const booking = await getBooking();
  const now = DateTime.utc();
  const weekAhead = now.plus({ days: 7 }).toJSDate();
  const [
    published,
    drafts,
    categories,
    collections,
    customers,
    newEnquiries,
    awaitingEnquiries,
    pendingAppts,
    confirmedUpcoming,
    upcomingWeek,
    rescheduleRequests,
    todays,
    recentActivity,
  ] = await Promise.all([
    prisma.recentWork.count({ where: { status: 'PUBLISHED' } }),
    prisma.recentWork.count({ where: { status: 'DRAFT' } }),
    prisma.category.count(),
    prisma.collection.count(),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.enquiry.count({ where: { status: 'NEW', archivedAt: null } }),
    prisma.enquiry.count({ where: { awaitingReply: true, status: { not: 'CLOSED' }, archivedAt: null } }),
    prisma.appointment.count({ where: { status: 'PENDING', startAt: { gte: now.toJSDate() } } }),
    prisma.appointment.count({ where: { status: 'CONFIRMED', startAt: { gte: now.toJSDate() } } }),
    prisma.appointment.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { gte: now.toJSDate(), lt: weekAhead } },
      orderBy: { startAt: 'asc' },
      take: 8,
      select: { id: true, reference: true, name: true, serviceTitle: true, startAt: true, status: true },
    }),
    prisma.appointmentChangeRequest.count({ where: { status: 'PENDING' } }),
    (() => {
      const dayStart = now.setZone(booking.timezone).startOf('day');
      return prisma.appointment.count({
        where: { status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { gte: dayStart.toJSDate(), lt: dayStart.plus({ days: 1 }).toJSDate() } },
      });
    })(),
    prisma.adminActivityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { actor: { select: { name: true } } } }),
  ]);
  res.json({
    timezone: booking.timezone,
    work: { published, drafts },
    categories,
    collections,
    customers,
    enquiries: { new: newEnquiries, awaitingReply: awaitingEnquiries },
    appointments: { pending: pendingAppts, confirmedUpcoming, today: todays, rescheduleRequests },
    upcoming: upcomingWeek.map((a) => ({ ...a, startAt: a.startAt.toISOString() })),
    recentActivity: recentActivity.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      summary: l.summary,
      actor: l.actor?.name ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
    setup: {
      hasWorkingHours: (await prisma.appointmentAvailability.count()) > 0,
      hasContactInfo: Boolean((await getBusiness()).phone || (await getBusiness()).email),
      emailConfigured: config.smtpConfigured,
      storage: config.STORAGE_DRIVER,
    },
  });
});

adminRouter.get('/activity', async (req, res) => {
  const q = query(
    req,
    z.object({
      entityType: z.string().max(40).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  );
  const where: Prisma.AdminActivityLogWhereInput = q.entityType ? { entityType: q.entityType } : {};
  const [total, rows] = await Promise.all([
    prisma.adminActivityLog.count({ where }),
    prisma.adminActivityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);
  res.json({
    total,
    items: rows.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      summary: l.summary,
      actor: l.actor ? l.actor.name : null,
      createdAt: l.createdAt.toISOString(),
    })),
  });
});

// ───────── Media upload ─────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxVideoBytes, files: 1, fields: 5 },
});

adminRouter.post(
  '/media',
  (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return next(
          badRequest(
            err.code === 'LIMIT_FILE_SIZE'
              ? `That file is too large. Images up to ${config.uploads.maxImageBytes / 1024 / 1024} MB, videos up to ${config.uploads.maxVideoBytes / 1024 / 1024} MB.`
              : 'The upload could not be processed.',
          ),
        );
      }
      next(err);
    }),
  async (req, res) => {
    if (!req.file) throw badRequest('Choose a file to upload.');
    const { alt, allowVideo } = z
      .object({ alt: optionalText(200), allowVideo: z.enum(['true', 'false']).optional() })
      .parse(req.body ?? {});
    const asset = await storeUpload(req.file, { allowVideo: allowVideo === 'true', uploadedById: req.user!.id, alt });
    res.status(201).json({ asset: serializeAsset(asset) });
  },
);

adminRouter.patch('/media/:id', async (req, res) => {
  const { alt } = body(req, z.object({ alt: optionalText(200) }));
  const a = await prisma.mediaAsset.update({ where: { id: id.parse(req.params.id) }, data: { alt } }).catch(() => null);
  if (!a) throw notFound();
  invalidatePublic();
  res.json({ asset: serializeAsset(a) });
});

// ───────── Customers ─────────

adminRouter.get('/customers', async (req, res) => {
  const q = query(
    req,
    z.object({
      q: z.string().trim().max(100).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
  );
  const where: Prisma.UserWhereInput = { role: 'CUSTOMER' };
  if (q.q) {
    where.OR = [
      { name: { contains: q.q, mode: 'insensitive' } },
      { email: { contains: q.q, mode: 'insensitive' } },
      { phone: { contains: q.q } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { appointments: true, enquiries: true, favorites: true } },
      },
    }),
  ]);
  res.json({
    total,
    items: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      isActive: u.isActive,
      emailVerified: Boolean(u.emailVerifiedAt),
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      counts: u._count,
    })),
  });
});

adminRouter.get('/customers/:id', async (req, res) => {
  const u = await prisma.user.findFirst({
    where: { id: id.parse(req.params.id), role: 'CUSTOMER' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      emailVerifiedAt: true,
      createdAt: true,
      lastLoginAt: true,
      appointments: { orderBy: { startAt: 'desc' }, take: 50, select: { id: true, reference: true, serviceTitle: true, startAt: true, status: true } },
      enquiries: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, reference: true, subject: true, status: true, createdAt: true } },
      _count: { select: { favorites: true } },
    },
  });
  if (!u) throw notFound('Customer not found.');
  res.json({ customer: { ...u, emailVerified: Boolean(u.emailVerifiedAt), favoriteCount: u._count.favorites } });
});

adminRouter.patch('/customers/:id', async (req, res) => {
  const cid = id.parse(req.params.id);
  const { isActive } = body(req, z.object({ isActive: z.boolean() }));
  const u = await prisma.user.findFirst({ where: { id: cid, role: 'CUSTOMER' } });
  if (!u) throw notFound('Customer not found.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: cid }, data: { isActive } }),
    ...(isActive ? [] : [prisma.session.deleteMany({ where: { userId: cid } })]),
  ]);
  await logActivity(req.user!.id, isActive ? 'ENABLE_CUSTOMER' : 'DISABLE_CUSTOMER', 'User', cid, `${isActive ? 'Enabled' : 'Disabled'} account ${u.email}`);
  res.json({ ok: true });
});

/** Fallback for sites without email: admin generates a one-time reset link to share with the customer. */
adminRouter.post('/customers/:id/reset-link', async (req, res) => {
  const cid = id.parse(req.params.id);
  const u = await prisma.user.findFirst({ where: { id: cid, role: 'CUSTOMER' } });
  if (!u) throw notFound('Customer not found.');
  const token = await createToken(u.id, 'PASSWORD_RESET', 60 * 24);
  await logActivity(req.user!.id, 'RESET_LINK', 'User', cid, `Generated a password reset link for ${u.email}`);
  res.json({ url: appUrl(`/reset-password?token=${token}`), expiresInHours: 24 });
});

// ───────── Business & enquiry settings ─────────

adminRouter.get('/settings', async (_req, res) => {
  const [business, enquiries] = await Promise.all([getBusiness(), getEnquirySettings()]);
  res.json({ business, enquiries, emailConfigured: config.smtpConfigured, storage: config.STORAGE_DRIVER });
});

adminRouter.put('/settings/business', async (req, res) => {
  const data = body(req, BusinessSchema);
  await write('business', data, req.user!.id);
  await logActivity(req.user!.id, 'UPDATE', 'Settings', 'business', 'Updated business & contact details');
  invalidatePublic();
  res.json({ business: data });
});

adminRouter.put('/settings/enquiries', async (req, res) => {
  const data = body(req, EnquirySettingsSchema);
  await write('enquiries', data, req.user!.id);
  await logActivity(req.user!.id, 'UPDATE', 'Settings', 'enquiries', `Guest enquiries ${data.allowGuests ? 'enabled' : 'disabled'}`);
  invalidatePublic();
  res.json({ enquiries: data });
});

// ───────── Homepage (draft → preview → publish) ─────────

adminRouter.get('/homepage', async (_req, res) => {
  const home = await getHomepage();
  const ids = [home.draft.hero.imageId, home.draft.about.imageId].filter(Boolean) as string[];
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } } });
  res.json({ ...home, assets: Object.fromEntries(assets.map((a) => [a.id, serializeAsset(a)])) });
});

adminRouter.put('/homepage/draft', async (req, res) => {
  const draft = body(req, HomeContentSchema);
  const imageIds = [draft.hero.imageId, draft.about.imageId].filter(Boolean) as string[];
  await assertAssetsUsable(imageIds, { type: 'homepage' });
  const home = await getHomepage();
  await write('homepage', { ...home, draft, draftUpdatedAt: new Date().toISOString() }, req.user!.id);
  await logActivity(req.user!.id, 'UPDATE_DRAFT', 'Homepage', null, 'Saved homepage draft');
  res.json({ ok: true });
});

adminRouter.get('/homepage/preview', async (_req, res) => {
  const home = await getHomepage();
  res.json(await buildHome(home.draft));
});

adminRouter.post('/homepage/publish', async (req, res) => {
  const home = await getHomepage();
  await write('homepage', { ...home, published: home.draft, publishedAt: new Date().toISOString() }, req.user!.id);
  await logActivity(req.user!.id, 'PUBLISH', 'Homepage', null, 'Published homepage changes');
  invalidatePublic();
  res.json({ ok: true });
});

adminRouter.post('/homepage/discard', async (req, res) => {
  const home = await getHomepage();
  await write('homepage', { ...home, draft: home.published, draftUpdatedAt: null }, req.user!.id);
  res.json({ ok: true });
});

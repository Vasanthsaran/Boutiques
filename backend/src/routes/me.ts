import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, HttpError, notFound } from '../lib/errors.js';
import { body, email, id, optionalText, password, phone, text } from '../lib/validate.js';
import { customerAppointment, publicWorkCard, workCardInclude } from '../lib/serialize.js';
import { findBookableSlot } from '../lib/slots.js';
import { notifyAdminByEmail } from '../lib/mailer.js';
import { requireCustomer } from '../middleware/auth.js';
import { publicUser, sendVerification } from './auth.js';

export const meRouter = Router();
meRouter.use(requireCustomer);
meRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Every query below is scoped by req.user.id taken from the server-side session.

// ───────── Profile ─────────

meRouter.get('/profile', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ user: { ...publicUser(user), createdAt: user.createdAt.toISOString() } });
});

const ProfileSchema = z.object({
  name: text(80, 2),
  phone: z.union([phone, z.literal(''), z.null()]).optional().transform((v) => v || null),
  email,
  currentPassword: z.string().max(200).optional(),
});

meRouter.patch('/profile', async (req, res) => {
  const data = body(req, ProfileSchema);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const emailChanged = data.email !== me.email;
  if (emailChanged) {
    if (!data.currentPassword || !(await verifyPassword(data.currentPassword, me.passwordHash))) {
      throw new HttpError(400, 'Please enter your current password to change your email.', 'PASSWORD_REQUIRED');
    }
    const taken = await prisma.user.findUnique({ where: { email: data.email } });
    if (taken) throw conflict('That email is already used by another account.', 'EMAIL_TAKEN');
  }
  const user = await prisma.user.update({
    where: { id: me.id },
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email,
      ...(emailChanged ? { emailVerifiedAt: null } : {}),
    },
  });
  if (emailChanged) await sendVerification(user.id, user.email);
  res.json({ user: publicUser(user), emailChanged, verificationSent: emailChanged && config.smtpConfigured });
});

meRouter.post('/password', async (req, res) => {
  const data = body(req, z.object({ currentPassword: z.string().min(1).max(200), newPassword: password }));
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(data.currentPassword, me.passwordHash))) {
    throw badRequest('Your current password is incorrect.');
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(data.newPassword) } }),
    // Sign out other devices, keep this one.
    prisma.session.deleteMany({ where: { userId: me.id, id: { not: req.sessionId } } }),
  ]);
  res.json({ ok: true });
});

// ───────── Overview ─────────

meRouter.get('/overview', async (req, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const [upcoming, pastCount, openEnquiries, replies, favorites, unread, notifications] = await Promise.all([
    prisma.appointment.findMany({
      where: { userId, startAt: { gte: now }, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { startAt: 'asc' },
      take: 3,
      include: { changeRequests: true, relatedWork: { select: { slug: true, title: true } } },
    }),
    prisma.appointment.count({ where: { userId, OR: [{ startAt: { lt: now } }, { status: { in: ['REJECTED', 'CANCELLED', 'COMPLETED'] } }] } }),
    prisma.enquiry.count({ where: { userId, status: { not: 'CLOSED' } } }),
    prisma.enquiryMessage.findMany({
      where: { authorType: 'ADMIN', enquiry: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: { enquiry: { select: { id: true, subject: true, reference: true } } },
    }),
    prisma.favorite.findMany({
      where: { userId, work: { status: 'PUBLISHED' } },
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: { work: { include: workCardInclude } },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);
  res.json({
    upcomingAppointments: upcoming.map(customerAppointment),
    pastAppointmentCount: pastCount,
    openEnquiryCount: openEnquiries,
    recentReplies: replies.map((m) => ({
      id: m.id,
      body: m.body.length > 220 ? `${m.body.slice(0, 217)}…` : m.body,
      createdAt: m.createdAt.toISOString(),
      enquiry: m.enquiry,
    })),
    favorites: favorites.map((f) => publicWorkCard(f.work)),
    unreadNotifications: unread,
    notifications: notifications.map(serializeNotification),
  });
});

// ───────── Favorites ─────────

meRouter.get('/favorites', async (req, res) => {
  const favs = await prisma.favorite.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: { work: { include: workCardInclude } },
  });
  res.json({
    favorites: favs.map((f) =>
      f.work.status === 'PUBLISHED'
        ? { workId: f.workId, available: true, savedAt: f.createdAt.toISOString(), work: publicWorkCard(f.work) }
        : // Unpublished: reveal nothing but the fact it is unavailable.
          { workId: f.workId, available: false, savedAt: f.createdAt.toISOString(), work: null },
    ),
  });
});

meRouter.get('/favorites/ids', async (req, res) => {
  const favs = await prisma.favorite.findMany({ where: { userId: req.user!.id }, select: { workId: true } });
  res.json({ ids: favs.map((f) => f.workId) });
});

meRouter.post('/favorites/:workId', async (req, res) => {
  const workId = id.parse(req.params.workId);
  const work = await prisma.recentWork.findFirst({ where: { id: workId, status: 'PUBLISHED' } });
  if (!work) throw notFound('This design is not available.');
  await prisma.favorite.upsert({
    where: { userId_workId: { userId: req.user!.id, workId } },
    create: { userId: req.user!.id, workId },
    update: {},
  });
  res.status(201).json({ ok: true });
});

meRouter.delete('/favorites/:workId', async (req, res) => {
  const workId = id.parse(req.params.workId);
  await prisma.favorite.deleteMany({ where: { userId: req.user!.id, workId } });
  res.json({ ok: true });
});

// ───────── Notifications ─────────

function serializeNotification(n: { id: string; type: string; title: string; body: string | null; link: string | null; readAt: Date | null; createdAt: Date }) {
  return { id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: Boolean(n.readAt), createdAt: n.createdAt.toISOString() };
}

meRouter.get('/notifications', async (req, res) => {
  const rows = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ notifications: rows.map(serializeNotification), unread: rows.filter((r) => !r.readAt).length });
});

meRouter.post('/notifications/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

meRouter.post('/notifications/:id/read', async (req, res) => {
  const nid = id.parse(req.params.id);
  await prisma.notification.updateMany({ where: { id: nid, userId: req.user!.id }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

// ───────── Appointments ─────────

const apptInclude = { changeRequests: true, relatedWork: { select: { slug: true, title: true } } } as const;

meRouter.get('/appointments', async (req, res) => {
  const rows = await prisma.appointment.findMany({
    where: { userId: req.user!.id },
    orderBy: { startAt: 'desc' },
    include: apptInclude,
  });
  res.json({ appointments: rows.map(customerAppointment) });
});

async function ownAppointment(userId: string, apptId: string) {
  const a = await prisma.appointment.findFirst({ where: { id: apptId, userId }, include: apptInclude });
  if (!a) throw notFound('Appointment not found.');
  return a;
}

meRouter.get('/appointments/:id', async (req, res) => {
  const a = await ownAppointment(req.user!.id, id.parse(req.params.id));
  res.json({ appointment: customerAppointment(a) });
});

meRouter.post('/appointments/:id/cancel', async (req, res) => {
  const { reason } = body(req, z.object({ reason: optionalText(500) }));
  const a = await ownAppointment(req.user!.id, id.parse(req.params.id));
  if (!['PENDING', 'CONFIRMED'].includes(a.status)) throw badRequest('This appointment can no longer be cancelled.');
  if (a.startAt < new Date()) throw badRequest('Past appointments cannot be cancelled.');
  const updated = await prisma.$transaction(async (tx) => {
    const res1 = await tx.appointment.updateMany({
      where: { id: a.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      data: { status: 'CANCELLED' },
    });
    if (!res1.count) throw badRequest('This appointment can no longer be cancelled.');
    await tx.appointmentChangeRequest.updateMany({
      where: { appointmentId: a.id, status: 'PENDING' },
      data: { status: 'DECLINED', resolvedAt: new Date() },
    });
    await tx.appointmentLog.create({
      data: {
        appointmentId: a.id,
        actorId: req.user!.id,
        actorRole: 'CUSTOMER',
        action: 'CANCELLED_BY_CUSTOMER',
        fromStatus: a.status,
        toStatus: 'CANCELLED',
        details: reason ? { reason } : undefined,
      },
    });
    return tx.appointment.findUniqueOrThrow({ where: { id: a.id }, include: apptInclude });
  });
  await notifyAdminByEmail(`Appointment ${a.reference} cancelled by customer`, `${a.name} cancelled ${a.serviceTitle}.`);
  res.json({ appointment: customerAppointment(updated) });
});

meRouter.post('/appointments/:id/reschedule-request', async (req, res) => {
  const data = body(
    req,
    z.object({ requestedStartAt: z.string().datetime({ offset: true }), message: optionalText(1000) }),
  );
  const a = await ownAppointment(req.user!.id, id.parse(req.params.id));
  if (!['PENDING', 'CONFIRMED'].includes(a.status)) throw badRequest('This appointment can no longer be rescheduled.');
  if (a.changeRequests.some((c) => c.status === 'PENDING')) {
    throw conflict('You already have a reschedule request waiting for the boutique to review.');
  }
  const slot = await findBookableSlot(data.requestedStartAt, prisma, a.id);
  if (!slot) throw conflict('That time is not available. Please pick another slot.', 'SLOT_UNAVAILABLE');
  await prisma.$transaction([
    prisma.appointmentChangeRequest.create({
      data: { appointmentId: a.id, requestedStartAt: new Date(slot.slot.start), message: data.message },
    }),
    prisma.appointmentLog.create({
      data: {
        appointmentId: a.id,
        actorId: req.user!.id,
        actorRole: 'CUSTOMER',
        action: 'RESCHEDULE_REQUESTED',
        details: { requestedStartAt: slot.slot.start },
      },
    }),
  ]);
  await notifyAdminByEmail(`Reschedule request for ${a.reference}`, `${a.name} asked to move ${a.serviceTitle}.`);
  const updated = await ownAppointment(req.user!.id, a.id);
  res.status(201).json({ appointment: customerAppointment(updated) });
});

// ───────── Enquiries ─────────

meRouter.get('/enquiries', async (req, res) => {
  const rows = await prisma.enquiry.findMany({
    where: { userId: req.user!.id },
    orderBy: { lastActivityAt: 'desc' },
    select: {
      id: true,
      reference: true,
      subject: true,
      status: true,
      serviceLabel: true,
      createdAt: true,
      lastActivityAt: true,
      _count: { select: { messages: { where: { authorType: 'ADMIN' } } } },
    },
  });
  res.json({
    enquiries: rows.map((e) => ({
      id: e.id,
      reference: e.reference,
      subject: e.subject,
      status: e.status,
      serviceLabel: e.serviceLabel,
      createdAt: e.createdAt.toISOString(),
      lastActivityAt: e.lastActivityAt.toISOString(),
      replyCount: e._count.messages,
    })),
  });
});

async function ownEnquiry(userId: string, enquiryId: string) {
  // Explicit select: internal notes are never loaded for the customer API.
  const e = await prisma.enquiry.findFirst({
    where: { id: enquiryId, userId },
    select: {
      id: true,
      reference: true,
      subject: true,
      status: true,
      serviceLabel: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      lastActivityAt: true,
      relatedWork: { select: { slug: true, title: true, status: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, authorType: true, body: true, createdAt: true } },
      attachments: { select: { id: true } },
    },
  });
  if (!e) throw notFound('Enquiry not found.');
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    lastActivityAt: e.lastActivityAt.toISOString(),
    relatedWork: e.relatedWork && e.relatedWork.status === 'PUBLISHED' ? { slug: e.relatedWork.slug, title: e.relatedWork.title } : null,
    messages: e.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
    attachments: e.attachments.map((a) => ({
      id: a.id,
      url: `/api/enquiries/${e.id}/attachments/${a.id}`,
      thumbUrl: `/api/enquiries/${e.id}/attachments/${a.id}?size=thumb`,
    })),
  };
}

meRouter.get('/enquiries/:id', async (req, res) => {
  res.json({ enquiry: await ownEnquiry(req.user!.id, id.parse(req.params.id)) });
});

meRouter.post('/enquiries/:id/messages', async (req, res) => {
  const { message } = body(req, z.object({ message: text(4000, 1) }));
  const enquiryId = id.parse(req.params.id);
  const e = await prisma.enquiry.findFirst({ where: { id: enquiryId, userId: req.user!.id } });
  if (!e) throw notFound('Enquiry not found.');
  if (e.status === 'CLOSED') throw badRequest('This enquiry is closed. Please start a new enquiry.');
  await prisma.$transaction([
    prisma.enquiryMessage.create({
      data: { enquiryId: e.id, authorType: 'CUSTOMER', authorId: req.user!.id, body: message },
    }),
    prisma.enquiry.update({
      where: { id: e.id },
      data: {
        awaitingReply: true,
        lastActivityAt: new Date(),
        status: e.status === 'RESPONDED' ? 'UNDER_REVIEW' : e.status,
        archivedAt: null,
      },
    }),
  ]);
  await notifyAdminByEmail(`Follow-up on enquiry ${e.reference}`, `${e.name} sent a follow-up message.`);
  res.status(201).json({ enquiry: await ownEnquiry(req.user!.id, e.id) });
});

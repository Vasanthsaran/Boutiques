import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import type { AppointmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { body, id, isoDate, optionalText, query } from '../../lib/validate.js';
import { logActivity } from '../../lib/activity.js';
import { notifyUser } from '../../lib/notify.js';
import { sendMail } from '../../lib/mailer.js';
import { BookingSettingsSchema, getBooking, write } from '../../lib/settings.js';
import { findBookableSlot, isValidTimezone, lockBookings } from '../../lib/slots.js';
import { invalidatePublic } from '../../lib/cache.js';
import { isActiveSlotConflict } from '../appointments.js';

export const adminAppointmentsRouter = Router();

const ListQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'all', 'requests']).default('all'),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

function adminAppointment(
  a: Prisma.AppointmentGetPayload<{ include: { changeRequests: true; user: { select: { id: true; name: true; email: true } } } }>,
) {
  return {
    id: a.id,
    reference: a.reference,
    name: a.name,
    email: a.email,
    phone: a.phone,
    serviceId: a.serviceId,
    serviceTitle: a.serviceTitle,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    status: a.status,
    message: a.message,
    designRef: a.designRef,
    adminNotes: a.adminNotes,
    statusNote: a.statusNote,
    customer: a.user,
    isGuest: !a.userId,
    createdAt: a.createdAt.toISOString(),
    pendingRequest: (() => {
      const r = a.changeRequests.find((c) => c.status === 'PENDING');
      return r ? { id: r.id, requestedStartAt: r.requestedStartAt?.toISOString() ?? null, message: r.message, createdAt: r.createdAt.toISOString() } : null;
    })(),
  };
}

const include = { changeRequests: true, user: { select: { id: true, name: true, email: true } } } as const;

adminAppointmentsRouter.get('/', async (req, res) => {
  const q = query(req, ListQuery);
  const where: Prisma.AppointmentWhereInput = {};
  if (q.from || q.to) where.startAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) };
  if (q.status === 'requests') where.changeRequests = { some: { status: 'PENDING' } };
  else if (q.status !== 'all') where.status = q.status;
  if (q.q) {
    where.OR = [
      { reference: { contains: q.q, mode: 'insensitive' } },
      { name: { contains: q.q, mode: 'insensitive' } },
      { email: { contains: q.q, mode: 'insensitive' } },
      { phone: { contains: q.q } },
    ];
  }
  const rows = await prisma.appointment.findMany({ where, orderBy: { startAt: 'asc' }, take: q.limit, include });
  const settings = await getBooking();
  res.json({ timezone: settings.timezone, items: rows.map(adminAppointment) });
});

adminAppointmentsRouter.get('/:id', async (req, res) => {
  const aid = id.parse(req.params.id);
  const a = await prisma.appointment.findUnique({
    where: { id: aid },
    include: { ...include, logs: { orderBy: { createdAt: 'desc' } }, relatedWork: { select: { slug: true, title: true } } },
  });
  if (!a) throw notFound('Appointment not found.');
  const actorIds = [...new Set(a.logs.map((l) => l.actorId).filter(Boolean) as string[])];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const names = new Map(actors.map((u) => [u.id, u.name]));
  res.json({
    appointment: {
      ...adminAppointment(a),
      relatedWork: a.relatedWork,
      logs: a.logs.map((l) => ({
        id: l.id,
        action: l.action,
        actorRole: l.actorRole,
        actorName: l.actorId ? names.get(l.actorId) ?? null : null,
        fromStatus: l.fromStatus,
        toStatus: l.toStatus,
        details: l.details,
        createdAt: l.createdAt.toISOString(),
      })),
    },
  });
});

const ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'PENDING'],
  REJECTED: ['PENDING', 'CONFIRMED'],
  CANCELLED: ['PENDING', 'CONFIRMED'],
  COMPLETED: ['CONFIRMED'],
};

const STATUS_WORDS: Record<AppointmentStatus, string> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'declined',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

async function customerMessage(a: { userId: string | null; email: string | null; name: string; reference: string; serviceTitle: string; startAt: Date }, title: string, line: string, tx?: Prisma.TransactionClient) {
  await notifyUser(a.userId, { type: 'APPOINTMENT', title, body: line, link: '/customer/appointments' }, tx);
  return a;
}

adminAppointmentsRouter.patch('/:id/status', async (req, res) => {
  const aid = id.parse(req.params.id);
  const data = body(
    req,
    z.object({
      status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'COMPLETED', 'CANCELLED']),
      statusNote: optionalText(1000),
    }),
  );
  const settings = await getBooking();
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await lockBookings(tx);
      const a = await tx.appointment.findUnique({ where: { id: aid } });
      if (!a) throw notFound('Appointment not found.');
      if (a.status === data.status) throw badRequest(`The appointment is already ${STATUS_WORDS[a.status]}.`);
      if (!ALLOWED[a.status].includes(data.status)) {
        throw badRequest(`Cannot change a ${STATUS_WORDS[a.status]} appointment to ${STATUS_WORDS[data.status]}.`);
      }
      const reactivating = ['REJECTED', 'CANCELLED'].includes(a.status) && ['PENDING', 'CONFIRMED'].includes(data.status);
      if (reactivating) {
        const clash = await tx.appointment.findFirst({
          where: { id: { not: a.id }, status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { lt: a.endAt }, endAt: { gt: a.startAt } },
        });
        if (clash) throw conflict(`That time is now taken by ${clash.reference}. Reschedule instead.`);
      }
      const u = await tx.appointment.update({
        where: { id: aid },
        data: { status: data.status, statusNote: data.statusNote ?? a.statusNote },
        include,
      });
      if (['REJECTED', 'CANCELLED', 'COMPLETED'].includes(data.status)) {
        await tx.appointmentChangeRequest.updateMany({
          where: { appointmentId: aid, status: 'PENDING' },
          data: { status: 'DECLINED', resolvedAt: new Date() },
        });
      }
      await tx.appointmentLog.create({
        data: {
          appointmentId: aid,
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'STATUS_CHANGED',
          fromStatus: a.status,
          toStatus: data.status,
          details: data.statusNote ? { note: data.statusNote } : undefined,
        },
      });
      const when = DateTime.fromJSDate(a.startAt).setZone(settings.timezone).toFormat('ccc d LLL, h:mm a');
      await customerMessage(a, `Appointment ${STATUS_WORDS[data.status]}`, `${a.serviceTitle} on ${when}${data.statusNote ? ` — ${data.statusNote}` : ''}`, tx);
      await logActivity(req.user!.id, 'APPOINTMENT_STATUS', 'Appointment', aid, `Marked ${a.reference} ${STATUS_WORDS[data.status]}`, undefined, tx);
      return u;
    });
  } catch (err) {
    if (isActiveSlotConflict(err)) throw conflict('That time is already taken by another active appointment.');
    throw err;
  }
  if (updated.email && ['CONFIRMED', 'REJECTED', 'CANCELLED'].includes(updated.status)) {
    const when = DateTime.fromJSDate(updated.startAt).setZone(settings.timezone).toFormat('cccc d LLLL yyyy, h:mm a');
    await sendMail(
      updated.email,
      `Your SVSS Boutique appointment is ${STATUS_WORDS[updated.status]}`,
      `Hello ${updated.name},\n\nYour appointment (${updated.reference}) for ${updated.serviceTitle} on ${when} is now ${STATUS_WORDS[updated.status]}.${updated.statusNote ? `\n\nNote: ${updated.statusNote}` : ''}\n`,
    );
  }
  invalidatePublic();
  res.json({ appointment: adminAppointment(updated) });
});

adminAppointmentsRouter.post('/:id/reschedule', async (req, res) => {
  const aid = id.parse(req.params.id);
  const data = body(
    req,
    z.object({
      startAt: z.string().datetime({ offset: true }),
      // Admin may place an appointment outside normal hours, but never on top of another booking.
      outsideHours: z.boolean().default(false),
      statusNote: optionalText(1000),
      fromRequestId: z.union([id, z.null()]).optional(),
    }),
  );
  const settings = await getBooking();
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await lockBookings(tx);
      const a = await tx.appointment.findUnique({ where: { id: aid } });
      if (!a) throw notFound('Appointment not found.');
      if (!['PENDING', 'CONFIRMED'].includes(a.status)) throw badRequest('Only pending or confirmed appointments can be rescheduled.');
      const start = DateTime.fromISO(data.startAt).toUTC();
      let end = start.plus({ minutes: Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60000) });
      if (!data.outsideHours) {
        const found = await findBookableSlot(start.toISO()!, tx, a.id);
        if (!found) throw conflict('That time is not an open slot. Choose another time or allow outside-hours booking.', 'SLOT_UNAVAILABLE');
        end = DateTime.fromISO(found.slot.end);
      } else {
        if (start < DateTime.utc()) throw badRequest('Choose a time in the future.');
        const clash = await tx.appointment.findFirst({
          where: { id: { not: a.id }, status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { lt: end.toJSDate() }, endAt: { gt: start.toJSDate() } },
        });
        if (clash) throw conflict(`That time overlaps ${clash.reference}.`, 'SLOT_UNAVAILABLE');
      }
      const u = await tx.appointment.update({
        where: { id: aid },
        data: { startAt: start.toJSDate(), endAt: end.toJSDate(), statusNote: data.statusNote ?? a.statusNote },
        include,
      });
      await tx.appointmentChangeRequest.updateMany({
        where: { appointmentId: aid, status: 'PENDING' },
        data: { status: data.fromRequestId ? 'APPROVED' : 'DECLINED', resolvedAt: new Date() },
      });
      await tx.appointmentLog.create({
        data: {
          appointmentId: aid,
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'RESCHEDULED',
          details: { from: a.startAt.toISOString(), to: start.toISO()!, outsideHours: data.outsideHours },
        },
      });
      const when = start.setZone(settings.timezone).toFormat('ccc d LLL, h:mm a');
      await customerMessage(a, 'Appointment rescheduled', `${a.serviceTitle} is now on ${when}`, tx);
      await logActivity(req.user!.id, 'APPOINTMENT_RESCHEDULE', 'Appointment', aid, `Rescheduled ${a.reference} to ${when}`, undefined, tx);
      return u;
    });
  } catch (err) {
    if (isActiveSlotConflict(err)) throw conflict('That time is already taken by another appointment.', 'SLOT_UNAVAILABLE');
    throw err;
  }
  if (updated.email) {
    const when = DateTime.fromJSDate(updated.startAt).setZone(settings.timezone).toFormat('cccc d LLLL yyyy, h:mm a');
    await sendMail(updated.email, 'Your SVSS Boutique appointment has moved', `Hello ${updated.name},\n\nYour appointment (${updated.reference}) for ${updated.serviceTitle} is now on ${when}.\n`);
  }
  res.json({ appointment: adminAppointment(updated) });
});

adminAppointmentsRouter.post('/:id/requests/:requestId/decline', async (req, res) => {
  const aid = id.parse(req.params.id);
  const rid = id.parse(req.params.requestId);
  const { statusNote } = body(req, z.object({ statusNote: optionalText(1000) }));
  const r = await prisma.appointmentChangeRequest.findFirst({ where: { id: rid, appointmentId: aid, status: 'PENDING' }, include: { appointment: true } });
  if (!r) throw notFound('Request not found.');
  await prisma.$transaction(async (tx) => {
    await tx.appointmentChangeRequest.update({ where: { id: rid }, data: { status: 'DECLINED', resolvedAt: new Date() } });
    if (statusNote) await tx.appointment.update({ where: { id: aid }, data: { statusNote } });
    await tx.appointmentLog.create({ data: { appointmentId: aid, actorId: req.user!.id, actorRole: 'ADMIN', action: 'RESCHEDULE_DECLINED' } });
    await customerMessage(r.appointment, 'Reschedule request declined', statusNote ?? 'Your appointment time stays the same.', tx);
    await logActivity(req.user!.id, 'APPOINTMENT_REQUEST', 'Appointment', aid, `Declined reschedule for ${r.appointment.reference}`, undefined, tx);
  });
  const a = await prisma.appointment.findUniqueOrThrow({ where: { id: aid }, include });
  res.json({ appointment: adminAppointment(a) });
});

adminAppointmentsRouter.patch('/:id/notes', async (req, res) => {
  const aid = id.parse(req.params.id);
  const { adminNotes } = body(req, z.object({ adminNotes: optionalText(4000) }));
  const a = await prisma.appointment.update({ where: { id: aid }, data: { adminNotes }, include }).catch(() => null);
  if (!a) throw notFound('Appointment not found.');
  await prisma.appointmentLog.create({ data: { appointmentId: aid, actorId: req.user!.id, actorRole: 'ADMIN', action: 'NOTES_UPDATED' } });
  res.json({ appointment: adminAppointment(a) });
});

// ════════════════════ Availability configuration ════════════════════

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:mm (24-hour)');

adminAppointmentsRouter.get('/config/availability', async (_req, res) => {
  const [rules, blocked, settings] = await Promise.all([
    prisma.appointmentAvailability.findMany({ orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }),
    prisma.blockedDate.findMany({ where: { date: { gte: new Date(Date.now() - 86400000 * 30) } }, orderBy: { date: 'asc' } }),
    getBooking(),
  ]);
  res.json({
    settings,
    rules: rules.map((r) => ({ id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })),
    blockedDates: blocked.map((b) => ({ id: b.id, date: b.date.toISOString().slice(0, 10), reason: b.reason })),
  });
});

adminAppointmentsRouter.put('/config/rules', async (req, res) => {
  const { rules } = body(
    req,
    z.object({
      rules: z
        .array(z.object({ dayOfWeek: z.number().int().min(1).max(7), startTime: hm, endTime: hm }))
        .max(50)
        .refine((rs) => rs.every((r) => r.endTime > r.startTime), 'each closing time must be after the opening time'),
    }),
  );
  await prisma.$transaction([
    prisma.appointmentAvailability.deleteMany({}),
    prisma.appointmentAvailability.createMany({ data: rules }),
  ]);
  await logActivity(req.user!.id, 'UPDATE', 'Availability', null, 'Updated working hours', { rules });
  invalidatePublic();
  res.json({ ok: true });
});

adminAppointmentsRouter.put('/config/settings', async (req, res) => {
  const data = body(req, BookingSettingsSchema);
  if (!isValidTimezone(data.timezone)) throw badRequest('Unknown timezone. Use an IANA name such as Asia/Kolkata.');
  await write('booking', data, req.user!.id);
  await logActivity(req.user!.id, 'UPDATE', 'Settings', 'booking', 'Updated booking settings', data);
  invalidatePublic();
  res.json({ settings: data });
});

adminAppointmentsRouter.post('/config/blocked', async (req, res) => {
  const data = body(req, z.object({ date: isoDate, reason: optionalText(200) }));
  const b = await prisma.blockedDate
    .upsert({ where: { date: new Date(data.date) }, create: { date: new Date(data.date), reason: data.reason }, update: { reason: data.reason } });
  await logActivity(req.user!.id, 'BLOCK_DATE', 'Availability', b.id, `Blocked ${data.date}${data.reason ? ` (${data.reason})` : ''}`);
  invalidatePublic();
  res.status(201).json({ blocked: { id: b.id, date: data.date, reason: b.reason } });
});

adminAppointmentsRouter.delete('/config/blocked/:id', async (req, res) => {
  const bid = id.parse(req.params.id);
  const b = await prisma.blockedDate.delete({ where: { id: bid } }).catch(() => null);
  if (!b) throw notFound();
  await logActivity(req.user!.id, 'UNBLOCK_DATE', 'Availability', bid, `Unblocked ${b.date.toISOString().slice(0, 10)}`);
  invalidatePublic();
  res.json({ ok: true });
});

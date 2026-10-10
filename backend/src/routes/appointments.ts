import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma } from '../db.js';
import { makeReference } from '../lib/crypto.js';
import { badRequest, conflict } from '../lib/errors.js';
import { body, email, id, isoDate, optionalText, phone, query, text } from '../lib/validate.js';
import { findBookableSlot, getBookableDates, getSlotsForDate, lockBookings } from '../lib/slots.js';
import { getBooking } from '../lib/settings.js';
import { notifyAdminByEmail } from '../lib/mailer.js';
import { publicFormLimiter } from '../middleware/security.js';
import { assertCanSubmit } from './enquiries.js';

export const appointmentsRouter = Router();

appointmentsRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

appointmentsRouter.get('/dates', async (req, res) => {
  const { month } = query(req, z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }));
  const { settings, dates } = await getBookableDates(month);
  res.json({ timezone: settings.timezone, dates });
});

appointmentsRouter.get('/slots', async (req, res) => {
  const { date } = query(req, z.object({ date: isoDate }));
  const { settings, slots } = await getSlotsForDate(date);
  res.json({ timezone: settings.timezone, date, slots });
});

const BookingSchema = z
  .object({
    name: text(80, 2),
    email: z.union([email, z.literal('')]).optional().transform((v) => v || null),
    phone: z.union([phone, z.literal('')]).optional().transform((v) => v || null),
    serviceId: id,
    startAt: z.string().datetime({ offset: true }),
    message: optionalText(2000),
    designRef: optionalText(500),
    relatedWorkId: z.union([id, z.literal(''), z.null()]).optional().transform((v) => v || null),
    website: z.string().max(200).optional(), // honeypot
  })
  ;

export function isActiveSlotConflict(err: unknown) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = String((err.meta as { target?: unknown } | undefined)?.target ?? '') + err.message;
  return target.includes('startAt') || target.includes('active_slot');
}

appointmentsRouter.post('/', publicFormLimiter, async (req, res) => {
  const settings = await getBooking();
  assertCanSubmit(req, settings.allowGuests, 'an appointment request');
  if (!settings.enabled) throw badRequest('Online booking is currently closed. Please contact us directly.');
  const data = body(req, BookingSchema);
  if (data.website) throw badRequest('Your booking could not be submitted.');
  if (!req.user && !data.email && !data.phone) throw badRequest('Please give an email address or phone number.');

  const service = await prisma.service.findFirst({ where: { id: data.serviceId, status: 'PUBLISHED' } });
  if (!service) throw badRequest('Please choose a valid service.');
  if (!service.isAvailable) throw badRequest(`${service.title} is not currently taking appointments.`);
  if (data.relatedWorkId) {
    const w = await prisma.recentWork.findFirst({ where: { id: data.relatedWorkId, status: 'PUBLISHED' } });
    if (!w) throw badRequest('The related design is no longer available.');
  }

  const user = req.user;
  let appointment;
  try {
    appointment = await prisma.$transaction(async (tx) => {
      await lockBookings(tx);
      const found = await findBookableSlot(data.startAt, tx);
      if (!found) {
        throw conflict(
          'Sorry — that time is no longer available. Please choose another slot.',
          'SLOT_UNAVAILABLE',
        );
      }
      const appt = await tx.appointment.create({
        data: {
          reference: makeReference('APT'),
          userId: user?.id ?? null,
          name: data.name,
          email: user ? user.email : data.email,
          phone: data.phone ?? user?.phone ?? null,
          serviceId: service.id,
          serviceTitle: service.title,
          relatedWorkId: data.relatedWorkId,
          startAt: new Date(found.slot.start),
          endAt: new Date(found.slot.end),
          message: data.message,
          designRef: data.designRef,
        },
      });
      await tx.appointmentLog.create({
        data: {
          appointmentId: appt.id,
          actorId: user?.id ?? null,
          actorRole: user ? 'CUSTOMER' : 'GUEST',
          action: 'BOOKED',
          toStatus: 'PENDING',
        },
      });
      return appt;
    });
  } catch (err) {
    if (isActiveSlotConflict(err)) {
      throw conflict('Sorry — that time was just booked by someone else. Please choose another slot.', 'SLOT_UNAVAILABLE');
    }
    throw err;
  }

  const local = DateTime.fromJSDate(appointment.startAt).setZone(settings.timezone);
  await notifyAdminByEmail(
    `New appointment request ${appointment.reference}`,
    `${appointment.name} requested ${appointment.serviceTitle} on ${local.toFormat('cccc d LLLL yyyy, h:mm a')} (${settings.timezone}).`,
  );
  res.status(201).json({
    appointment: {
      id: appointment.id,
      reference: appointment.reference,
      serviceTitle: appointment.serviceTitle,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      status: appointment.status,
      timezone: settings.timezone,
      linkedToAccount: Boolean(user),
    },
  });
});

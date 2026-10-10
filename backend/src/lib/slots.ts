import { DateTime } from 'luxon';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { getBooking, type BookingSettings } from './settings.js';

type Tx = Prisma.TransactionClient | typeof prisma;

export interface Slot {
  start: string; // ISO UTC
  end: string;
  label: string; // local "h:mm a"
}

const ACTIVE = ['PENDING', 'CONFIRMED'] as const;

const parseHm = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return { hour: h, minute: m };
};

export function isValidTimezone(tz: string) {
  return DateTime.local().setZone(tz).isValid;
}

interface DayContext {
  settings: BookingSettings;
  rules: { dayOfWeek: number; startTime: string; endTime: string }[];
  blocked: Set<string>; // yyyy-MM-dd
  busy: { startAt: Date; endAt: Date; id: string }[];
  now: DateTime;
}

function slotsForDay(dateIso: string, ctx: DayContext, excludeAppointmentId?: string): Slot[] {
  const { settings, rules, blocked, busy, now } = ctx;
  const tz = settings.timezone;
  const day = DateTime.fromISO(dateIso, { zone: tz }).startOf('day');
  if (!day.isValid) return [];
  if (blocked.has(day.toISODate()!)) return [];

  const today = now.setZone(tz).startOf('day');
  if (day < today || day > today.plus({ days: settings.maxAdvanceDays })) return [];

  const earliest = now.plus({ hours: settings.minLeadHours });
  const out: Slot[] = [];
  const windows = rules.filter((r) => r.dayOfWeek === day.weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));

  for (const w of windows) {
    const winStart = day.set(parseHm(w.startTime));
    const winEnd = day.set(parseHm(w.endTime));
    for (let s = winStart; s.plus({ minutes: settings.slotMinutes }) <= winEnd; s = s.plus({ minutes: settings.slotMinutes })) {
      const e = s.plus({ minutes: settings.slotMinutes });
      if (s < earliest) continue;
      const sMs = s.toMillis();
      const eMs = e.toMillis();
      const clash = busy.some(
        (b) => b.id !== excludeAppointmentId && b.startAt.getTime() < eMs && b.endAt.getTime() > sMs,
      );
      if (clash) continue;
      if (out.some((o) => o.start === s.toUTC().toISO())) continue; // overlapping windows
      out.push({ start: s.toUTC().toISO()!, end: e.toUTC().toISO()!, label: s.toFormat('h:mm a') });
    }
  }
  return out;
}

async function loadContext(fromUtc: Date, toUtc: Date, tx: Tx = prisma, settings?: BookingSettings): Promise<DayContext> {
  const [s, rules, blockedRows, busy] = await Promise.all([
    settings ? Promise.resolve(settings) : getBooking(),
    tx.appointmentAvailability.findMany({ select: { dayOfWeek: true, startTime: true, endTime: true } }),
    tx.blockedDate.findMany({
      where: { date: { gte: new Date(fromUtc.getTime() - 86400000), lte: new Date(toUtc.getTime() + 86400000) } },
      select: { date: true },
    }),
    tx.appointment.findMany({
      where: { status: { in: [...ACTIVE] }, startAt: { lt: toUtc }, endAt: { gt: fromUtc } },
      select: { id: true, startAt: true, endAt: true },
    }),
  ]);
  return {
    settings: s,
    rules,
    blocked: new Set(blockedRows.map((b) => b.date.toISOString().slice(0, 10))),
    busy,
    now: DateTime.utc(),
  };
}

export async function getSlotsForDate(dateIso: string, opts: { excludeAppointmentId?: string; tx?: Tx } = {}) {
  const settings = await getBooking();
  if (!settings.enabled) return { settings, slots: [] as Slot[] };
  const day = DateTime.fromISO(dateIso, { zone: settings.timezone }).startOf('day');
  if (!day.isValid) return { settings, slots: [] as Slot[] };
  const ctx = await loadContext(day.toUTC().toJSDate(), day.endOf('day').toUTC().toJSDate(), opts.tx, settings);
  return { settings, slots: slotsForDay(dateIso, ctx, opts.excludeAppointmentId) };
}

/** Dates in the given month (yyyy-MM) that have at least one open slot. */
export async function getBookableDates(month: string) {
  const settings = await getBooking();
  if (!settings.enabled) return { settings, dates: [] as string[] };
  const start = DateTime.fromFormat(month, 'yyyy-MM', { zone: settings.timezone }).startOf('month');
  if (!start.isValid) return { settings, dates: [] as string[] };
  const end = start.endOf('month');
  const ctx = await loadContext(start.toUTC().toJSDate(), end.toUTC().toJSDate(), prisma, settings);
  const dates: string[] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    const iso = d.toISODate()!;
    if (slotsForDay(iso, ctx).length) dates.push(iso);
  }
  return { settings, dates };
}

/**
 * Checks that `startIso` is exactly one of the currently bookable slots.
 * Call inside the booking transaction (after taking the advisory lock).
 */
export async function findBookableSlot(startIso: string, tx: Tx, excludeAppointmentId?: string) {
  const settings = await getBooking();
  if (!settings.enabled) return null;
  const start = DateTime.fromISO(startIso, { zone: 'utc' });
  if (!start.isValid) return null;
  const localDate = start.setZone(settings.timezone).toISODate()!;
  const day = DateTime.fromISO(localDate, { zone: settings.timezone });
  const ctx = await loadContext(day.toUTC().toJSDate(), day.endOf('day').toUTC().toJSDate(), tx, settings);
  const slot = slotsForDay(localDate, ctx, excludeAppointmentId).find(
    (s) => DateTime.fromISO(s.start).toMillis() === start.toMillis(),
  );
  return slot ? { slot, settings } : null;
}

/** Serialises all booking writes so the availability re-check and insert are atomic. */
export async function lockBookings(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(718201)`;
}

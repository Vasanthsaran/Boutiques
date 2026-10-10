import { beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { prisma } from '../src/db.js';
import { client, createAdmin, createCustomer, makeService, resetDb, type Client } from './helpers.js';

const TZ = 'Asia/Kolkata';
let admin: Client;
let serviceId: string;
let day: string; // a bookable date, 3 days from now (local)

const slotAt = (date: string, hm: string) => DateTime.fromISO(`${date}T${hm}`, { zone: TZ }).toUTC().toISO()!;

beforeAll(async () => {
  await resetDb();
  admin = await createAdmin();
  serviceId = (await makeService()).id;
  await admin
    .put('/api/admin/appointments/config/settings', {
      enabled: true,
      timezone: TZ,
      slotMinutes: 60,
      minLeadHours: 2,
      maxAdvanceDays: 30,
      allowGuests: false,
    })
    .expect(200);
  await admin
    .put('/api/admin/appointments/config/rules', {
      rules: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dayOfWeek: d, startTime: '10:00', endTime: '13:00' })),
    })
    .expect(200);
  day = DateTime.now().setZone(TZ).plus({ days: 3 }).toISODate()!;
});

describe('availability', () => {
  it('lists only configured slots', async () => {
    const anon = await client();
    const res = await anon.get(`/api/appointments/slots?date=${day}`);
    expect(res.status).toBe(200);
    expect(res.body.slots.map((s: { label: string }) => s.label)).toEqual(['10:00 AM', '11:00 AM', '12:00 PM']);
    const month = await anon.get(`/api/appointments/dates?month=${day.slice(0, 7)}`);
    expect(month.body.dates).toContain(day);
  });

  it('returns no slots for blocked dates, past dates, or beyond the booking window', async () => {
    const anon = await client();
    const blocked = DateTime.fromISO(day).plus({ days: 1 }).toISODate()!;
    await admin.post('/api/admin/appointments/config/blocked', { date: blocked, reason: 'Festival holiday' }).expect(201);
    expect((await anon.get(`/api/appointments/slots?date=${blocked}`)).body.slots).toEqual([]);
    const past = DateTime.now().setZone(TZ).minus({ days: 2 }).toISODate();
    expect((await anon.get(`/api/appointments/slots?date=${past}`)).body.slots).toEqual([]);
    const far = DateTime.now().setZone(TZ).plus({ days: 45 }).toISODate();
    expect((await anon.get(`/api/appointments/slots?date=${far}`)).body.slots).toEqual([]);
  });
});

describe('booking', () => {
  it('requires sign-in when guest booking is off', async () => {
    const anon = await client();
    const res = await anon.post('/api/appointments', { name: 'G', email: 'g@example.com', serviceId, startAt: slotAt(day, '10:00') });
    expect(res.status).toBe(401);
  });

  it('books a valid slot and prevents double booking', async () => {
    const a = await createCustomer('Asha');
    const b = await createCustomer('Bindu');
    const res = await a.post('/api/appointments', { name: 'Asha', serviceId, startAt: slotAt(day, '10:00'), message: 'Bridal fitting' });
    expect(res.status).toBe(201);
    expect(res.body.appointment).toMatchObject({ status: 'PENDING', timezone: TZ });

    const taken = await b.post('/api/appointments', { name: 'Bindu', serviceId, startAt: slotAt(day, '10:00') });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('SLOT_UNAVAILABLE');

    const slots = await b.get(`/api/appointments/slots?date=${day}`);
    expect(slots.body.slots.map((s: { label: string }) => s.label)).not.toContain('10:00 AM');
  });

  it('rejects times outside working hours and unavailable services', async () => {
    const c = await createCustomer();
    expect((await c.post('/api/appointments', { name: 'Cee', serviceId, startAt: slotAt(day, '15:00') })).status).toBe(409);
    expect((await c.post('/api/appointments', { name: 'Cee', serviceId, startAt: slotAt(day, '10:30') })).status).toBe(409);
    const closed = await makeService({ isAvailable: false });
    expect((await c.post('/api/appointments', { name: 'Cee', serviceId: closed.id, startAt: slotAt(day, '11:00') })).status).toBe(400);
    const draft = await makeService({ status: 'DRAFT' });
    expect((await c.post('/api/appointments', { name: 'Cee', serviceId: draft.id, startAt: slotAt(day, '11:00') })).status).toBe(400);
  });

  it('allows exactly one winner when the same slot is booked concurrently', async () => {
    const customers = await Promise.all([1, 2, 3, 4, 5].map((i) => createCustomer(`Racer ${i}`)));
    const startAt = slotAt(day, '11:00');
    const results = await Promise.all(customers.map((c) => c.post('/api/appointments', { name: 'Racer', serviceId, startAt })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await prisma.appointment.count({ where: { startAt: new Date(startAt), status: { in: ['PENDING', 'CONFIRMED'] } } })).toBe(1);
  });

  it('database constraint blocks double booking even if app checks are bypassed', async () => {
    const start = new Date(slotAt(day, '10:00')); // already booked by Asha
    await expect(
      prisma.appointment.create({
        data: { reference: 'APT-RAW', name: 'Raw', email: 'raw@example.com', serviceTitle: 'x', startAt: start, endAt: new Date(start.getTime() + 3600000) },
      }),
    ).rejects.toThrow();
  });
});

describe('status changes and ownership', () => {
  it('admin confirms; customer sees status + notification; others cannot touch it', async () => {
    const owner = await createCustomer('Owner');
    const other = await createCustomer('Other');
    const date = DateTime.fromISO(day).plus({ days: 2 }).toISODate()!;
    const booked = await owner.post('/api/appointments', { name: 'Owner', serviceId, startAt: slotAt(date, '12:00') });
    expect(booked.status).toBe(201);
    const apptId = booked.body.appointment.id;

    // Cross-customer access is impossible.
    expect((await other.get(`/api/me/appointments/${apptId}`)).status).toBe(404);
    expect((await other.post(`/api/me/appointments/${apptId}/cancel`)).status).toBe(404);
    expect((await other.post(`/api/me/appointments/${apptId}/reschedule-request`, { requestedStartAt: slotAt(date, '10:00') })).status).toBe(404);
    expect((await other.get('/api/me/appointments')).body.appointments).toHaveLength(0);

    const confirm = await admin.patch(`/api/admin/appointments/${apptId}/status`, { status: 'CONFIRMED', statusNote: 'See you then!' });
    expect(confirm.status).toBe(200);
    await admin.patch(`/api/admin/appointments/${apptId}/notes`, { adminNotes: 'PRIVATE: prefers silk' }).expect(200);

    const mine = await owner.get(`/api/me/appointments/${apptId}`);
    expect(mine.body.appointment.status).toBe('CONFIRMED');
    expect(mine.body.appointment.statusNote).toBe('See you then!');
    expect(JSON.stringify(mine.body)).not.toContain('PRIVATE: prefers silk');
    const notifications = await owner.get('/api/me/notifications');
    expect(notifications.body.notifications[0].title).toBe('Appointment confirmed');

    // Customer asks to reschedule; admin approves; the change is logged.
    const req = await owner.post(`/api/me/appointments/${apptId}/reschedule-request`, { requestedStartAt: slotAt(date, '10:00'), message: 'Earlier please' });
    expect(req.status).toBe(201);
    expect(req.body.appointment.pendingRequest.requestedStartAt).toBe(new Date(slotAt(date, '10:00')).toISOString());
    const dup = await owner.post(`/api/me/appointments/${apptId}/reschedule-request`, { requestedStartAt: slotAt(date, '11:00') });
    expect(dup.status).toBe(409);
    const approve = await admin.post(`/api/admin/appointments/${apptId}/reschedule`, {
      startAt: slotAt(date, '10:00'),
      fromRequestId: req.body.appointment.pendingRequest.id,
    });
    expect(approve.status).toBe(200);
    const moved = await owner.get(`/api/me/appointments/${apptId}`);
    expect(moved.body.appointment.startAt).toBe(new Date(slotAt(date, '10:00')).toISOString());
    expect(moved.body.appointment.pendingRequest).toBeNull();

    const detail = await admin.get(`/api/admin/appointments/${apptId}`);
    expect(detail.body.appointment.logs.map((l: { action: string }) => l.action)).toEqual(
      expect.arrayContaining(['BOOKED', 'STATUS_CHANGED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED']),
    );

    // Customer cancels; slot frees up.
    const cancel = await owner.post(`/api/me/appointments/${apptId}/cancel`, { reason: 'Travelling' });
    expect(cancel.body.appointment.status).toBe('CANCELLED');
    const slots = await owner.get(`/api/appointments/slots?date=${date}`);
    expect(slots.body.slots.map((s: { label: string }) => s.label)).toContain('10:00 AM');
    // Cancelled cannot be cancelled again.
    expect((await owner.post(`/api/me/appointments/${apptId}/cancel`)).status).toBe(400);
  });

  it('admin cannot reactivate a cancelled booking onto a taken slot', async () => {
    const a = await createCustomer();
    const b = await createCustomer();
    const date = DateTime.fromISO(day).plus({ days: 4 }).toISODate()!;
    const first = await a.post('/api/appointments', { name: 'Ann', serviceId, startAt: slotAt(date, '10:00') });
    await a.post(`/api/me/appointments/${first.body.appointment.id}/cancel`).expect(200);
    await b.post('/api/appointments', { name: 'Bea', serviceId, startAt: slotAt(date, '10:00') }).expect(201);
    const reactivate = await admin.patch(`/api/admin/appointments/${first.body.appointment.id}/status`, { status: 'CONFIRMED' });
    expect(reactivate.status).toBe(409);
  });

  it('rejects invalid status transitions', async () => {
    const c = await createCustomer();
    const date = DateTime.fromISO(day).plus({ days: 5 }).toISODate()!;
    const booked = await c.post('/api/appointments', { name: 'Cee', serviceId, startAt: slotAt(date, '11:00') });
    const res = await admin.patch(`/api/admin/appointments/${booked.body.appointment.id}/status`, { status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });
});

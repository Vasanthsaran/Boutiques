import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { body, id, query, text } from '../../lib/validate.js';
import { logActivity } from '../../lib/activity.js';
import { notifyUser } from '../../lib/notify.js';
import { appUrl, sendMail } from '../../lib/mailer.js';

export const adminEnquiriesRouter = Router();

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['NEW', 'UNDER_REVIEW', 'RESPONDED', 'CLOSED', 'all', 'awaiting']).default('all'),
  archived: z.enum(['true', 'false']).default('false'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

adminEnquiriesRouter.get('/', async (req, res) => {
  const q = query(req, ListQuery);
  const where: Prisma.EnquiryWhereInput = { archivedAt: q.archived === 'true' ? { not: null } : null };
  if (q.status === 'awaiting') where.awaitingReply = true;
  else if (q.status !== 'all') where.status = q.status;
  if (q.q) {
    where.OR = [
      { reference: { contains: q.q, mode: 'insensitive' } },
      { name: { contains: q.q, mode: 'insensitive' } },
      { email: { contains: q.q, mode: 'insensitive' } },
      { phone: { contains: q.q } },
      { subject: { contains: q.q, mode: 'insensitive' } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.enquiry.count({ where }),
    prisma.enquiry.findMany({
      where,
      orderBy: { lastActivityAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { _count: { select: { messages: true, attachments: true } } },
    }),
  ]);
  res.json({
    total,
    page: q.page,
    limit: q.limit,
    items: rows.map((e) => ({
      id: e.id,
      reference: e.reference,
      name: e.name,
      email: e.email,
      phone: e.phone,
      subject: e.subject,
      serviceLabel: e.serviceLabel,
      status: e.status,
      awaitingReply: e.awaitingReply,
      isGuest: !e.userId,
      archived: Boolean(e.archivedAt),
      messageCount: e._count.messages,
      attachmentCount: e._count.attachments,
      createdAt: e.createdAt.toISOString(),
      lastActivityAt: e.lastActivityAt.toISOString(),
    })),
  });
});

async function loadEnquiry(enquiryId: string) {
  const e = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      relatedWork: { select: { id: true, slug: true, title: true, status: true } },
      messages: { orderBy: { createdAt: 'asc' } },
      notes: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } },
      attachments: { include: { asset: { select: { width: true, height: true } } } },
    },
  });
  if (!e) throw notFound('Enquiry not found.');
  return {
    id: e.id,
    reference: e.reference,
    name: e.name,
    email: e.email,
    phone: e.phone,
    subject: e.subject,
    serviceLabel: e.serviceLabel,
    status: e.status,
    awaitingReply: e.awaitingReply,
    archived: Boolean(e.archivedAt),
    createdAt: e.createdAt.toISOString(),
    lastActivityAt: e.lastActivityAt.toISOString(),
    customer: e.user,
    relatedWork: e.relatedWork,
    messages: e.messages.map((m) => ({ id: m.id, authorType: m.authorType, body: m.body, createdAt: m.createdAt.toISOString() })),
    notes: e.notes.map((n) => ({ id: n.id, body: n.body, author: n.author?.name ?? 'Admin', createdAt: n.createdAt.toISOString() })),
    attachments: e.attachments.map((a) => ({
      id: a.id,
      url: `/api/enquiries/${e.id}/attachments/${a.id}`,
      thumbUrl: `/api/enquiries/${e.id}/attachments/${a.id}?size=thumb`,
      width: a.asset.width,
      height: a.asset.height,
    })),
  };
}

adminEnquiriesRouter.get('/:id', async (req, res) => {
  const eid = id.parse(req.params.id);
  const e = await loadEnquiry(eid);
  // Opening a NEW enquiry moves it to "under review".
  if (e.status === 'NEW') {
    await prisma.enquiry.update({ where: { id: eid }, data: { status: 'UNDER_REVIEW' } });
    e.status = 'UNDER_REVIEW';
  }
  res.json({ enquiry: e });
});

adminEnquiriesRouter.post('/:id/reply', async (req, res) => {
  const eid = id.parse(req.params.id);
  const { message, close } = body(req, z.object({ message: text(4000, 1), close: z.boolean().default(false) }));
  const e = await prisma.enquiry.findUnique({ where: { id: eid } });
  if (!e) throw notFound('Enquiry not found.');
  await prisma.$transaction(async (tx) => {
    await tx.enquiryMessage.create({ data: { enquiryId: eid, authorType: 'ADMIN', authorId: req.user!.id, body: message } });
    await tx.enquiry.update({
      where: { id: eid },
      data: { status: close ? 'CLOSED' : 'RESPONDED', awaitingReply: false, lastActivityAt: new Date(), archivedAt: null },
    });
    await notifyUser(
      e.userId,
      { type: 'ENQUIRY_REPLY', title: `New reply on “${e.subject}”`, body: message.slice(0, 200), link: `/customer/enquiries?id=${eid}` },
      tx,
    );
    await logActivity(req.user!.id, 'REPLY', 'Enquiry', eid, `Replied to enquiry ${e.reference}`, undefined, tx);
  });
  let emailed = false;
  if (e.email) {
    emailed = await sendMail(
      e.email,
      `Reply from SVSS Boutique: ${e.subject}`,
      `Hello ${e.name},\n\n${message}\n\n${e.userId ? `You can view the conversation in your account: ${appUrl('/customer/enquiries')}` : `Reference: ${e.reference}`}\n`,
    );
  }
  res.json({ enquiry: await loadEnquiry(eid), emailed });
});

adminEnquiriesRouter.post('/:id/notes', async (req, res) => {
  const eid = id.parse(req.params.id);
  const { note } = body(req, z.object({ note: text(4000, 1) }));
  const e = await prisma.enquiry.findUnique({ where: { id: eid } });
  if (!e) throw notFound('Enquiry not found.');
  await prisma.enquiryNote.create({ data: { enquiryId: eid, authorId: req.user!.id, body: note } });
  res.status(201).json({ enquiry: await loadEnquiry(eid) });
});

adminEnquiriesRouter.patch('/:id', async (req, res) => {
  const eid = id.parse(req.params.id);
  const data = body(
    req,
    z.object({
      status: z.enum(['NEW', 'UNDER_REVIEW', 'RESPONDED', 'CLOSED']).optional(),
      archived: z.boolean().optional(),
    }),
  );
  if (data.status === undefined && data.archived === undefined) throw badRequest('Nothing to update.');
  const e = await prisma.enquiry.findUnique({ where: { id: eid } });
  if (!e) throw notFound('Enquiry not found.');
  await prisma.$transaction(async (tx) => {
    await tx.enquiry.update({
      where: { id: eid },
      data: {
        ...(data.status ? { status: data.status, ...(data.status === 'CLOSED' ? { awaitingReply: false } : {}) } : {}),
        ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
      },
    });
    if (data.status && data.status !== e.status) {
      await notifyUser(
        e.userId,
        { type: 'ENQUIRY_STATUS', title: `Enquiry “${e.subject}” is now ${data.status.replace('_', ' ').toLowerCase()}`, link: `/customer/enquiries?id=${eid}` },
        tx,
      );
    }
    await logActivity(
      req.user!.id,
      data.archived !== undefined ? (data.archived ? 'ARCHIVE' : 'UNARCHIVE') : 'STATUS',
      'Enquiry',
      eid,
      `${data.archived !== undefined ? (data.archived ? 'Archived' : 'Restored') : `Set status ${data.status} on`} enquiry ${e.reference}`,
      undefined,
      tx,
    );
  });
  res.json({ enquiry: await loadEnquiry(eid) });
});

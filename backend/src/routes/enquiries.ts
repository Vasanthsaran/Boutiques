import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { makeReference } from '../lib/crypto.js';
import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import { email, id, optionalText, parse, phone, text } from '../lib/validate.js';
import { getEnquirySettings } from '../lib/settings.js';
import { deleteAssets, storeUpload } from '../lib/media.js';
import { storage } from '../lib/storage.js';
import { notifyAdminByEmail } from '../lib/mailer.js';
import { publicFormLimiter } from '../middleware/security.js';

export const enquiriesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxEnquiryImageBytes,
    files: config.uploads.maxEnquiryImages,
    fields: 20,
    fieldSize: 10_000,
  },
});

const optionalId = z
  .union([id, z.literal(''), z.null()])
  .optional()
  .transform((v) => v || null);

const EnquirySchema = z
  .object({
    name: text(80, 2),
    email: z.union([email, z.literal('')]).optional().transform((v) => v || null),
    phone: z.union([phone, z.literal('')]).optional().transform((v) => v || null),
    serviceId: optionalId,
    serviceLabel: optionalText(80),
    relatedWorkId: optionalId,
    subject: text(150, 3),
    message: text(4000, 10),
    website: z.string().max(200).optional(), // honeypot — must stay empty
    startedAt: z.coerce.number().optional(),
  })
  ;

function multerErrors(err: unknown) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return badRequest(`Each reference image must be ${config.uploads.maxEnquiryImageBytes / 1024 / 1024} MB or smaller.`);
    }
    if (err.code === 'LIMIT_FILE_COUNT') return badRequest(`You can attach up to ${config.uploads.maxEnquiryImages} images.`);
    return badRequest('The upload could not be processed.');
  }
  return err;
}

export function assertCanSubmit(req: Request, allowGuests: boolean, what: string) {
  if (req.user?.role === 'ADMIN') throw forbidden(`Admin accounts cannot submit ${what}. Use a customer account.`);
  if (!req.user && !allowGuests) {
    throw new HttpError(401, `Please sign in or create an account to send ${what}.`, 'LOGIN_REQUIRED');
  }
  if (req.user && config.requireEmailVerification && !req.user.emailVerifiedAt) {
    throw new HttpError(403, 'Please verify your email address first.', 'EMAIL_NOT_VERIFIED');
  }
}

enquiriesRouter.post(
  '/',
  publicFormLimiter,
  (req, res, next) => upload.array('images', config.uploads.maxEnquiryImages)(req, res, (err) => next(multerErrors(err))),
  async (req, res) => {
    const settings = await getEnquirySettings();
    assertCanSubmit(req, settings.allowGuests, 'an enquiry');
    const data = parse(EnquirySchema, req.body);
    if (!req.user && !data.email && !data.phone) throw badRequest('Please give an email address or phone number so we can reply.');

    // Spam protection: honeypot + "too fast to be human" for guests.
    if (data.website) throw badRequest('Your enquiry could not be sent.');
    if (!req.user && data.startedAt && Date.now() - data.startedAt < 3000) {
      throw badRequest('Please take a moment to complete the form and try again.');
    }

    let serviceLabel = data.serviceLabel;
    if (data.serviceId) {
      const s = await prisma.service.findFirst({ where: { id: data.serviceId, status: 'PUBLISHED' } });
      if (!s) throw badRequest('Please choose a valid service.');
      serviceLabel = s.title;
    }
    if (data.relatedWorkId) {
      const w = await prisma.recentWork.findFirst({ where: { id: data.relatedWorkId, status: 'PUBLISHED' } });
      if (!w) throw badRequest('The related design is no longer available.');
      if (!w.enquiryEnabled) throw badRequest('Enquiries are closed for this design.');
    }

    // Store reference images first; roll them back if the DB write fails.
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const assets = [];
    try {
      for (const f of files) {
        assets.push(
          await storeUpload(f, {
            isPublic: false,
            uploadedById: req.user?.id,
            maxImageBytes: config.uploads.maxEnquiryImageBytes,
          }),
        );
      }
    } catch (err) {
      await deleteAssets(assets.map((a) => a.id));
      throw err;
    }

    const user = req.user;
    try {
      const enquiry = await prisma.enquiry.create({
        data: {
          reference: makeReference('ENQ'),
          userId: user?.id ?? null,
          name: data.name,
          email: user ? user.email : data.email,
          phone: data.phone ?? user?.phone ?? null,
          serviceId: data.serviceId,
          serviceLabel,
          relatedWorkId: data.relatedWorkId,
          subject: data.subject,
          messages: { create: { authorType: 'CUSTOMER', authorId: user?.id ?? null, body: data.message } },
          attachments: { create: assets.map((a) => ({ assetId: a.id })) },
        },
      });
      await notifyAdminByEmail(
        `New enquiry ${enquiry.reference}: ${enquiry.subject}`,
        `From: ${enquiry.name}\nService: ${serviceLabel ?? '—'}\n\nOpen the admin panel to read and reply.`,
      );
      res.status(201).json({ enquiry: { id: enquiry.id, reference: enquiry.reference, linkedToAccount: Boolean(user) } });
    } catch (err) {
      await deleteAssets(assets.map((a) => a.id));
      throw err;
    }
  },
);

/** Reference images are private: only the enquiry owner or an admin may view them. */
enquiriesRouter.get('/:enquiryId/attachments/:attachmentId', async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Please sign in to continue.', 'UNAUTHORIZED');
  const enquiryId = id.parse(req.params.enquiryId);
  const attachmentId = id.parse(req.params.attachmentId);
  const att = await prisma.enquiryAttachment.findFirst({
    where: { id: attachmentId, enquiryId },
    include: { asset: true, enquiry: { select: { userId: true } } },
  });
  if (!att) throw notFound();
  if (req.user.role !== 'ADMIN' && att.enquiry.userId !== req.user.id) throw notFound();
  const key = req.query.size === 'thumb' && att.asset.thumbKey ? att.asset.thumbKey : att.asset.key;
  const obj = await storage.get(key);
  if (!obj) throw notFound('File missing from storage.');
  res.set({
    'Content-Type': att.asset.mime,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  obj.stream.pipe(res);
});

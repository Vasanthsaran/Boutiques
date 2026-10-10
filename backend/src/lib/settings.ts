import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { optionalText, text } from './validate.js';
import { serializeAsset } from './media.js';

// ───────── Schemas (also used to validate admin input) ─────────

const url = z
  .union([z.string(), z.null()])
  .optional()
  .transform((s) => (s == null || s.trim() === '' ? null : s.trim()))
  .pipe(
    z
      .string()
      .max(500)
      .refine((s) => /^https:\/\//i.test(s), 'links must start with https://')
      .nullable(),
  );

export const BusinessSchema = z.object({
  name: text(80, 1),
  tagline: optionalText(160),
  phone: optionalText(30),
  whatsapp: optionalText(30),
  email: z
    .union([z.string(), z.null()])
    .optional()
    .transform((s) => (s == null || s.trim() === '' ? null : s.trim().toLowerCase()))
    .pipe(z.string().email('enter a valid email').max(254).nullable()),
  address: optionalText(400),
  hours: optionalText(400),
  mapEmbedUrl: url.refine(
    (s) => s == null || /^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/i.test(s) || /^https:\/\/maps\.google\./i.test(s),
    'use a Google Maps "embed a map" link',
  ),
  mapLink: url,
  socials: z.object({
    instagram: url,
    facebook: url,
    youtube: url,
    pinterest: url,
  }),
});
export type Business = z.infer<typeof BusinessSchema>;

const imageRef = z.union([z.string().max(40), z.null()]).optional().transform((v) => v ?? null);
const sectionText = z.object({ title: text(120), subtitle: optionalText(400) });

export const HomeContentSchema = z.object({
  announcement: optionalText(160),
  hero: z.object({
    eyebrow: optionalText(80),
    headline: text(120, 1),
    subtext: text(400),
    primaryCtaLabel: text(40, 1),
    secondaryCtaLabel: text(40, 1),
    imageId: imageRef,
    show3d: z.boolean(),
    features: z.array(text(40, 1)).max(4),
  }),
  sections: z.object({
    services: z.boolean(),
    featuredWork: z.boolean(),
    collections: z.boolean(),
    process: z.boolean(),
    about: z.boolean(),
    booking: z.boolean(),
    testimonials: z.boolean(),
    contact: z.boolean(),
  }),
  services: sectionText,
  featuredWork: sectionText.extend({ limit: z.number().int().min(3).max(12) }),
  collections: sectionText.extend({ collectionIds: z.array(z.string().max(40)).max(12) }),
  process: z.object({
    title: text(120),
    subtitle: optionalText(400),
    steps: z.array(z.object({ title: text(80, 1), body: text(400) })).max(6),
  }),
  about: z.object({
    eyebrow: optionalText(80),
    title: text(120),
    body: text(3000),
    imageId: imageRef,
    badgeTitle: optionalText(60),
    badgeText: optionalText(100),
    stats: z.array(z.object({ value: text(20, 1), label: text(40, 1) })).max(3),
  }),
  booking: sectionText.extend({ eyebrow: optionalText(60) }),
  testimonials: sectionText,
  contact: sectionText,
  footer: z.object({ blurb: optionalText(400) }),
});
export type HomeContent = z.infer<typeof HomeContentSchema>;

export const BookingSettingsSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().min(1).max(60),
  slotMinutes: z.number().int().min(15).max(240),
  minLeadHours: z.number().int().min(0).max(24 * 14),
  maxAdvanceDays: z.number().int().min(1).max(365),
  allowGuests: z.boolean(),
});
export type BookingSettings = z.infer<typeof BookingSettingsSchema>;

export const EnquirySettingsSchema = z.object({ allowGuests: z.boolean() });
export type EnquirySettings = z.infer<typeof EnquirySettingsSchema>;

// ───────── Defaults (no invented business facts) ─────────

export const DEFAULT_BUSINESS: Business = {
  name: 'SVSS Boutique',
  tagline: 'Custom Designing · Maggam · Embroidery · Stitching',
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  hours: null,
  mapEmbedUrl: null,
  mapLink: null,
  socials: { instagram: null, facebook: null, youtube: null, pinterest: null },
};

export const DEFAULT_HOME: HomeContent = {
  announcement: 'Custom Designing · Maggam · Embroidery · Stitching | Book Your Consultation',
  hero: {
    eyebrow: 'SVSS Boutique — Custom Designing & Couture',
    headline: 'Elegance, Woven Into Every Detail.',
    subtext:
      'Discover exquisite custom designing, intricate Maggam work, beautiful embroidery, and expert stitching—all crafted around your unique style.',
    primaryCtaLabel: 'Explore Our Work',
    secondaryCtaLabel: 'Book an Appointment',
    imageId: null,
    show3d: true,
    features: ['Custom Designing', 'Maggam Work', 'Expert Stitching'],
  },
  sections: {
    services: true,
    featuredWork: true,
    collections: true,
    process: true,
    about: true,
    booking: true,
    testimonials: true,
    contact: true,
  },
  services: {
    title: 'Curated For Your Moments',
    subtitle: 'Explore timeless silhouettes, exquisite craftsmanship, and designs made to be remembered forever.',
  },
  featuredWork: { title: 'Recent Work — Timeless Indian Elegance', subtitle: null, limit: 6 },
  collections: { title: 'Curated For Your Moments', subtitle: 'Explore timeless silhouettes, exquisite craftsmanship, and designs made to be remembered forever.', collectionIds: [] },
  process: {
    title: 'How Custom Designing Works',
    subtitle: null,
    steps: [
      { title: 'Consultation', body: 'Book an appointment or send an enquiry with your idea and references.' },
      { title: 'Design', body: 'We discuss fabric, silhouette, embroidery and finishing details with you.' },
      { title: 'Crafting', body: 'Your garment is stitched and embellished in our studio.' },
      { title: 'Fitting', body: 'We check the fit and finishing before your garment is ready.' },
    ],
  },
  about: {
    eyebrow: 'Artisanal Heritage',
    title: 'Tradition, Reimagined For You',
    body: 'At SVSS Boutique, every outfit is an expression of individuality, craftsmanship, and timeless elegance.\n\nWe specialise in custom designing, Maggam work, embroidery and stitching — each piece made around you.',
    imageId: null,
    badgeTitle: 'Handcrafted With Care',
    badgeText: 'Custom Designing • Maggam • Embroidery',
    stats: [],
  },
  booking: {
    eyebrow: 'Private Consultation',
    title: 'Your Personal Styling Experience',
    subtitle: 'Discover a more personal way to find your perfect outfit. Book a consultation at our studio.',
  },
  testimonials: { title: 'Kind Words', subtitle: null },
  contact: { title: 'Visit or Write to Us', subtitle: null },
  footer: { blurb: 'Custom designing, intricate Maggam work, beautiful embroidery and expert stitching — crafted around your unique style.' },
};

export const DEFAULT_BOOKING: BookingSettings = {
  enabled: true,
  timezone: 'Asia/Kolkata',
  slotMinutes: 60,
  minLeadHours: 12,
  maxAdvanceDays: 60,
  allowGuests: false,
};

export const DEFAULT_ENQUIRY: EnquirySettings = { allowGuests: false };

// ───────── Access ─────────

async function read<T>(key: string, fallback: T, schema?: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const row = await prisma.storeSettings.findUnique({ where: { key } });
  if (!row) return fallback;
  const merged = deepMerge(fallback, row.value as Partial<T>);
  if (!schema) return merged;
  const parsed = schema.safeParse(merged);
  return parsed.success ? parsed.data : fallback;
}

export async function write(key: string, value: unknown, userId?: string | null) {
  await prisma.storeSettings.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedById: userId ?? null },
    update: { value: value as Prisma.InputJsonValue, updatedById: userId ?? null },
  });
}

export const getBusiness = () => read('business', DEFAULT_BUSINESS, BusinessSchema);
export const getBooking = () => read('booking', DEFAULT_BOOKING, BookingSettingsSchema);
export const getEnquirySettings = () => read('enquiries', DEFAULT_ENQUIRY, EnquirySettingsSchema);

export interface HomepageRecord {
  draft: HomeContent;
  published: HomeContent;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
}

export async function getHomepage(): Promise<HomepageRecord> {
  const row = await prisma.storeSettings.findUnique({ where: { key: 'homepage' } });
  const v = (row?.value ?? {}) as Partial<HomepageRecord>;
  const norm = (c: unknown) => {
    const parsed = HomeContentSchema.safeParse(deepMerge(DEFAULT_HOME, (c ?? {}) as Partial<HomeContent>));
    return parsed.success ? parsed.data : DEFAULT_HOME;
  };
  return {
    draft: norm(v.draft ?? v.published),
    published: norm(v.published),
    publishedAt: v.publishedAt ?? null,
    draftUpdatedAt: v.draftUpdatedAt ?? null,
  };
}

/** Replace image ids in home content with resolved media objects. */
export async function resolveHomeImages(content: HomeContent) {
  const ids = [content.hero.imageId, content.about.imageId].filter(Boolean) as string[];
  const assets = ids.length ? await prisma.mediaAsset.findMany({ where: { id: { in: ids }, isPublic: true } }) : [];
  const byId = new Map(assets.map((a) => [a.id, serializeAsset(a)]));
  return {
    ...content,
    hero: { ...content.hero, image: content.hero.imageId ? byId.get(content.hero.imageId) ?? null : null },
    about: { ...content.about, image: content.about.imageId ? byId.get(content.about.imageId) ?? null : null },
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: Partial<T> | undefined): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : (patch as T)) ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

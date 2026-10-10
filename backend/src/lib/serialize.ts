import type { Prisma } from '@prisma/client';
import { serializeAsset } from './media.js';

// ───────── Prisma includes ─────────

export const workCardInclude = {
  cover: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.RecentWorkInclude;

export const workDetailInclude = {
  cover: true,
  category: { select: { id: true, name: true, slug: true } },
  media: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.RecentWorkInclude;

type WorkCard = Prisma.RecentWorkGetPayload<{ include: typeof workCardInclude }>;
type WorkDetail = Prisma.RecentWorkGetPayload<{ include: typeof workDetailInclude }>;

/** Public-safe shape: only fields a visitor may see. */
export function publicWorkCard(w: WorkCard) {
  return {
    id: w.id,
    slug: w.slug,
    title: w.title,
    excerpt: w.description.length > 180 ? `${w.description.slice(0, 177).trimEnd()}…` : w.description,
    category: w.category,
    cover: serializeAsset(w.cover),
    featured: w.featured,
    completedAt: w.completedAt ? w.completedAt.toISOString().slice(0, 10) : null,
    publishedAt: w.publishedAt?.toISOString() ?? null,
  };
}

export function publicWorkDetail(w: WorkDetail) {
  const byRole = (role: string) =>
    w.media.filter((m) => m.role === role).map((m) => ({ ...serializeAsset(m.asset)!, caption: m.caption }));
  return {
    ...publicWorkCard(w),
    description: w.description,
    priceRange: w.priceRange,
    enquiryEnabled: w.enquiryEnabled,
    gallery: byRole('GALLERY'),
    video: byRole('VIDEO')[0] ?? null,
    beforeAfter: (() => {
      const before = byRole('BEFORE')[0];
      const after = byRole('AFTER')[0];
      return before && after ? { before, after } : null;
    })(),
  };
}

/** Full admin shape (includes draft state and internal fields). */
export function adminWork(w: WorkDetail & { collections?: { collectionId: string }[] }) {
  return {
    id: w.id,
    slug: w.slug,
    title: w.title,
    description: w.description,
    categoryId: w.categoryId,
    category: w.category,
    cover: serializeAsset(w.cover),
    completedAt: w.completedAt ? w.completedAt.toISOString().slice(0, 10) : null,
    featured: w.featured,
    featuredOrder: w.featuredOrder,
    status: w.status,
    publishedAt: w.publishedAt?.toISOString() ?? null,
    priceRange: w.priceRange,
    enquiryEnabled: w.enquiryEnabled,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    media: w.media.map((m) => ({
      id: m.id,
      role: m.role,
      caption: m.caption,
      sortOrder: m.sortOrder,
      asset: serializeAsset(m.asset)!,
    })),
    collectionIds: w.collections?.map((c) => c.collectionId) ?? [],
  };
}

export const serviceInclude = {
  cover: true,
  images: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ServiceInclude;
type ServiceFull = Prisma.ServiceGetPayload<{ include: typeof serviceInclude }>;

export function publicService(s: ServiceFull) {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    summary: s.summary,
    description: s.description,
    cover: serializeAsset(s.cover),
    images: s.images.map((i) => serializeAsset(i.asset)!),
    priceRange: s.priceRange,
    duration: s.duration,
    isAvailable: s.isAvailable,
    availability: s.availability,
  };
}

export function adminService(s: ServiceFull) {
  return {
    ...publicService(s),
    isCore: s.isCore,
    status: s.status,
    sortOrder: s.sortOrder,
    updatedAt: s.updatedAt.toISOString(),
  };
}

type CollectionWithCover = Prisma.CollectionGetPayload<{ include: { cover: true } }>;
export function publicCollection(c: CollectionWithCover, workCount?: number) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    cover: serializeAsset(c.cover),
    featured: c.featured,
    workCount: workCount ?? null,
  };
}

type CategoryWithCover = Prisma.CategoryGetPayload<{ include: { cover: true } }>;
export function publicCategory(c: CategoryWithCover, workCount?: number) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    cover: serializeAsset(c.cover),
    workCount: workCount ?? null,
  };
}

// ───────── Appointments & enquiries (customer-safe) ─────────

type ApptForCustomer = Prisma.AppointmentGetPayload<{
  include: { changeRequests: true; relatedWork: { select: { slug: true; title: true } } };
}>;

export function customerAppointment(a: ApptForCustomer) {
  return {
    id: a.id,
    reference: a.reference,
    serviceTitle: a.serviceTitle,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    status: a.status,
    message: a.message,
    designRef: a.designRef,
    statusNote: a.statusNote,
    relatedWork: a.relatedWork,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    pendingRequest: (() => {
      const r = a.changeRequests.find((c) => c.status === 'PENDING');
      return r
        ? { id: r.id, requestedStartAt: r.requestedStartAt?.toISOString() ?? null, message: r.message, createdAt: r.createdAt.toISOString() }
        : null;
    })(),
    // NOTE: adminNotes is intentionally never included here.
  };
}

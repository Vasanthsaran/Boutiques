import crypto from 'node:crypto';
import sharp, { type OutputInfo } from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { MediaAsset } from '@prisma/client';
import { prisma } from '../db.js';
import { storage } from './storage.js';
import { badRequest } from './errors.js';
import { config } from '../config.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif']);
const VIDEO_TYPES = new Map([
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
]);

sharp.cache(false);
sharp.concurrency(2);

export interface UploadOptions {
  allowVideo?: boolean;
  isPublic?: boolean;
  uploadedById?: string | null;
  alt?: string | null;
  maxImageBytes?: number;
}

/**
 * Validates an uploaded file by its actual bytes (not the client-declared type),
 * re-encodes images (strips EXIF/GPS metadata, fixes orientation, caps size),
 * stores the result in persistent storage and records a MediaAsset row.
 */
export async function storeUpload(file: Express.Multer.File, opts: UploadOptions = {}): Promise<MediaAsset> {
  const detected = await fileTypeFromBuffer(file.buffer);
  const mime = detected?.mime ?? 'application/octet-stream';
  const visibility = opts.isPublic === false ? 'private' : 'public';
  const id = crypto.randomBytes(12).toString('hex');
  const now = new Date();
  const prefix = `${visibility}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  if (IMAGE_TYPES.has(mime)) {
    const maxBytes = opts.maxImageBytes ?? config.uploads.maxImageBytes;
    if (file.size > maxBytes) throw badRequest(`Images must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
    let main: { data: Buffer; info: OutputInfo };
    let thumb: Buffer;
    try {
      const base = sharp(file.buffer, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate();
      main = await base
        .clone()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer({ resolveWithObject: true });
      thumb = await base
        .clone()
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch {
      throw badRequest('That image could not be read. Please upload a valid JPG, PNG, WebP or HEIC photo.');
    }
    const key = `${prefix}/${id}.webp`;
    const thumbKey = `${prefix}/${id}-thumb.webp`;
    await storage.put(key, main.data, 'image/webp');
    await storage.put(thumbKey, thumb, 'image/webp');
    try {
      return await prisma.mediaAsset.create({
        data: {
          key,
          thumbKey,
          kind: 'IMAGE',
          mime: 'image/webp',
          size: main.data.length,
          width: main.info.width,
          height: main.info.height,
          alt: opts.alt ?? null,
          isPublic: visibility === 'public',
          uploadedById: opts.uploadedById ?? null,
        },
      });
    } catch (err) {
      await Promise.allSettled([storage.delete(key), storage.delete(thumbKey)]);
      throw err;
    }
  }

  if (opts.allowVideo && VIDEO_TYPES.has(mime)) {
    if (file.size > config.uploads.maxVideoBytes) {
      throw badRequest(`Videos must be ${Math.round(config.uploads.maxVideoBytes / 1024 / 1024)} MB or smaller.`);
    }
    const key = `${prefix}/${id}.${VIDEO_TYPES.get(mime)}`;
    await storage.put(key, file.buffer, mime);
    try {
      return await prisma.mediaAsset.create({
        data: {
          key,
          kind: 'VIDEO',
          mime,
          size: file.size,
          alt: opts.alt ?? null,
          isPublic: visibility === 'public',
          uploadedById: opts.uploadedById ?? null,
        },
      });
    } catch (err) {
      await storage.delete(key).catch(() => undefined);
      throw err;
    }
  }

  throw badRequest(
    opts.allowVideo
      ? 'Unsupported file type. Upload JPG, PNG, WebP or HEIC images, or MP4/WebM/MOV videos.'
      : 'Unsupported file type. Upload JPG, PNG, WebP or HEIC images.',
  );
}

/** Deletes asset rows and their stored objects. Storage failures are logged, not thrown. */
export async function deleteAssets(ids: string[]) {
  if (!ids.length) return;
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } } });
  await prisma.mediaAsset.deleteMany({ where: { id: { in: ids } } });
  await deleteStoredObjects(assets);
}

export async function deleteStoredObjects(assets: Pick<MediaAsset, 'key' | 'thumbKey'>[]) {
  const keys = assets.flatMap((a) => [a.key, a.thumbKey].filter(Boolean) as string[]);
  const results = await Promise.allSettled(keys.map((k) => storage.delete(k)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[media] failed to delete ${keys[i]}`);
  });
}

export function mediaUrl(key: string) {
  return storage.publicUrl(key) ?? `/media/${key}`;
}

export type PublicMedia = {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
};

export function serializeAsset(a: MediaAsset | null | undefined): PublicMedia | null {
  if (!a) return null;
  return {
    id: a.id,
    kind: a.kind,
    url: mediaUrl(a.key),
    thumbUrl: a.thumbKey ? mediaUrl(a.thumbKey) : null,
    width: a.width,
    height: a.height,
    alt: a.alt,
  };
}

/** Remove assets that were uploaded but never attached to anything (e.g. abandoned forms). */
export async function cleanupOrphanAssets(olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000);
  const orphans = await prisma.mediaAsset.findMany({
    where: {
      createdAt: { lt: cutoff },
      serviceCovers: { none: {} },
      serviceImages: { none: {} },
      collectionCovers: { none: {} },
      categoryCovers: { none: {} },
      workCovers: { none: {} },
      workMedia: { none: {} },
      enquiryAttachment: { none: {} },
    },
    take: 500,
  });
  // Assets referenced from homepage settings JSON are protected too.
  const settings = await prisma.storeSettings.findMany();
  const settingsText = JSON.stringify(settings.map((s) => s.value));
  const removable = orphans.filter((a) => !settingsText.includes(a.id));
  await deleteAssets(removable.map((a) => a.id));
  return removable.length;
}

export type AssetOwner = { type: 'work' | 'service' | 'collection' | 'category' | 'homepage'; id?: string };

/**
 * Ensures every asset exists, is public, and is not already used by a different
 * owner. Each uploaded file belongs to exactly one place so deleting it is safe.
 */
export async function assertAssetsUsable(ids: string[], owner: AssetOwner) {
  if (!ids.length) return new Map<string, MediaAsset>();
  if (new Set(ids).size !== ids.length) throw badRequest('The same file was added twice.');
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: ids } },
    include: {
      workMedia: { select: { workId: true } },
      workCovers: { select: { id: true } },
      serviceCovers: { select: { id: true } },
      serviceImages: { select: { serviceId: true } },
      collectionCovers: { select: { id: true } },
      categoryCovers: { select: { id: true } },
      enquiryAttachment: { select: { id: true } },
    },
  });
  if (assets.length !== ids.length) throw badRequest('Some uploaded files are missing. Please upload them again.');
  for (const a of assets) {
    if (!a.isPublic || a.enquiryAttachment.length) throw badRequest('One of the files cannot be used here.');
    const usages: AssetOwner[] = [
      ...a.workMedia.map((m) => ({ type: 'work' as const, id: m.workId })),
      ...a.workCovers.map((w) => ({ type: 'work' as const, id: w.id })),
      ...a.serviceCovers.map((s) => ({ type: 'service' as const, id: s.id })),
      ...a.serviceImages.map((s) => ({ type: 'service' as const, id: s.serviceId })),
      ...a.collectionCovers.map((c) => ({ type: 'collection' as const, id: c.id })),
      ...a.categoryCovers.map((c) => ({ type: 'category' as const, id: c.id })),
    ];
    if (usages.some((u) => u.type !== owner.type || u.id !== owner.id)) {
      throw badRequest('One of the files is already used elsewhere. Please upload it again for this item.');
    }
  }
  return new Map<string, MediaAsset>(assets.map((a) => [a.id, a]));
}

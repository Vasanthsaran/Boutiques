import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors.js';

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const [firstKey, firstMsg] = Object.entries(fields)[0] ?? [];
    const label = firstKey && firstKey !== '_' ? `${firstKey.replace(/([A-Z])/g, ' $1').toLowerCase()} — ` : '';
    throw badRequest(firstMsg ? `Please check the form: ${label}${firstMsg}` : 'Invalid request.', { fields });
  }
  return result.data;
}

export const body = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.body);
export const query = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.query);

// ── Reusable field schemas ──
/** Trim, collapse control characters, and cap length. Output is rendered as text (never HTML) by the client. */
export const text = (max: number, min = 0) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .pipe(min > 0 ? z.string().min(min, `must be at least ${min} characters`).max(max) : z.string().max(max));

export const optionalText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((s) => {
      if (s == null) return null;
      const t = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      return t === '' ? null : t;
    })
    .pipe(z.string().max(max).nullable());

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('enter a valid email address');

export const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^\+?[0-9][0-9\s-]{6,18}$/, 'enter a valid phone number');

export const password = z
  .string()
  .min(8, 'password must be at least 8 characters')
  .max(200, 'password is too long');

export const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i, 'invalid id');
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, numbers and hyphens');

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid date');

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'item';
}

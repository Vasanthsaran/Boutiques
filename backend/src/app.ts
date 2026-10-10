import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Prisma } from '@prisma/client';
import { config } from './config.js';
import { prisma } from './db.js';
import { HttpError } from './lib/errors.js';
import { storage } from './lib/storage.js';
import { loadUser } from './middleware/auth.js';
import { apiLimiter, csrfProtection } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { meRouter } from './routes/me.js';
import { enquiriesRouter } from './routes/enquiries.js';
import { appointmentsRouter } from './routes/appointments.js';
import { adminRouter } from './routes/admin/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  const s3Origin = config.S3_PUBLIC_BASE_URL ? new URL(config.S3_PUBLIC_BASE_URL).origin : null;
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'img-src': ["'self'", 'data:', 'blob:', ...(s3Origin ? [s3Origin] : [])],
          'media-src': ["'self'", 'blob:', ...(s3Origin ? [s3Origin] : [])],
          'connect-src': ["'self'"],
          'frame-src': ['https://www.google.com', 'https://maps.google.com'],
          'worker-src': ["'self'", 'blob:'],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  app.get('/healthz', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Public media (work photos, service images…). Private files live under "private/"
  // and are only reachable through authorised endpoints.
  app.get('/media/*key', async (req, res, next) => {
    try {
      const key = (req.params as { key: string[] }).key.join('/');
      if (!key.startsWith('public/') || !/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new HttpError(404, 'Not found');
      const obj = await storage.get(key);
      if (!obj) throw new HttpError(404, 'Not found');
      const ext = path.extname(key).toLowerCase();
      const types: Record<string, string> = { '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
      res.set({
        'Content-Type': obj.contentType ?? types[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable', // keys are unique per upload
        'X-Content-Type-Options': 'nosniff',
        ...(obj.contentLength ? { 'Content-Length': String(obj.contentLength) } : {}),
      });
      obj.stream.on('error', next).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  const api = express.Router();
  api.use(apiLimiter);
  api.use(loadUser);
  api.use(csrfProtection);
  api.use('/auth', authRouter);
  api.use('/public', publicRouter);
  api.use('/me', meRouter);
  api.use('/enquiries', enquiriesRouter);
  api.use('/appointments', appointmentsRouter);
  api.use('/admin', adminRouter);
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found.', 'NOT_FOUND')));
  app.use('/api', api);

  // Production: serve the built SPA from the same origin.
  const frontendDist = path.resolve(here, '../../../frontend/dist');
  const frontendDistAlt = path.resolve(here, '../../frontend/dist');
  const dist = [frontendDist, frontendDistAlt].find((p) => fs.existsSync(path.join(p, 'index.html')));
  if (dist) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders(res, file) {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('/{*splat}', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // Error handler: friendly messages, no internals leaked.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'The request is too large.' } });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed request.' } });
    }
    // Zod errors thrown directly from .parse() on params
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'ZodError') {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid request.' } });
    }
    console.error(`[error] ${req.method} ${req.path}`, err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on our side. Please try again.' } });
  });

  return app;
}

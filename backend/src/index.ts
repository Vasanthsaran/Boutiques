import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db.js';
import { cleanupOrphanAssets } from './lib/media.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  console.info(`SVSS Boutique API listening on http://localhost:${config.PORT} (${config.NODE_ENV}, storage=${config.STORAGE_DRIVER})`);
  if (!config.smtpConfigured) console.info('[info] SMTP not configured — emails are disabled; communication stays in-app.');
});

// Housekeeping: expired sessions/tokens and abandoned uploads, every 6 hours.
async function housekeeping() {
  try {
    const now = new Date();
    await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
    await prisma.authToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86400000) } } });
    const removed = await cleanupOrphanAssets(24);
    if (removed) console.info(`[housekeeping] removed ${removed} unused uploads`);
  } catch (err) {
    console.error('[housekeeping] failed', (err as Error).message);
  }
}
setTimeout(housekeeping, 30_000).unref();
setInterval(housekeeping, 6 * 3600 * 1000).unref();

function shutdown() {
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

import { prisma } from '../src/db.js';
import { cleanupOrphanAssets } from '../src/lib/media.js';

const hours = Number(process.argv[2] ?? 24);
cleanupOrphanAssets(hours)
  .then((n) => console.info(`Removed ${n} unused upload(s) older than ${hours}h.`))
  .finally(() => prisma.$disconnect());

import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

type Tx = Prisma.TransactionClient | typeof prisma;

export async function notifyUser(
  userId: string | null | undefined,
  n: { type: string; title: string; body?: string; link?: string },
  tx: Tx = prisma,
) {
  if (!userId) return;
  await tx.notification.create({ data: { userId, ...n } });
}

import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

type Tx = Prisma.TransactionClient | typeof prisma;

export async function logActivity(
  actorId: string | null | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  meta?: Prisma.InputJsonValue,
  tx: Tx = prisma,
) {
  await tx.adminActivityLog.create({
    data: { actorId: actorId ?? null, action, entityType, entityId, summary: summary.slice(0, 300), meta },
  });
}

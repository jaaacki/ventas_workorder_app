import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

/**
 * Detail include for the Het view: the in-use / finished work-order links plus
 * the join rows that record which work orders consumed this HET.
 */
const hetDetailInclude = {
  usedBy: { select: { id: true, woNumber: true } },
  finishedBy: { select: { id: true, woNumber: true } },
  workOrders: { select: { id: true, woNumber: true } },
} satisfies Prisma.HetInclude;

export interface UseHetInput {
  workOrderId: string;
  actorId: string;
}

export interface FinishHetInput {
  workOrderId: string;
  actorId: string;
}

/**
 * List all HETs that have not been soft-deleted, newest first.
 */
export async function listHets() {
  return prisma.het.findMany({
    where: { deleted: false },
    orderBy: { createdAt: 'desc' },
    include: hetDetailInclude,
  });
}

/**
 * Mark a HET as in-use by a work order: link the work order on the HET's
 * `usedById` (a WorkOrder FK) and create the WorkOrderHet join row linking the
 * two. The link creation is idempotent — a duplicate WorkOrderHet row is skipped
 * via an upsert keyed on the (workOrderId, hetId) compound id.
 *
 * Throws a P2025-shaped error if the HET does not exist (Het.usedById update on
 * a missing row) or the work order does not exist (FK violation surfaced as
 * P2025/P2003).
 */
export async function useHet(hetId: string, input: UseHetInput) {
  const updated = await prisma.het.update({
    where: { id: hetId },
    data: { usedById: input.workOrderId },
    include: hetDetailInclude,
  });

  await prisma.workOrderHet.upsert({
    where: { workOrderId_hetId: { workOrderId: input.workOrderId, hetId } },
    create: { workOrderId: input.workOrderId, hetId },
    update: {},
  });

  return updated;
}

/**
 * Mark a HET as finished by a work order: record the work order on the HET's
 * `finishedById` (a WorkOrder FK). Throws a P2025-shaped error if the HET does
 * not exist.
 */
export async function finishHet(hetId: string, input: FinishHetInput) {
  return prisma.het.update({
    where: { id: hetId },
    data: { finishedById: input.workOrderId },
    include: hetDetailInclude,
  });
}

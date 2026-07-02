import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

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
  tenantId?: string | null;
}

export interface FinishHetInput {
  workOrderId: string;
  actorId: string;
  tenantId?: string | null;
}

/**
 * List all HETs that have not been soft-deleted, newest first.
 */
export async function listHets(tenantId?: string | null) {
  return prisma.het.findMany({
    where: { deleted: false, tenantId: tenantIdOrDefault(tenantId) },
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
  const scopedTenantId = tenantIdOrDefault(input.tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: input.workOrderId, tenantId: scopedTenantId, deleted: false },
    select: { id: true },
  });
  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  const het = await prisma.het.findFirst({
    where: { id: hetId, tenantId: scopedTenantId, deleted: false },
    select: { id: true },
  });
  if (!het) {
    throw new Prisma.PrismaClientKnownRequestError('HET not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.het.updateMany({
      where: { id: hetId, tenantId: scopedTenantId, deleted: false },
      data: { usedById: input.workOrderId },
    });
    if (updateResult.count === 0) {
      throw new Prisma.PrismaClientKnownRequestError('HET not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }

    await tx.workOrderHet.upsert({
      where: { workOrderId_hetId: { workOrderId: input.workOrderId, hetId } },
      create: { workOrderId: input.workOrderId, hetId },
      update: {},
    });

    return tx.het.findFirstOrThrow({
      where: { id: hetId, tenantId: scopedTenantId, deleted: false },
      include: hetDetailInclude,
    });
  });

  return updated;
}

/**
 * Mark a HET as finished by a work order: record the work order on the HET's
 * `finishedById` (a WorkOrder FK). Throws a P2025-shaped error if the HET does
 * not exist.
 */
export async function finishHet(hetId: string, input: FinishHetInput) {
  const scopedTenantId = tenantIdOrDefault(input.tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: input.workOrderId, tenantId: scopedTenantId, deleted: false },
    select: { id: true },
  });
  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  const het = await prisma.het.findFirst({
    where: { id: hetId, tenantId: scopedTenantId, deleted: false },
    select: { id: true },
  });
  if (!het) {
    throw new Prisma.PrismaClientKnownRequestError('HET not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.het.updateMany({
      where: { id: hetId, tenantId: scopedTenantId, deleted: false },
      data: { finishedById: input.workOrderId },
    });
    if (updated.count === 0) {
      throw new Prisma.PrismaClientKnownRequestError('HET not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }

    return tx.het.findFirstOrThrow({
      where: { id: hetId, tenantId: scopedTenantId, deleted: false },
      include: hetDetailInclude,
    });
  });
}

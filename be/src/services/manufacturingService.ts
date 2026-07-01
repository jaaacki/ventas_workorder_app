import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

/**
 * Detail include for the batch-record view: the actor stamps and the work
 * orders this manufacturer record backs.
 */
const manufacturerDetailInclude = {
  workOrders: { select: { id: true, woNumber: true, phaseShort: true } },
} satisfies PrismaTypes.ManufacturerInclude;

/**
 * Generate the official manufacturing batch record for a work order.
 *
 * Creates a Manufacturer row stamped with the actor, derives a unique
 * `manuNumber` from the current wall clock (MANU-<base36>), and links it back
 * onto the work order (`manuId` + `manuNumber`). Throws a P2025-shaped Prisma
 * error if the work order does not exist.
 */
export async function generateBatchRecord(workOrderId: string, actorId: string, tenantId?: string | null) {
  const manuNumber = `MANU-${Date.now().toString(36).toUpperCase()}`;
  const scopedTenantId = tenantIdOrDefault(tenantId);

  return prisma.$transaction(async (tx) => {
    // Confirm the work order exists; a missing row surfaces as P2025 below.
    const workOrder = await tx.workOrder.findFirst({ where: { id: workOrderId, tenantId: scopedTenantId } });
    if (!workOrder) {
      throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }

    const manufacturer = await tx.manufacturer.create({
      data: {
        tenantId: scopedTenantId,
        manuNumber,
        createdById: actorId,
        updatedById: actorId,
      },
      include: manufacturerDetailInclude,
    });

    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        manuId: manufacturer.id,
        manuNumber,
        updatedById: actorId,
      },
    });

    return manufacturer;
  });
}

export async function getBatchRecord(id: string, tenantId?: string | null) {
  return prisma.manufacturer.findFirst({
    where: { id, tenantId: tenantIdOrDefault(tenantId) },
    include: manufacturerDetailInclude,
  });
}

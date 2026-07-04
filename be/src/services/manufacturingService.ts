import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { generatePrefixedId } from '../lib/ids.js';
import { tenantIdOrDefault } from './tenant.js';
import { writeAuditLog } from './auditLogService.js';

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
 * `manuNumber` (MANU-<base36 ms>-<random suffix>, collision-safe within a
 * millisecond), and links it back onto the work order (`manuId` + `manuNumber`).
 * Throws a P2025-shaped Prisma error if the work order does not exist.
 */
export async function generateBatchRecord(workOrderId: string, actorId: string, tenantId?: string | null) {
  const manuNumber = generatePrefixedId('MANU');
  const scopedTenantId = tenantIdOrDefault(tenantId);

  const manufacturer = await prisma.$transaction(async (tx) => {
    // Confirm the work order exists; a missing row surfaces as P2025 below.
    const workOrder = await tx.workOrder.findFirst({ where: { id: workOrderId, tenantId: scopedTenantId } });
    if (!workOrder) {
      throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }

    const created = await tx.manufacturer.create({
      data: {
        tenantId: scopedTenantId,
        manuNumber,
        createdById: actorId,
        updatedById: actorId,
      },
      include: manufacturerDetailInclude,
    });

    const updated = await tx.workOrder.updateMany({
      where: { id: workOrderId, tenantId: scopedTenantId },
      data: {
        manuId: created.id,
        manuNumber,
        updatedById: actorId,
      },
    });
    if (updated.count === 0) {
      throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }

    return created;
  });

  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Manufacturer', entityId: manufacturer.id, action: 'create', after: manufacturer, metadata: { workOrderId, manuNumber } });
  return manufacturer;
}

export async function getBatchRecord(id: string, tenantId?: string | null) {
  return prisma.manufacturer.findFirst({
    where: { id, tenantId: tenantIdOrDefault(tenantId) },
    include: manufacturerDetailInclude,
  });
}

import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';
import { writeAuditLog } from './auditLogService.js';
import {
  auditState,
  getDecoratedWorkOrderOrThrow,
  recordWorkOrderAuditEvent,
} from './workOrderService.js';

export interface RecordHetCollectionInput {
  collectionPointId: string;
  quantity?: number;
  lotNumber?: string;
  parcelTrackingNumber?: string;
  collectionUnitId?: string;
  signatureDataUrl?: string;
}

/**
 * Mint an id in the generateWoNumber idiom (readable millisecond timestamp +
 * random suffix so same-millisecond collections don't clash on the PK).
 */
function mintId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Record a HET collection at a collection phase: create the CollectionOrder /
 * CollectionReceipt / CollectionReceiptLine custody records, mint a real HET,
 * wire the FK links both ways, and attach the HET + receipt to the work order.
 * This is where a HET is born in-app (epic #186 phase 1) — production before
 * this only ever `updateMany`-linked pre-imported HETs.
 *
 * Follows the createSterilisation / recordWorkOrderRelease template: guard →
 * `$transaction` → audit after → return the decorated work order.
 */
export async function recordHetCollection(
  workOrderId: string,
  input: RecordHetCollectionInput,
  actorId: string,
  tenantId?: string | null,
) {
  const scopedTenantId = tenantIdOrDefault(tenantId);

  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenantId: scopedTenantId },
    include: { phase: { select: { processType: true } } },
  });
  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  if (workOrder.phase?.processType !== 'COLLECTION') {
    throw new Error('cannot collect: work order is not at a collection phase');
  }
  if (workOrder.releaseStatus) {
    throw new Error('cannot collect: work order already has a release disposition');
  }
  if (workOrder.hetId || workOrder.collectionReceiptId) {
    throw new Error('cannot collect: work order already has a collected HET');
  }

  const collectionPoint = await prisma.collectionPoint.findFirst({
    where: { id: input.collectionPointId, tenantId: scopedTenantId, deleted: false },
    select: { id: true, supplyEntityId: true, displayName: true, hciCode: true },
  });
  if (!collectionPoint) {
    throw new Error('cannot collect: collection point not found');
  }

  const now = new Date();
  const collectionBase = mintId('COLL');
  const orderId = `${collectionBase}-ORD`;
  const receiptId = `${collectionBase}-RCP`;
  const hetId = mintId('HET');

  const { receipt } = await prisma.$transaction(async (tx) => {
    const order = await tx.collectionOrder.create({
      data: {
        id: orderId,
        tenantId: scopedTenantId,
        supplyEntityId: collectionPoint.supplyEntityId,
        collectionPointId: collectionPoint.id,
        requestedAt: now,
        requestedBy: actorId,
        status: 'COLLECTED',
        createdById: actorId,
        updatedById: actorId,
      },
    });

    const receipt = await tx.collectionReceipt.create({
      data: {
        id: receiptId,
        tenantId: scopedTenantId,
        collectionOrderId: order.id,
        receivedAt: now,
        receivedBy: actorId,
        // Custody signature lives on the receipt (CollectionReceipt.signaturePath);
        // it is the record of who accepted the physical collection.
        signaturePath: input.signatureDataUrl ?? null,
        acceptanceState: 'ACCEPTED',
        createdById: actorId,
        updatedById: actorId,
      },
    });

    // resultingHetId is a soft pointer (no FK), so it can name the HET before it
    // exists; Het.collectionReceiptLineId is a real FK, so the line is created
    // first and the HET second.
    const line = await tx.collectionReceiptLine.create({
      data: {
        tenantId: scopedTenantId,
        collectionReceiptId: receipt.id,
        collectionUnitId: input.collectionUnitId ?? null,
        quantity: input.quantity != null ? new Prisma.Decimal(input.quantity) : null,
        acceptanceStatus: 'ACCEPTED',
        resultingHetId: hetId,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    await tx.het.create({
      data: {
        id: hetId,
        tenantId: scopedTenantId,
        // The Het model has no dedicated lot-number column; the clinic-provided
        // lot number is recorded as hetNumber (which syncHetInventory copies onto
        // the derived InventoryLot.lotNumber). Falls back to the HET id.
        hetNumber: input.lotNumber ?? hetId,
        clinicId: collectionPoint.id,
        clinicName: collectionPoint.displayName,
        HCICode: collectionPoint.hciCode,
        quantity: input.quantity ?? null,
        parcelTrackingNumber: input.parcelTrackingNumber ?? null,
        collectionUnitId: input.collectionUnitId ?? null,
        collectionReceiptLineId: line.id,
        // The collection work order is the first work order of the run, so it is
        // the HET's user (mirrors createWorkOrder's usedById claim).
        usedById: workOrderId,
        sourceSystem: 'api',
        createdById: actorId,
        updatedById: actorId,
      },
    });

    const updated = await tx.workOrder.updateMany({
      where: { id: workOrderId, tenantId: scopedTenantId, hetId: null, collectionReceiptId: null },
      data: { hetId, collectionReceiptId: receipt.id, updatedById: actorId },
    });
    if (updated.count === 0) {
      // A concurrent collection already attached a HET/receipt; abort rather than
      // orphan the records just minted in this transaction.
      throw new Error('cannot collect: work order already has a collected HET');
    }

    return { receipt };
  });

  const after = await prisma.workOrder.findFirstOrThrow({
    where: { id: workOrderId, tenantId: scopedTenantId },
  });
  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId,
    action: 'work_order.het_collected',
    actorId,
    source: 'hetCollectionService.recordHetCollection',
    previousState: auditState(workOrder),
    newState: { ...auditState(after), hetId },
  });
  await writeAuditLog({
    tenantId: scopedTenantId,
    actorId,
    entityType: 'CollectionReceipt',
    entityId: receipt.id,
    action: 'create',
    after: receipt,
    metadata: { workOrderId, hetId, collectionPointId: collectionPoint.id },
  });

  return getDecoratedWorkOrderOrThrow(workOrderId, scopedTenantId);
}

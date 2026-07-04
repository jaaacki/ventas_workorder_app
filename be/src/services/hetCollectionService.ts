import { Prisma } from '@prisma/client';
import type { CollectionUnitStatus } from '@workorder/shared';
import { prisma } from '../db/prisma.js';
import { generatePrefixedId } from '../lib/ids.js';
import { tenantIdOrDefault } from './tenant.js';
import { writeAuditLog } from './auditLogService.js';
import {
  auditState,
  getDecoratedWorkOrderOrThrow,
  recordWorkOrderAuditEvent,
} from './workOrderService.js';

// The only CollectionUnit.status values the live bidirectional path sets. Typed
// against the shared enum so a typo fails typecheck; imported legacy status values
// are never rewritten (see shared/src/enums.ts).
const UNIT_STATUS_ISSUED: CollectionUnitStatus = 'ISSUED';
const UNIT_STATUS_RECEIVED: CollectionUnitStatus = 'RECEIVED';

export interface DeliverEmptyContainerInput {
  collectionPointId: string;
  collectionUnitId: string;
  parcelTrackingNumber?: string;
  signatureDataUrl?: string;
}

/**
 * Deliver-empty leg (epic #186 phase 2, #189): issue an empty collection container
 * out to a clinic. Creates the IssuanceOrder + IssuanceOrderLine custody records
 * with parcel tracking, moves the container into the ISSUED lifecycle state,
 * captures the custody signature, and links the issuance to the work order. The
 * later collect-filled leg (recordHetCollection) closes this issuance and mints the
 * HET. Optional in a run: a collection run may still collect directly with no prior
 * deliver, preserving the phase-1 single-call path.
 *
 * Follows the recordHetCollection / createSterilisation template: guard →
 * `$transaction` → audit after → return the decorated work order.
 */
export async function deliverEmptyContainer(
  workOrderId: string,
  input: DeliverEmptyContainerInput,
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
    throw new Error('cannot deliver: work order is not at a collection phase');
  }
  if (workOrder.releaseStatus) {
    throw new Error('cannot deliver: work order already has a release disposition');
  }
  if (workOrder.hetId || workOrder.collectionReceiptId) {
    throw new Error('cannot deliver: work order already has a collected HET');
  }
  if (workOrder.issuanceOrderId) {
    throw new Error('cannot deliver: work order already has an issued container');
  }

  const collectionPoint = await prisma.collectionPoint.findFirst({
    where: { id: input.collectionPointId, tenantId: scopedTenantId, deleted: false },
    select: { id: true, supplyEntityId: true },
  });
  if (!collectionPoint) {
    throw new Error('cannot deliver: collection point not found');
  }

  // CollectionUnit is a global-FK relation, so the client-supplied container must
  // be tenant-checked here (mirrors the recordHetCollection unit guard).
  const collectionUnit = await prisma.collectionUnit.findFirst({
    where: { id: input.collectionUnitId, tenantId: scopedTenantId, deleted: false },
    select: { id: true },
  });
  if (!collectionUnit) {
    throw new Error('cannot deliver: collection unit not found');
  }

  const now = new Date();
  const issuanceId = `${generatePrefixedId('COLL')}-ISS`;

  const { issuance } = await prisma.$transaction(async (tx) => {
    const issuance = await tx.issuanceOrder.create({
      data: {
        id: issuanceId,
        tenantId: scopedTenantId,
        supplyEntityId: collectionPoint.supplyEntityId,
        collectionPointId: collectionPoint.id,
        issuedAt: now,
        issuedBy: actorId,
        // Deliver custody signature; issuedAt above is its sign date.
        signaturePath: input.signatureDataUrl ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    await tx.issuanceOrderLine.create({
      data: {
        tenantId: scopedTenantId,
        issuanceOrderId: issuance.id,
        collectionUnitId: collectionUnit.id,
        parcelTrackingNumber: input.parcelTrackingNumber ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    // The empty container is now issued and heading to the clinic.
    await tx.collectionUnit.update({
      where: { id: collectionUnit.id },
      data: { status: UNIT_STATUS_ISSUED, updatedById: actorId },
    });

    const updated = await tx.workOrder.updateMany({
      where: { id: workOrderId, tenantId: scopedTenantId, issuanceOrderId: null },
      data: { issuanceOrderId: issuance.id, updatedById: actorId },
    });
    if (updated.count === 0) {
      // A concurrent deliver already issued a container; abort rather than orphan
      // the issuance just created in this transaction.
      throw new Error('cannot deliver: work order already has an issued container');
    }

    return { issuance };
  });

  const after = await prisma.workOrder.findFirstOrThrow({
    where: { id: workOrderId, tenantId: scopedTenantId },
  });
  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId,
    action: 'work_order.empty_delivered',
    actorId,
    source: 'hetCollectionService.deliverEmptyContainer',
    previousState: auditState(workOrder),
    newState: { ...auditState(after), issuanceOrderId: issuance.id },
  });
  await writeAuditLog({
    tenantId: scopedTenantId,
    actorId,
    entityType: 'IssuanceOrder',
    entityId: issuance.id,
    action: 'create',
    after: issuance,
    metadata: { workOrderId, collectionUnitId: collectionUnit.id, collectionPointId: collectionPoint.id },
  });

  return getDecoratedWorkOrderOrThrow(workOrderId, scopedTenantId);
}

export interface RecordHetCollectionInput {
  collectionPointId: string;
  quantity?: number;
  lotNumber?: string;
  parcelTrackingNumber?: string;
  collectionUnitId?: string;
  signatureDataUrl?: string;
  // Next-container swap (#190): issue the next empty container out to the clinic
  // as part of this collect and chain the collected unit → next unit — the legacy
  // swap loop the importer dropped. Requires a collected container to chain from.
  nextCollectionUnitId?: string;
  nextParcelTrackingNumber?: string;
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

  // Het.collectionUnitId is a global FK (no tenant column on the relation), so a
  // client-supplied collection unit must be tenant-checked here — mirroring the
  // collectionPoint guard above — or a caller could attach a collection unit from
  // another tenant to the minted HET and its receipt line.
  if (input.collectionUnitId) {
    const collectionUnit = await prisma.collectionUnit.findFirst({
      where: { id: input.collectionUnitId, tenantId: scopedTenantId, deleted: false },
      select: { id: true },
    });
    if (!collectionUnit) {
      throw new Error('cannot collect: collection unit not found');
    }
  }

  // Collect-filled continuity (#189): if a prior deliver-empty leg issued a
  // container to this run, this collection closes that issuance. The physical
  // container that went out is the one coming back, so its unit (already
  // tenant-validated by the deliver leg) takes precedence over any client-supplied
  // one, and the unit advances to RECEIVED. With no prior deliver this stays null
  // and the phase-1 single-call path is unchanged (status untouched).
  const issuanceOrderId = workOrder.issuanceOrderId;
  let continuityUnitId: string | null = null;
  if (issuanceOrderId) {
    const issuedLine = await prisma.issuanceOrderLine.findFirst({
      where: { issuanceOrderId, tenantId: scopedTenantId },
      select: { collectionUnitId: true },
    });
    continuityUnitId = issuedLine?.collectionUnitId ?? null;
  }
  const effectiveUnitId = continuityUnitId ?? input.collectionUnitId ?? null;

  // Next-container swap (#190): optionally issue the next empty container to the
  // clinic as part of this collect and point the collected unit at it. Requires a
  // collected container to hang the chain on; the next container must be a
  // different, same-tenant unit (global FK, so tenant-checked here).
  let nextUnitId: string | null = null;
  if (input.nextCollectionUnitId) {
    if (!effectiveUnitId) {
      throw new Error('cannot collect: a collected container is required to issue the next container');
    }
    if (input.nextCollectionUnitId === effectiveUnitId) {
      throw new Error('cannot collect: next container must differ from the collected container');
    }
    const nextUnit = await prisma.collectionUnit.findFirst({
      where: { id: input.nextCollectionUnitId, tenantId: scopedTenantId, deleted: false },
      select: { id: true },
    });
    if (!nextUnit) {
      throw new Error('cannot collect: next collection unit not found');
    }
    nextUnitId = nextUnit.id;
  }

  const now = new Date();
  const collectionBase = generatePrefixedId('COLL');
  const orderId = `${collectionBase}-ORD`;
  const receiptId = `${collectionBase}-RCP`;
  const hetId = generatePrefixedId('HET');
  const nextIssuanceId = nextUnitId ? `${generatePrefixedId('COLL')}-ISS` : null;

  const { receipt, nextIssuance } = await prisma.$transaction(async (tx) => {
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
        // Links this filled-container receipt back to the deliver-empty issuance
        // for round-trip continuity (null when collecting with no prior deliver).
        issuanceOrderId: issuanceOrderId ?? null,
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
        collectionUnitId: effectiveUnitId,
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
        collectionUnitId: effectiveUnitId,
        collectionReceiptLineId: line.id,
        // The collection work order is the first work order of the run, so it is
        // the HET's user (mirrors createWorkOrder's usedById claim).
        usedById: workOrderId,
        sourceSystem: 'api',
        createdById: actorId,
        updatedById: actorId,
      },
    });

    // Round-trip close: the delivered container has come back filled and is now
    // received. Only touched on the continuity path — a phase-1 direct collect
    // leaves CollectionUnit.status untouched.
    if (issuanceOrderId && effectiveUnitId) {
      await tx.collectionUnit.update({
        where: { id: effectiveUnitId },
        data: { status: UNIT_STATUS_RECEIVED, updatedById: actorId },
      });
    }

    // Next-container swap (#190): issue the next empty container to the clinic and
    // chain the collected unit → next unit. The new issuance is standalone — a
    // future run picks it up on its own deliver leg — so it is NOT linked to this
    // work order. legacyNextHetId holds the next CollectionUnit id, making the
    // unit-to-unit chain queryable (mirrors the imported swap loop).
    let nextIssuance: { id: string } | null = null;
    if (nextUnitId && nextIssuanceId && effectiveUnitId) {
      nextIssuance = await tx.issuanceOrder.create({
        data: {
          id: nextIssuanceId,
          tenantId: scopedTenantId,
          supplyEntityId: collectionPoint.supplyEntityId,
          collectionPointId: collectionPoint.id,
          issuedAt: now,
          issuedBy: actorId,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await tx.issuanceOrderLine.create({
        data: {
          tenantId: scopedTenantId,
          issuanceOrderId: nextIssuance.id,
          collectionUnitId: nextUnitId,
          parcelTrackingNumber: input.nextParcelTrackingNumber ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await tx.collectionUnit.update({
        where: { id: nextUnitId },
        data: { status: UNIT_STATUS_ISSUED, updatedById: actorId },
      });
      await tx.collectionUnit.update({
        where: { id: effectiveUnitId },
        data: { legacyNextHetId: nextUnitId, updatedById: actorId },
      });
    }

    const updated = await tx.workOrder.updateMany({
      where: { id: workOrderId, tenantId: scopedTenantId, hetId: null, collectionReceiptId: null },
      data: { hetId, collectionReceiptId: receipt.id, updatedById: actorId },
    });
    if (updated.count === 0) {
      // A concurrent collection already attached a HET/receipt; abort rather than
      // orphan the records just minted in this transaction.
      throw new Error('cannot collect: work order already has a collected HET');
    }

    return { receipt, nextIssuance };
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
    newState: { ...auditState(after), hetId, nextIssuanceOrderId: nextIssuance?.id ?? null },
  });
  await writeAuditLog({
    tenantId: scopedTenantId,
    actorId,
    entityType: 'CollectionReceipt',
    entityId: receipt.id,
    action: 'create',
    after: receipt,
    metadata: { workOrderId, hetId, collectionPointId: collectionPoint.id, issuanceOrderId: issuanceOrderId ?? null },
  });
  // The next-container issuance is a distinct procurement record, so it gets its
  // own audit trail linking the collected unit → next unit (the swap loop).
  if (nextIssuance) {
    await writeAuditLog({
      tenantId: scopedTenantId,
      actorId,
      entityType: 'IssuanceOrder',
      entityId: nextIssuance.id,
      action: 'create',
      after: nextIssuance,
      metadata: { workOrderId, collectedUnitId: effectiveUnitId, nextCollectionUnitId: nextUnitId },
    });
  }

  return getDecoratedWorkOrderOrThrow(workOrderId, scopedTenantId);
}

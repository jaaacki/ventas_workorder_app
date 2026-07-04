import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import { createWorkOrder, listCollectionQueue } from '../../services/workOrderService.js';
import { recordHetCollection, deliverEmptyContainer } from '../../services/hetCollectionService.js';
import { DEFAULT_TENANT_ID } from '../../services/tenant.js';

// The collection/logistics queue (epic #186 phase 4, #191) against the real DB.
// Drives three collection-phase runs into the three lifecycle states and asserts
// listCollectionQueue buckets each correctly. Self-contained: creates its own
// workflow + collection phase + clinic + container, cleans up afterwards. Asserts
// by membership (not exact counts) because the suite shares one DB and other tests
// may leave collection runs behind.

const ctx: {
  actorId: string;
  tenantId: string;
  workflowId: string;
  phaseIds: string[];
  supplyEntityId: string;
  collectionPointId: string;
  collectionUnitId: string;
  hetId: string;
  collectionReceiptId: string;
  collectionOrderId: string;
  issuanceOrderId: string;
  workOrderIds: string[];
} = {
  actorId: '', tenantId: DEFAULT_TENANT_ID, workflowId: '', phaseIds: [],
  supplyEntityId: '', collectionPointId: '', collectionUnitId: '', hetId: '', collectionReceiptId: '', collectionOrderId: '', issuanceOrderId: '', workOrderIds: [],
};

beforeAll(async () => {
  let actor = await prisma.staff.findFirst({});
  if (!actor) {
    actor = await prisma.staff.create({
      data: { id: `TEST-ACTOR-${Date.now().toString(36)}`, tenantId: ctx.tenantId, email: `test-${Date.now()}@example.test` },
    });
  }
  ctx.actorId = actor.id;

  const code = `TESTCQ-${Date.now().toString(36)}`;
  const workflow = await prisma.workflow.create({
    data: { tenantId: ctx.tenantId, name: 'Test Collection Queue Product', code, description: 'integration collection queue workflow', active: true },
  });
  ctx.workflowId = workflow.id;

  // A minimal two-phase workflow whose first phase is a collection phase.
  const phaseNames = ['Collection', 'Production'];
  ctx.phaseIds = [];
  for (let i = 0; i < phaseNames.length; i += 1) {
    const phaseId = `${code}:${phaseNames[i]}`;
    ctx.phaseIds.push(phaseId);
    await prisma.phase.create({
      data: {
        id: phaseId,
        tenantId: ctx.tenantId,
        workflowId: workflow.id,
        sortOrder: i,
        phaseName: phaseNames[i],
        phaseShort: phaseNames[i].slice(0, 4),
        ...(i === 0 && { processType: 'COLLECTION' }),
        keyText: phaseId,
      },
    });
  }

  ctx.supplyEntityId = `${code}:SUPPLY`;
  ctx.collectionPointId = `${code}:POINT`;
  await prisma.supplyEntity.create({
    data: { id: ctx.supplyEntityId, tenantId: ctx.tenantId, name: 'Integration Queue Clinic Group' },
  });
  await prisma.collectionPoint.create({
    data: { id: ctx.collectionPointId, tenantId: ctx.tenantId, supplyEntityId: ctx.supplyEntityId, displayName: 'Integration Queue Clinic', hciCode: 'HCI-CQ' },
  });

  ctx.collectionUnitId = `${code}:UNIT`;
  await prisma.collectionUnit.create({
    data: { id: ctx.collectionUnitId, tenantId: ctx.tenantId, supplyEntityId: ctx.supplyEntityId, collectionPointId: ctx.collectionPointId, unitNumber: 'UNIT-CQ-1', status: 'AVAILABLE' },
  });
});

afterAll(async () => {
  const woIds = ctx.workOrderIds;
  await prisma.workOrder.updateMany({ where: { id: { in: woIds } }, data: { steralisationCurrentId: null, collectionReceiptId: null, issuanceOrderId: null } }).catch(() => undefined);
  if (ctx.hetId) {
    await prisma.het.updateMany({ where: { id: ctx.hetId }, data: { usedById: null, finishedById: null } }).catch(() => undefined);
  }
  if (woIds.length) {
    await prisma.workOrderAuditEvent.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrderHet.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }).catch(() => undefined);
  }
  if (ctx.hetId) await prisma.het.deleteMany({ where: { id: ctx.hetId } }).catch(() => undefined);
  if (ctx.collectionReceiptId) await prisma.collectionReceiptLine.deleteMany({ where: { collectionReceiptId: ctx.collectionReceiptId } }).catch(() => undefined);
  if (ctx.collectionReceiptId) await prisma.collectionReceipt.deleteMany({ where: { id: ctx.collectionReceiptId } }).catch(() => undefined);
  if (ctx.collectionOrderId) await prisma.collectionOrder.deleteMany({ where: { id: ctx.collectionOrderId } }).catch(() => undefined);
  if (ctx.issuanceOrderId) await prisma.issuanceOrderLine.deleteMany({ where: { issuanceOrderId: ctx.issuanceOrderId } }).catch(() => undefined);
  if (ctx.issuanceOrderId) await prisma.issuanceOrder.deleteMany({ where: { id: ctx.issuanceOrderId } }).catch(() => undefined);
  if (ctx.collectionUnitId) await prisma.collectionUnit.deleteMany({ where: { id: ctx.collectionUnitId } }).catch(() => undefined);
  await prisma.phase.deleteMany({ where: { id: { in: ctx.phaseIds } } }).catch(() => undefined);
  await prisma.workflow.deleteMany({ where: { id: ctx.workflowId } }).catch(() => undefined);
  await prisma.collectionPoint.deleteMany({ where: { id: ctx.collectionPointId } }).catch(() => undefined);
  await prisma.supplyEntity.deleteMany({ where: { id: ctx.supplyEntityId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('collection/logistics queue (integration)', () => {
  it('buckets collection runs into awaiting, in-transit, and received', async () => {
    // awaiting: HET-less collection run, no container issued yet.
    const awaiting = await createWorkOrder({ workflowId: ctx.workflowId }, ctx.actorId);
    ctx.workOrderIds.push(awaiting.id);
    expect(awaiting.isCollectionPhase).toBe(true);
    expect(awaiting.hetId).toBeNull();

    // in-transit: an empty container has been issued out to the clinic.
    const inTransit = await createWorkOrder({ workflowId: ctx.workflowId }, ctx.actorId);
    ctx.workOrderIds.push(inTransit.id);
    const delivered = await deliverEmptyContainer(
      inTransit.id,
      { collectionPointId: ctx.collectionPointId, collectionUnitId: ctx.collectionUnitId, parcelTrackingNumber: 'TRACK-CQ-1' },
      ctx.actorId,
    );
    ctx.issuanceOrderId = delivered.issuanceOrderId!;
    expect(delivered.issuanceOrderId).not.toBeNull();
    expect(delivered.hetId).toBeNull();

    // received: a collection has minted and attached its HET (direct collect path).
    const received = await createWorkOrder({ workflowId: ctx.workflowId }, ctx.actorId);
    ctx.workOrderIds.push(received.id);
    const collected = await recordHetCollection(
      received.id,
      { collectionPointId: ctx.collectionPointId, quantity: 1, lotNumber: 'LOT-CQ-01' },
      ctx.actorId,
    );
    ctx.hetId = collected.hetId!;
    ctx.collectionReceiptId = collected.collectionReceiptId!;
    const receipt = await prisma.collectionReceipt.findUniqueOrThrow({ where: { id: ctx.collectionReceiptId } });
    ctx.collectionOrderId = receipt.collectionOrderId!;

    const queue = await listCollectionQueue(ctx.tenantId);

    const awaitingIds = queue.awaiting.map((workOrder) => workOrder.id);
    const inTransitIds = queue.inTransit.map((workOrder) => workOrder.id);
    const receivedIds = queue.received.map((workOrder) => workOrder.id);

    // Each run lands in exactly its own bucket.
    expect(awaitingIds).toContain(awaiting.id);
    expect(inTransitIds).not.toContain(awaiting.id);
    expect(receivedIds).not.toContain(awaiting.id);

    expect(inTransitIds).toContain(inTransit.id);
    expect(awaitingIds).not.toContain(inTransit.id);
    expect(receivedIds).not.toContain(inTransit.id);

    expect(receivedIds).toContain(received.id);
    expect(awaitingIds).not.toContain(received.id);
    expect(inTransitIds).not.toContain(received.id);

    // Counts stay consistent with the returned arrays.
    expect(queue.counts.awaiting).toBe(queue.awaiting.length);
    expect(queue.counts.inTransit).toBe(queue.inTransit.length);
    expect(queue.counts.received).toBe(queue.received.length);
  });
});

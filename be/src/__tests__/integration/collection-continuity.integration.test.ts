import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import { createWorkOrder } from '../../services/workOrderService.js';
import { deliverEmptyContainer, recordHetCollection } from '../../services/hetCollectionService.js';
import { DEFAULT_TENANT_ID } from '../../services/tenant.js';

// F2 regression: the collect-filled continuity lookup resolves the delivered
// container from the issuance's lines. A line soft-deleted via procurement CRUD,
// with a live re-created line on the SAME issuance, must resolve to the LIVE
// container — not the stale archived one (which would attach the receipt to the
// wrong container). Self-contained: own workflow + collection phase + clinic +
// two containers, FK-safe teardown.

const ctx: {
  actorId: string;
  tenantId: string;
  workflowId: string;
  phaseId: string;
  supplyEntityId: string;
  collectionPointId: string;
  archivedUnitId: string;
  liveUnitId: string;
  workOrderId: string;
  hetId: string;
  collectionReceiptId: string;
  collectionOrderId: string;
  issuanceOrderId: string;
} = {
  actorId: '', tenantId: DEFAULT_TENANT_ID, workflowId: '', phaseId: '',
  supplyEntityId: '', collectionPointId: '', archivedUnitId: '', liveUnitId: '',
  workOrderId: '', hetId: '', collectionReceiptId: '', collectionOrderId: '', issuanceOrderId: '',
};

beforeAll(async () => {
  let actor = await prisma.staff.findFirst({});
  if (!actor) {
    actor = await prisma.staff.create({
      data: { id: `TEST-ACTOR-${Date.now().toString(36)}`, tenantId: ctx.tenantId, email: `test-${Date.now()}@example.test` },
    });
  }
  ctx.actorId = actor.id;

  const code = `TESTCONT-${Date.now().toString(36)}`;
  const workflow = await prisma.workflow.create({
    data: { tenantId: ctx.tenantId, name: 'Test Continuity Product', code, description: 'F2 continuity workflow', active: true },
  });
  ctx.workflowId = workflow.id;

  ctx.phaseId = `${code}:Collection`;
  await prisma.phase.create({
    data: {
      id: ctx.phaseId, tenantId: ctx.tenantId, workflowId: workflow.id, sortOrder: 0,
      phaseName: 'Collection', phaseShort: 'Coll', processType: 'COLLECTION', keyText: ctx.phaseId,
    },
  });

  ctx.supplyEntityId = `${code}:SUPPLY`;
  ctx.collectionPointId = `${code}:POINT`;
  await prisma.supplyEntity.create({ data: { id: ctx.supplyEntityId, tenantId: ctx.tenantId, name: 'Continuity Clinic Group' } });
  await prisma.collectionPoint.create({
    data: { id: ctx.collectionPointId, tenantId: ctx.tenantId, supplyEntityId: ctx.supplyEntityId, displayName: 'Continuity Clinic', hciCode: 'HCI-CONT' },
  });

  ctx.archivedUnitId = `${code}:UNIT-ARCHIVED`;
  ctx.liveUnitId = `${code}:UNIT-LIVE`;
  await prisma.collectionUnit.create({
    data: { id: ctx.archivedUnitId, tenantId: ctx.tenantId, supplyEntityId: ctx.supplyEntityId, collectionPointId: ctx.collectionPointId, unitNumber: 'UNIT-ARCH', status: 'AVAILABLE' },
  });
  await prisma.collectionUnit.create({
    data: { id: ctx.liveUnitId, tenantId: ctx.tenantId, supplyEntityId: ctx.supplyEntityId, collectionPointId: ctx.collectionPointId, unitNumber: 'UNIT-LIVE', status: 'AVAILABLE' },
  });
});

afterAll(async () => {
  const woIds = ctx.workOrderId ? [ctx.workOrderId] : [];
  await prisma.workOrder.updateMany({ where: { id: { in: woIds } }, data: { collectionReceiptId: null, issuanceOrderId: null } }).catch(() => undefined);
  if (ctx.hetId) await prisma.het.updateMany({ where: { id: ctx.hetId }, data: { usedById: null, finishedById: null } }).catch(() => undefined);
  if (woIds.length) {
    await prisma.workOrderAuditEvent.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }).catch(() => undefined);
  }
  if (ctx.hetId) await prisma.het.deleteMany({ where: { id: ctx.hetId } }).catch(() => undefined);
  if (ctx.collectionReceiptId) await prisma.collectionReceiptLine.deleteMany({ where: { collectionReceiptId: ctx.collectionReceiptId } }).catch(() => undefined);
  if (ctx.collectionReceiptId) await prisma.collectionReceipt.deleteMany({ where: { id: ctx.collectionReceiptId } }).catch(() => undefined);
  if (ctx.collectionOrderId) await prisma.collectionOrder.deleteMany({ where: { id: ctx.collectionOrderId } }).catch(() => undefined);
  if (ctx.issuanceOrderId) await prisma.issuanceOrderLine.deleteMany({ where: { issuanceOrderId: ctx.issuanceOrderId } }).catch(() => undefined);
  if (ctx.issuanceOrderId) await prisma.issuanceOrder.deleteMany({ where: { id: ctx.issuanceOrderId } }).catch(() => undefined);
  await prisma.collectionUnit.deleteMany({ where: { id: { in: [ctx.archivedUnitId, ctx.liveUnitId] } } }).catch(() => undefined);
  await prisma.phase.deleteMany({ where: { id: ctx.phaseId } }).catch(() => undefined);
  await prisma.workflow.deleteMany({ where: { id: ctx.workflowId } }).catch(() => undefined);
  await prisma.collectionPoint.deleteMany({ where: { id: ctx.collectionPointId } }).catch(() => undefined);
  await prisma.supplyEntity.deleteMany({ where: { id: ctx.supplyEntityId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('HET collection continuity (integration)', () => {
  it('resolves the collect to the live issuance line, skipping a soft-deleted one (F2)', async () => {
    const created = await createWorkOrder({ workflowId: ctx.workflowId }, ctx.actorId);
    ctx.workOrderId = created.id;

    // Deliver the archived container first (this is the line that later gets soft-deleted).
    const delivered = await deliverEmptyContainer(
      created.id,
      { collectionPointId: ctx.collectionPointId, collectionUnitId: ctx.archivedUnitId },
      ctx.actorId,
    );
    ctx.issuanceOrderId = delivered.issuanceOrderId!;

    // Simulate a procurement CRUD archive + re-create: soft-delete the delivered
    // line and add a live line for a different container on the SAME issuance.
    const archivedLine = await prisma.issuanceOrderLine.findFirstOrThrow({ where: { issuanceOrderId: ctx.issuanceOrderId } });
    await prisma.issuanceOrderLine.update({
      where: { id: archivedLine.id },
      data: { deleted: true, deletedAt: new Date() },
    });
    // Ensure the live line is unambiguously newer than the archived one.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.issuanceOrderLine.create({
      data: { tenantId: ctx.tenantId, issuanceOrderId: ctx.issuanceOrderId, collectionUnitId: ctx.liveUnitId, createdById: ctx.actorId },
    });

    // Collect: the continuity lookup must skip the soft-deleted line and resolve
    // to the LIVE container.
    const collected = await recordHetCollection(
      created.id,
      { collectionPointId: ctx.collectionPointId, quantity: 1 },
      ctx.actorId,
    );
    ctx.hetId = collected.hetId!;
    ctx.collectionReceiptId = collected.collectionReceiptId!;

    const het = await prisma.het.findUniqueOrThrow({ where: { id: ctx.hetId } });
    expect(het.collectionUnitId).toBe(ctx.liveUnitId);

    const receipt = await prisma.collectionReceipt.findUniqueOrThrow({ where: { id: ctx.collectionReceiptId } });
    ctx.collectionOrderId = receipt.collectionOrderId!;
    const line = await prisma.collectionReceiptLine.findFirstOrThrow({ where: { collectionReceiptId: ctx.collectionReceiptId } });
    expect(line.collectionUnitId).toBe(ctx.liveUnitId);

    // The live container completes the round-trip; the archived one is untouched.
    const liveUnit = await prisma.collectionUnit.findUniqueOrThrow({ where: { id: ctx.liveUnitId } });
    expect(liveUnit.status).toBe('RECEIVED');
  });
});

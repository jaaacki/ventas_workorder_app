import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import {
  createWorkOrder,
  advanceWorkOrder,
  getWorkOrder,
  recordWorkOrderOutputQuantity,
  recordWorkOrderPhotoEvidence,
  recordWorkOrderRelease,
  startWorkOrderPhase,
  finishWorkOrderPhase,
} from '../../services/workOrderService.js';
import { recordHetCollection } from '../../services/hetCollectionService.js';
import { DEFAULT_TENANT_ID } from '../../services/tenant.js';

// A full HET-less collection-start run against the real DB. The workflow's first
// phase is a COLLECTION phase, so the run is created with no HET; the collection
// process mints a real HET and wires it into the run, which then carries it
// forward exactly like an imported HET. Self-contained: creates its own
// workflow + phases + clinic, cleans up afterwards.

const phaseNames = ['Collection', 'Production', 'Release'];

const ctx: {
  actorId: string;
  tenantId: string;
  workflowId: string;
  phaseIds: string[];
  supplyEntityId: string;
  collectionPointId: string;
  hetId: string;
  collectionReceiptId: string;
  collectionOrderId: string;
  workOrderIds: string[];
} = {
  actorId: '', tenantId: DEFAULT_TENANT_ID, workflowId: '', phaseIds: [],
  supplyEntityId: '', collectionPointId: '', hetId: '', collectionReceiptId: '', collectionOrderId: '', workOrderIds: [],
};

beforeAll(async () => {
  let actor = await prisma.staff.findFirst({});
  if (!actor) {
    actor = await prisma.staff.create({
      data: { id: `TEST-ACTOR-${Date.now().toString(36)}`, tenantId: ctx.tenantId, email: `test-${Date.now()}@example.test` },
    });
  }
  ctx.actorId = actor.id;

  const code = `TESTCOLL-${Date.now().toString(36)}`;
  const workflow = await prisma.workflow.create({
    data: { tenantId: ctx.tenantId, name: 'Test Collection Product', code, description: 'integration collection workflow', active: true },
  });
  ctx.workflowId = workflow.id;

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
        // The first phase is the collection phase — the HET is born here.
        ...(i === 0 && { processType: 'COLLECTION' }),
        keyText: phaseId,
      },
    });
  }

  ctx.supplyEntityId = `${code}:SUPPLY`;
  ctx.collectionPointId = `${code}:POINT`;
  await prisma.supplyEntity.create({
    data: { id: ctx.supplyEntityId, tenantId: ctx.tenantId, name: 'Integration Clinic Group' },
  });
  await prisma.collectionPoint.create({
    data: { id: ctx.collectionPointId, tenantId: ctx.tenantId, supplyEntityId: ctx.supplyEntityId, displayName: 'Integration Clinic', hciCode: 'HCI-TEST' },
  });
});

afterAll(async () => {
  const woIds = ctx.workOrderIds;
  // Break circular FKs before deleting (WorkOrder <-> Sterilise/CollectionReceipt,
  // Het <-> WorkOrder), mirroring the AmGraft integration teardown.
  await prisma.workOrder.updateMany({ where: { id: { in: woIds } }, data: { steralisationCurrentId: null, collectionReceiptId: null } }).catch(() => undefined);
  if (ctx.hetId) {
    await prisma.het.updateMany({ where: { id: ctx.hetId }, data: { usedById: null, finishedById: null } }).catch(() => undefined);
  }
  if (woIds.length) {
    await prisma.workOrderAuditEvent.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.woSerial.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrderHet.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }).catch(() => undefined);
  }
  // Het -> CollectionReceiptLine is a real FK, so delete the HET before the line.
  if (ctx.hetId) await prisma.het.deleteMany({ where: { id: ctx.hetId } }).catch(() => undefined);
  if (ctx.collectionReceiptId) await prisma.collectionReceiptLine.deleteMany({ where: { collectionReceiptId: ctx.collectionReceiptId } }).catch(() => undefined);
  if (ctx.collectionReceiptId) await prisma.collectionReceipt.deleteMany({ where: { id: ctx.collectionReceiptId } }).catch(() => undefined);
  if (ctx.collectionOrderId) await prisma.collectionOrder.deleteMany({ where: { id: ctx.collectionOrderId } }).catch(() => undefined);
  await prisma.phase.deleteMany({ where: { id: { in: ctx.phaseIds } } }).catch(() => undefined);
  await prisma.workflow.deleteMany({ where: { id: ctx.workflowId } }).catch(() => undefined);
  await prisma.collectionPoint.deleteMany({ where: { id: ctx.collectionPointId } }).catch(() => undefined);
  await prisma.supplyEntity.deleteMany({ where: { id: ctx.supplyEntityId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('HET collection run (integration)', () => {
  it('starts HET-less at a collection phase, mints a real HET on collection, and carries it forward', async () => {
    // 1. Create the run at the collection phase with NO HET.
    const created = await createWorkOrder({ workflowId: ctx.workflowId }, ctx.actorId);
    ctx.workOrderIds.push(created.id);
    expect(created.hetId).toBeNull();
    expect(created.isCollectionPhase).toBe(true);
    expect(created.readinessBlockers).toContain('Collection required');
    expect(created.readinessBlockers).not.toContain('HET not assigned');

    // A HET-less collection work order cannot start yet.
    await expect(startWorkOrderPhase(created.id, ctx.actorId)).rejects.toThrow('cannot start: HET not assigned');

    // 2. Perform HET collection: mints a real Het and attaches it + a receipt.
    const collected = await recordHetCollection(
      created.id,
      { collectionPointId: ctx.collectionPointId, quantity: 1, lotNumber: 'LOT-INTEG-01', parcelTrackingNumber: 'TRACK-INTEG-1', signatureDataUrl: 'data:image/png;base64,AAAA' },
      ctx.actorId,
    );
    expect(collected.hetId).not.toBeNull();
    expect(collected.collectionReceiptId).not.toBeNull();
    ctx.hetId = collected.hetId!;
    ctx.collectionReceiptId = collected.collectionReceiptId!;

    // A real Het row exists, minted from the collection, with all custody links.
    const het = await prisma.het.findUniqueOrThrow({ where: { id: ctx.hetId } });
    expect(het.hetNumber).toBe('LOT-INTEG-01');
    expect(het.clinicName).toBe('Integration Clinic');
    expect(het.HCICode).toBe('HCI-TEST');
    expect(het.quantity).toBe(1);
    expect(het.usedById).toBe(created.id);
    expect(het.collectionReceiptLineId).not.toBeNull();

    const receipt = await prisma.collectionReceipt.findUniqueOrThrow({ where: { id: ctx.collectionReceiptId } });
    expect(receipt.signaturePath).toBe('data:image/png;base64,AAAA');
    ctx.collectionOrderId = receipt.collectionOrderId!;

    const line = await prisma.collectionReceiptLine.findFirstOrThrow({ where: { collectionReceiptId: ctx.collectionReceiptId } });
    expect(line.resultingHetId).toBe(ctx.hetId);
    expect(het.collectionReceiptLineId).toBe(line.id);

    // The collection work order now reads as a normal (unblocked-for-collection) run.
    expect(collected.readinessBlockers).not.toContain('Collection required');

    const completeCurrentPhase = async (workOrderId: string) => {
      await startWorkOrderPhase(workOrderId, ctx.actorId);
      await finishWorkOrderPhase(workOrderId, ctx.actorId);
      await recordWorkOrderOutputQuantity(workOrderId, { outputQuantity: '1.0000' }, ctx.actorId);
      await recordWorkOrderPhotoEvidence(workOrderId, { imageDataUrl: 'data:image/png;base64,AAAA' }, ctx.actorId);
    };

    // 3. Complete the collection phase, then advance — the minted HET carries.
    await completeCurrentPhase(created.id);
    const production = await advanceWorkOrder(created.id, ctx.actorId);
    ctx.workOrderIds.push(production.id);
    expect(production.previousWoId).toBe(created.id);
    expect(production.hetId).toBe(ctx.hetId);
    expect(production.isCollectionPhase).toBe(false);
    expect(production.phase?.phaseName).toBe('Production');

    // 4. Advance through Production to Release, then record the release.
    await completeCurrentPhase(production.id);
    const release = await advanceWorkOrder(production.id, ctx.actorId);
    ctx.workOrderIds.push(release.id);
    expect(release.phase?.phaseName).toBe('Release');
    expect(release.hetId).toBe(ctx.hetId);

    await completeCurrentPhase(release.id);
    const released = await recordWorkOrderRelease(release.id, { releaseStatus: 'released' }, ctx.actorId);
    expect(released.releaseStatus).toBe('released');

    // 5. HET lifecycle closed by the chain: collection WO used it, release WO finished it.
    const hetAfterRelease = await prisma.het.findUniqueOrThrow({ where: { id: ctx.hetId } });
    expect(hetAfterRelease.usedById).toBe(created.id);
    expect(hetAfterRelease.finishedById).toBe(release.id);

    // 6. A work-order collection audit event was recorded.
    const collectionEvent = await getWorkOrder(created.id, ctx.tenantId);
    expect(collectionEvent?.hetId).toBe(ctx.hetId);
    const events = await prisma.workOrderAuditEvent.findMany({ where: { workOrderId: created.id, action: 'work_order.het_collected' } });
    expect(events).toHaveLength(1);
  });
});

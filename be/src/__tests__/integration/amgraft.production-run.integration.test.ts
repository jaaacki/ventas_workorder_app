import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import {
  createWorkOrder,
  advanceWorkOrder,
  getWorkOrder,
  recordWorkOrderEquipment,
  recordWorkOrderOutputQuantity,
  recordWorkOrderPhotoEvidence,
  recordWorkOrderRelease,
  recordWorkOrderSerial,
  startWorkOrderPhase,
  finishWorkOrderPhase,
} from '../../services/workOrderService.js';
import { generateBatchRecord } from '../../services/manufacturingService.js';
import { createSterilisation } from '../../services/sterilisationService.js';
import { DEFAULT_TENANT_ID } from '../../services/tenant.js';

// Full AmGraft-style production run against the real DB. The HET is the state
// that carries through the workflow: each phase is its own work order, chained
// via previousWoId, spawned by advancing the previous phase's work order.
// Self-contained: creates its own workflow + phases + HET, cleans up afterwards.

const phaseNames = ['Preparation', 'Production', 'Sterilisation', 'BET Verification', 'Release'];

const ctx: {
  actorId: string;
  tenantId: string;
  workflowId: string;
  phaseIds: string[];
  bomId: string;
  bomLineId: string;
  phaseEquipId: string;
  hetId: string;
  workOrderIds: string[];
} = { actorId: '', tenantId: DEFAULT_TENANT_ID, workflowId: '', phaseIds: [], bomId: '', bomLineId: '', phaseEquipId: '', hetId: '', workOrderIds: [] };

beforeAll(async () => {
  // Actor (any staff row; create a throwaway one if none exist).
  let actor = await prisma.staff.findFirst({});
  if (!actor) {
    actor = await prisma.staff.create({
      data: { id: `TEST-ACTOR-${Date.now().toString(36)}`, tenantId: ctx.tenantId, email: `test-${Date.now()}@example.test` },
    });
  }
  ctx.actorId = actor.id;

  const code = `TESTPROD-${Date.now().toString(36)}`;
  const workflow = await prisma.workflow.create({
    data: { tenantId: ctx.tenantId, name: 'Test Product', code, description: 'integration test workflow', active: true },
  });
  ctx.workflowId = workflow.id;
  ctx.bomId = `${code}:BOM`;
  ctx.bomLineId = `${code}:BOM:LINE:SERIAL`;
  ctx.phaseEquipId = `${code}:EQUIP:SEALER`;
  await prisma.bom.create({
    data: { id: ctx.bomId, tenantId: ctx.tenantId, bomName: `${code} serial BOM`, keyText: ctx.bomId },
  });
  await prisma.bomLine.create({
    data: {
      id: ctx.bomLineId,
      tenantId: ctx.tenantId,
      bomId: ctx.bomId,
      description: 'Integration serialised graft',
      quantity: '1',
      uom: 'ea',
      hasSerial: true,
      keyText: ctx.bomLineId,
    },
  });
  await prisma.phaseEquip.create({
    data: { id: ctx.phaseEquipId, tenantId: ctx.tenantId, equipId: `${code}-SEALER`, name: 'Integration heat sealer', keyText: ctx.phaseEquipId },
  });

  // Phases + ordered WorkflowPhase bindings.
  ctx.phaseIds = [];
  for (let i = 0; i < phaseNames.length; i += 1) {
    const phaseId = `${code}:${phaseNames[i]}`;
    ctx.phaseIds.push(phaseId);
    await prisma.phase.create({
      data: { id: phaseId, tenantId: ctx.tenantId, phaseName: phaseNames[i], phaseOrder: i, phaseShort: phaseNames[i].slice(0, 4), keyText: phaseId, ...(i === 0 && { bomId: ctx.bomId }) },
    });
    if (i === 0) {
      await prisma.phasePhaseEquip.create({
        data: { phaseId, phaseEquipId: ctx.phaseEquipId },
      });
    }
    await prisma.workflowPhase.create({
      data: { workflowId: workflow.id, phaseId, sortOrder: i },
    });
  }

  ctx.hetId = `${code}:HET`;
  await prisma.het.create({ data: { id: ctx.hetId, tenantId: ctx.tenantId, hetNumber: `${code}-H1`, quantity: 1 } });
});

afterAll(async () => {
  const woIds = ctx.workOrderIds;
  if (woIds.length) {
    // Break the circular FKs first: WorkOrder.steralisationCurrentId -> Sterilise
    // and Het.usedById/finishedById -> WorkOrder.
    await prisma.workOrder.updateMany({ where: { id: { in: woIds } }, data: { steralisationCurrentId: null } }).catch(() => undefined);
    await prisma.het.updateMany({ where: { id: ctx.hetId }, data: { usedById: null, finishedById: null } }).catch(() => undefined);
    await prisma.workOrderAuditEvent.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.woSerial.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.sterilise.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrderHet.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrderPhaseEquip.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }).catch(() => undefined);
  }
  await prisma.workOrderHet.deleteMany({ where: { hetId: ctx.hetId } }).catch(() => undefined);
  await prisma.workOrderPhaseEquip.deleteMany({ where: { phaseEquipId: ctx.phaseEquipId } }).catch(() => undefined);
  await prisma.het.deleteMany({ where: { id: ctx.hetId } }).catch(() => undefined);
  await prisma.workflowPhase.deleteMany({ where: { workflowId: ctx.workflowId } }).catch(() => undefined);
  await prisma.phasePhaseEquip.deleteMany({ where: { phaseEquipId: ctx.phaseEquipId } }).catch(() => undefined);
  await prisma.phase.deleteMany({ where: { id: { in: ctx.phaseIds } } }).catch(() => undefined);
  await prisma.phaseEquip.deleteMany({ where: { id: ctx.phaseEquipId } }).catch(() => undefined);
  await prisma.bomLine.deleteMany({ where: { id: ctx.bomLineId } }).catch(() => undefined);
  await prisma.bom.deleteMany({ where: { id: ctx.bomId } }).catch(() => undefined);
  await prisma.workflow.deleteMany({ where: { id: ctx.workflowId } }).catch(() => undefined);
  // Clean any batch record the run generated.
  await prisma.manufacturer.deleteMany({ where: { createdById: ctx.actorId, manuNumber: { startsWith: 'MANU-' } } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('AmGraft production run (integration)', () => {
  it('chains a new work order per phase with the HET carrying through and the sterilisation gate enforced', async () => {
    // 1. Create at the first phase (Preparation).
    const first = await createWorkOrder({ workflowId: ctx.workflowId, hetId: ctx.hetId }, ctx.actorId);
    ctx.workOrderIds.push(first.id);
    expect(first.phaseOrder).toBe(0);
    expect(first.phase?.phaseName).toBe('Preparation');
    expect(first.previousWoId).toBeNull();
    expect(first.serialRequiredCount).toBe(1);
    expect(first.serialCheckDone).toBe(false);
    expect(first.allowedEquipment).toEqual([
      expect.objectContaining({ phaseEquipId: ctx.phaseEquipId, recorded: false }),
    ]);

    // Creating the run marks the HET as in-use by its first work order.
    const hetAfterCreate = await prisma.het.findUniqueOrThrow({ where: { id: ctx.hetId } });
    expect(hetAfterCreate.usedById).toBe(first.id);

    const completeCurrentPhase = async (workOrderId: string) => {
      await startWorkOrderPhase(workOrderId, ctx.actorId);
      const finished = await finishWorkOrderPhase(workOrderId, ctx.actorId);
      expect(finished.prodDuration).not.toBeNull();
      expect(Number(finished.prodDuration)).toBeGreaterThanOrEqual(0);
      const withOutput = await recordWorkOrderOutputQuantity(workOrderId, { outputQuantity: '1.0000' }, ctx.actorId);
      expect(Number(withOutput.outputQuantity)).toBe(1);
      const withPhoto = await recordWorkOrderPhotoEvidence(
        workOrderId,
        { imageDataUrl: 'data:image/png;base64,AAAA' },
        ctx.actorId,
      );
      expect(withPhoto.imagePath).toBe('data:image/png;base64,AAAA');
      expect(withPhoto.missingAdvanceRequirements).not.toContain('Work-order image captured');
      expect(withPhoto.missingAdvanceRequirements).not.toContain('Output quantity recorded');
    };

    const advanceToNextPhase = async (workOrderId: string) => {
      const spawned = await advanceWorkOrder(workOrderId, ctx.actorId);
      ctx.workOrderIds.push(spawned.id);
      // Each phase initialization is a NEW work order carrying the same HET.
      expect(spawned.id).not.toBe(workOrderId);
      expect(spawned.previousWoId).toBe(workOrderId);
      expect(spawned.hetId).toBe(ctx.hetId);
      expect(spawned.prodStart).toBeNull();
      expect(spawned.imagePath).toBeNull();
      return spawned;
    };

    await startWorkOrderPhase(first.id, ctx.actorId);
    const serialised = await recordWorkOrderSerial(
      first.id,
      { bomRefId: ctx.bomLineId, serialNumber: `${ctx.bomLineId}:SN-001` },
      ctx.actorId,
    );
    expect(serialised.serialCheckDone).toBe(true);
    expect(serialised.requiredSerials).toEqual([
      expect.objectContaining({ bomRefId: ctx.bomLineId, serialNumber: `${ctx.bomLineId}:SN-001` }),
    ]);
    const equipped = await recordWorkOrderEquipment(first.id, { phaseEquipId: ctx.phaseEquipId }, ctx.actorId);
    expect(equipped.allowedEquipment).toEqual([
      expect.objectContaining({ phaseEquipId: ctx.phaseEquipId, recorded: true }),
    ]);

    // 2. Manufacturing batch record on the Preparation work order.
    const batch = await generateBatchRecord(first.id, ctx.actorId);
    expect(batch.manuNumber).toMatch(/^MANU-/);
    const withBatch = await getWorkOrder(first.id);
    expect(withBatch?.manuId).toBe(batch.id);
    expect(withBatch?.manuNumber).toBe(batch.manuNumber);

    // 3. Complete Preparation, then advance: Production is a NEW work order.
    await completeCurrentPhase(first.id);
    const production = await advanceToNextPhase(first.id);
    expect(production.phaseOrder).toBe(1);
    expect(production.phase?.phaseName).toBe('Production');
    // The batch record belongs to the phase that generated it; it does not carry.
    expect(production.manuId).toBeNull();

    // The completed Preparation work order keeps ALL its evidence and reads as
    // a completed chain step.
    const completedFirst = await getWorkOrder(first.id);
    expect(completedFirst?.prodEnd).not.toBeNull();
    expect(completedFirst?.imagePath).toBe('data:image/png;base64,AAAA');
    expect(Number(completedFirst?.outputQuantity)).toBe(1);
    expect(completedFirst?.nextPhaseId).toBe(ctx.phaseIds[1]);
    expect(completedFirst?.lifecycleState).toBe('Completed');
    expect(completedFirst?.legacyStateBucket).toBe('5. WO Completed');
    expect(await prisma.woSerial.count({ where: { workOrderId: first.id } })).toBe(1);
    expect(await prisma.workOrderPhaseEquip.count({ where: { workOrderId: first.id } })).toBe(1);

    // A superseded work order can no longer advance: the HET has moved on.
    await expect(advanceWorkOrder(first.id, ctx.actorId)).rejects.toThrow(/current HET\/batch phase/i);

    // 4. Advance to Sterilisation (again a new work order).
    await completeCurrentPhase(production.id);
    const sterilisation = await advanceToNextPhase(production.id);
    expect(sterilisation.phase?.phaseName).toBe('Sterilisation');

    // 5. Gate: cannot leave Sterilisation without a passing result on THIS work order.
    await completeCurrentPhase(sterilisation.id);
    await expect(advanceWorkOrder(sterilisation.id, ctx.actorId)).rejects.toThrow(/sterilisation\/BET gate/i);

    // 6. Record OUT then a passing IN against the sterilisation work order.
    await createSterilisation({ workOrderId: sterilisation.id, direction: 'OUT' }, ctx.actorId);
    await createSterilisation({ workOrderId: sterilisation.id, direction: 'IN', result: true }, ctx.actorId);

    // 7. Gate now satisfied -> BET Verification.
    const bet = await advanceToNextPhase(sterilisation.id);
    expect(bet.phase?.phaseName).toBe('BET Verification');

    // 8. BET is its own gate phase: the new work order needs its own passing result.
    await completeCurrentPhase(bet.id);
    await expect(advanceWorkOrder(bet.id, ctx.actorId)).rejects.toThrow(/sterilisation\/BET gate/i);
    await createSterilisation({ workOrderId: bet.id, direction: 'IN', result: true }, ctx.actorId);

    // 9. -> Release (final phase).
    const release = await advanceToNextPhase(bet.id);
    expect(release.phase?.phaseName).toBe('Release');

    // 10. Cannot advance past Release; record the release disposition instead.
    await completeCurrentPhase(release.id);
    await expect(advanceWorkOrder(release.id, ctx.actorId)).rejects.toThrow(
      'work order is at its final phase',
    );
    const released = await recordWorkOrderRelease(release.id, { releaseStatus: 'released' }, ctx.actorId);
    expect(released.releaseStatus).toBe('released');
    expect(released.lifecycleState).toBe('Released');

    // 11. HET lifecycle closed by the chain: first WO used it, the release WO finished it.
    const hetAfterRelease = await prisma.het.findUniqueOrThrow({ where: { id: ctx.hetId } });
    expect(hetAfterRelease.usedById).toBe(first.id);
    expect(hetAfterRelease.finishedById).toBe(release.id);

    // 12. The full chain is recorded: five work orders, one per phase, linked backward.
    expect(ctx.workOrderIds).toHaveLength(phaseNames.length);
    const chain = await prisma.workOrder.findMany({
      where: { id: { in: ctx.workOrderIds } },
      orderBy: { phaseOrder: 'asc' },
      select: { id: true, phaseOrder: true, previousWoId: true, hetId: true },
    });
    expect(chain.map((workOrder) => workOrder.hetId)).toEqual(Array(phaseNames.length).fill(ctx.hetId));
    expect(chain.map((workOrder) => workOrder.previousWoId)).toEqual([null, ...ctx.workOrderIds.slice(0, -1)]);
  });
});

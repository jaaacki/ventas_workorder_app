import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import {
  createWorkOrder,
  advanceWorkOrder,
  getWorkOrder,
  recordWorkOrderOutputQuantity,
  recordWorkOrderSerial,
  startWorkOrderPhase,
  finishWorkOrderPhase,
} from '../../services/workOrderService.js';
import { generateBatchRecord } from '../../services/manufacturingService.js';
import { createSterilisation } from '../../services/sterilisationService.js';
import { useHet, finishHet } from '../../services/hetService.js';
import { DEFAULT_TENANT_ID } from '../../services/tenant.js';

// Full AmGraft-style production run against the real DB: create -> batch record
// -> advance through phases -> sterilisation/BET gate -> release -> HET lifecycle.
// Self-contained: creates its own workflow + phases + HET, cleans up afterwards.

const phaseNames = ['Preparation', 'Production', 'Sterilisation', 'BET Verification', 'Release'];

const ctx: {
  actorId: string;
  tenantId: string;
  workflowId: string;
  phaseIds: string[];
  bomId: string;
  bomLineId: string;
  hetId: string;
  workOrderId?: string;
} = { actorId: '', tenantId: DEFAULT_TENANT_ID, workflowId: '', phaseIds: [], bomId: '', bomLineId: '', hetId: '' };

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

  // Phases + ordered WorkflowPhase bindings.
  ctx.phaseIds = [];
  for (let i = 0; i < phaseNames.length; i += 1) {
    const phaseId = `${code}:${phaseNames[i]}`;
    ctx.phaseIds.push(phaseId);
    await prisma.phase.create({
      data: { id: phaseId, tenantId: ctx.tenantId, phaseName: phaseNames[i], phaseOrder: i, phaseShort: phaseNames[i].slice(0, 4), keyText: phaseId, ...(i === 0 && { bomId: ctx.bomId }) },
    });
    await prisma.workflowPhase.create({
      data: { workflowId: workflow.id, phaseId, sortOrder: i },
    });
  }

  ctx.hetId = `${code}:HET`;
  await prisma.het.create({ data: { id: ctx.hetId, tenantId: ctx.tenantId, hetNumber: `${code}-H1`, quantity: 1 } });
});

afterAll(async () => {
  const woId = ctx.workOrderId;
  if (woId) {
    await prisma.workOrderAuditEvent.deleteMany({ where: { workOrderId: woId } }).catch(() => undefined);
    await prisma.woSerial.deleteMany({ where: { workOrderId: woId } }).catch(() => undefined);
    await prisma.sterilise.deleteMany({ where: { workOrderId: woId } }).catch(() => undefined);
    await prisma.workOrderHet.deleteMany({ where: { workOrderId: woId } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: woId } }).catch(() => undefined);
  }
  await prisma.workOrderHet.deleteMany({ where: { hetId: ctx.hetId } }).catch(() => undefined);
  await prisma.het.deleteMany({ where: { id: ctx.hetId } }).catch(() => undefined);
  await prisma.workflowPhase.deleteMany({ where: { workflowId: ctx.workflowId } }).catch(() => undefined);
  await prisma.phase.deleteMany({ where: { id: { in: ctx.phaseIds } } }).catch(() => undefined);
  await prisma.bomLine.deleteMany({ where: { id: ctx.bomLineId } }).catch(() => undefined);
  await prisma.bom.deleteMany({ where: { id: ctx.bomId } }).catch(() => undefined);
  await prisma.workflow.deleteMany({ where: { id: ctx.workflowId } }).catch(() => undefined);
  // Clean any batch record the run generated.
  await prisma.manufacturer.deleteMany({ where: { createdById: ctx.actorId, manuNumber: { startsWith: 'MANU-' } } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('AmGraft production run (integration)', () => {
  it('runs a work order through every phase with the sterilisation gate and HET lifecycle', async () => {
    // 1. Create at the first phase (Preparation).
    const wo = await createWorkOrder({ workflowId: ctx.workflowId, hetId: ctx.hetId }, ctx.actorId);
    ctx.workOrderId = wo.id;
    expect(wo.phaseOrder).toBe(0);
    expect(wo.phase?.phaseName).toBe('Preparation');
    expect(wo.serialRequiredCount).toBe(1);
    expect(wo.serialCheckDone).toBe(false);

    const serialised = await recordWorkOrderSerial(
      wo.id,
      { bomRefId: ctx.bomLineId, serialNumber: `${ctx.bomLineId}:SN-001` },
      ctx.actorId,
    );
    expect(serialised.serialCheckDone).toBe(true);
    expect(serialised.requiredSerials).toEqual([
      expect.objectContaining({ bomRefId: ctx.bomLineId, serialNumber: `${ctx.bomLineId}:SN-001` }),
    ]);

    // 2. Manufacturing batch record.
    const batch = await generateBatchRecord(wo.id, ctx.actorId);
    expect(batch.manuNumber).toMatch(/^MANU-/);
    const withBatch = await getWorkOrder(wo.id);
    expect(withBatch?.manuId).toBe(batch.id);
    expect(withBatch?.manuNumber).toBe(batch.manuNumber);

    // 3. Complete Preparation, then advance to Production.
    await startWorkOrderPhase(wo.id, ctx.actorId);
    const finishedPreparation = await finishWorkOrderPhase(wo.id, ctx.actorId);
    expect(finishedPreparation.prodDuration).not.toBeNull();
    expect(Number(finishedPreparation.prodDuration)).toBeGreaterThanOrEqual(0);
    const withOutput = await recordWorkOrderOutputQuantity(wo.id, { outputQuantity: '1.0000' }, ctx.actorId);
    expect(Number(withOutput.outputQuantity)).toBe(1);
    let cur = await advanceWorkOrder(wo.id, ctx.actorId);
    expect(cur.phaseOrder).toBe(1);
    expect(cur.phase?.phaseName).toBe('Production');

    // 4. Advance to Sterilisation.
    cur = await advanceWorkOrder(wo.id, ctx.actorId);
    expect(cur.phase?.phaseName).toBe('Sterilisation');

    // 5. Gate: cannot leave Sterilisation without a passing result.
    await expect(advanceWorkOrder(wo.id, ctx.actorId)).rejects.toThrow(/sterilisation\/BET gate/i);

    // 6. Record OUT then a passing IN.
    await createSterilisation({ workOrderId: wo.id, direction: 'OUT' }, ctx.actorId);
    await createSterilisation({ workOrderId: wo.id, direction: 'IN', result: true }, ctx.actorId);

    // 7. Gate now satisfied -> BET Verification.
    cur = await advanceWorkOrder(wo.id, ctx.actorId);
    expect(cur.phase?.phaseName).toBe('BET Verification');

    // 8. -> Release (final).
    cur = await advanceWorkOrder(wo.id, ctx.actorId);
    expect(cur.phase?.phaseName).toBe('Release');

    // 9. HET lifecycle: in-use then finished.
    const used = await useHet(ctx.hetId, { workOrderId: wo.id, actorId: ctx.actorId });
    expect(used.usedById).toBe(wo.id);
    const finished = await finishHet(ctx.hetId, { workOrderId: wo.id, actorId: ctx.actorId });
    expect(finished.finishedById).toBe(wo.id);

    // 10. Cannot advance past Release.
    await expect(advanceWorkOrder(wo.id, ctx.actorId)).rejects.toThrow(
      'work order is at its final phase',
    );
  });
});

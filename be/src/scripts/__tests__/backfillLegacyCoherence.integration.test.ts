import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import { backfillLegacyCoherence } from '../backfillLegacyCoherence.js';

// Retrofits chain coherence onto unwired legacy work orders (workflowId /
// previousWoId / nextPhaseId / releaseStatus all NULL, phases keyless, finished-
// goods lot orphaned) and asserts every work order ends up with a terminal state
// and a forward destination. Self-contained; cleans up afterwards.

const code = `TESTCOH-${Date.now().toString(36).toUpperCase()}`;
const ctx = {
  // Own tenant so the backfill's tenant-scoped orphan-attach only ever sees this
  // test's work orders, never residue from other integration files sharing the DB.
  tenantId: `TENANT-${code}`,
  workflowId: '',
  phaseIds: [] as string[],
  hetIds: [] as string[],
  woIds: [] as string[],
  lotId: `${code}:FGLOT`,
  lotNumber: `${code}-LOT`,
};

const phaseNames = ['Collection', 'Production', 'Release'];

beforeAll(async () => {
  // Dedicated tenant (tenantId is an FK) so every fixture row — and the
  // backfill's tenant-scoped orphan-attach — is isolated from other suites.
  await prisma.tenant.create({ data: { id: ctx.tenantId, slug: ctx.tenantId, name: `Test ${code}` } });

  const workflow = await prisma.workflow.create({
    data: { tenantId: ctx.tenantId, name: `Test ${code}`, code, active: true },
  });
  ctx.workflowId = workflow.id;

  for (let i = 0; i < phaseNames.length; i += 1) {
    const phaseId = `${code}:P${i + 1}`;
    ctx.phaseIds.push(phaseId);
    // Owned phases (workflowId + sortOrder). Keyless on purpose — the backfill
    // must fill keyText from phaseShort.
    await prisma.phase.create({
      data: {
        id: phaseId,
        tenantId: ctx.tenantId,
        workflowId: ctx.workflowId,
        phaseName: phaseNames[i],
        phaseShort: `P${i + 1}`,
        sortOrder: i + 1,
      },
    });
  }

  // Run A: a full run (3 phases) that reaches Release, finished, with a LOT.
  const hetFull = `${code}:HET-FULL`;
  ctx.hetIds.push(hetFull);
  await prisma.het.create({ data: { id: hetFull, tenantId: ctx.tenantId, hetNumber: `${code}-HF`, quantity: 1 } });
  const prodEnd = new Date('2026-06-01T10:00:00Z');
  for (let i = 0; i < phaseNames.length; i += 1) {
    const id = `${code}:WO-FULL-${i + 1}`;
    ctx.woIds.push(id);
    await prisma.workOrder.create({
      data: {
        id,
        tenantId: ctx.tenantId,
        woNumber: id,
        // Deliberately UNWIRED: no workflowId, no chain links, no release.
        hetId: hetFull,
        phaseId: ctx.phaseIds[i],
        phaseOrder: i + 1,
        prodStart: new Date('2026-06-01T09:00:00Z'),
        prodEnd,
        // The terminal (Release) work order carries the LOT number.
        ...(i === phaseNames.length - 1 ? { manuNumber: ctx.lotNumber } : {}),
      },
    });
  }

  // Run B: a genuinely-incomplete run — one work order, stalled at P1, no prodEnd.
  const hetStall = `${code}:HET-STALL`;
  ctx.hetIds.push(hetStall);
  await prisma.het.create({ data: { id: hetStall, tenantId: ctx.tenantId, hetNumber: `${code}-HS`, quantity: 1 } });
  const stallId = `${code}:WO-STALL`;
  ctx.woIds.push(stallId);
  await prisma.workOrder.create({
    data: {
      id: stallId, tenantId: ctx.tenantId, woNumber: stallId,
      hetId: hetStall, phaseId: ctx.phaseIds[0], phaseOrder: 1,
      prodStart: new Date('2026-06-01T09:00:00Z'), // no prodEnd -> still open
    },
  });

  // Orphaned finished-goods lot whose lotNumber matches the run's LOT (manuNumber).
  await prisma.inventoryLot.create({
    data: {
      id: ctx.lotId, tenantId: ctx.tenantId, inventoryType: 'FINISHED_GOOD',
      status: 'AVAILABLE_LEGACY', lotNumber: ctx.lotNumber,
    },
  });
});

afterAll(async () => {
  await prisma.inventoryLot.deleteMany({ where: { id: ctx.lotId } }).catch(() => undefined);
  await prisma.workOrder.updateMany({ where: { id: { in: ctx.woIds } }, data: { previousWoId: null } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: ctx.woIds } } }).catch(() => undefined);
  await prisma.het.deleteMany({ where: { id: { in: ctx.hetIds } } }).catch(() => undefined);
  await prisma.phase.deleteMany({ where: { id: { in: ctx.phaseIds } } }).catch(() => undefined);
  await prisma.workflow.deleteMany({ where: { id: ctx.workflowId } }).catch(() => undefined);
  await prisma.tenant.deleteMany({ where: { id: ctx.tenantId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('backfillLegacyCoherence (integration)', () => {
  it('wires unwired legacy runs into a coherent chain with terminal state, next destination, and LOT bridge', async () => {
    const report = await backfillLegacyCoherence({ tenantId: ctx.tenantId, workflowCode: code });

    // 1. Orphan work orders attached to the workflow (3 full + 1 stall = 4).
    expect(report.totals.ordersAttached).toBe(4);
    const attached = await prisma.workOrder.count({ where: { id: { in: ctx.woIds }, workflowId: ctx.workflowId } });
    expect(attached).toBe(4);

    // 2. Every phase a work order sits on is owned by the workflow, keyed. The
    //    phases were seeded already owned, so step 2b is a no-op safety net (0).
    expect(report.totals.phasesBound).toBe(0);
    const boundPhases = await prisma.phase.count({ where: { id: { in: ctx.phaseIds }, workflowId: ctx.workflowId } });
    expect(boundPhases).toBe(3);
    const keyed = await prisma.phase.count({ where: { id: { in: ctx.phaseIds }, keyText: { not: null } } });
    expect(keyed).toBe(3);

    // 3. Full run chain-linked: each phase points forward, back-linked to prior.
    const p1 = await prisma.workOrder.findUniqueOrThrow({ where: { id: `${code}:WO-FULL-1` } });
    const p2 = await prisma.workOrder.findUniqueOrThrow({ where: { id: `${code}:WO-FULL-2` } });
    const p3 = await prisma.workOrder.findUniqueOrThrow({ where: { id: `${code}:WO-FULL-3` } });
    expect(p1.previousWoId).toBeNull();
    expect(p1.nextPhaseId).toBe(ctx.phaseIds[1]);
    expect(p2.previousWoId).toBe(p1.id);
    expect(p2.nextPhaseId).toBe(ctx.phaseIds[2]);
    expect(p3.previousWoId).toBe(p2.id);
    expect(p3.nextPhaseId).toBeNull();

    // 4. Terminal finished run released (final phase reached, prodEnd set).
    expect(report.totals.terminalReleased).toBe(1);
    expect(p3.releaseStatus).toBe('released');

    // 5. Finished-goods lot bridged to the terminal work order by LOT number.
    expect(report.totals.finishedGoodsBridged).toBe(1);
    const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: ctx.lotId } });
    expect(lot.workOrderId).toBe(p3.id);

    // 6. The genuinely-incomplete run is surfaced (not hidden), stays open.
    expect(report.openWorkOrders).toBeGreaterThanOrEqual(1);
    const stall = await prisma.workOrder.findUniqueOrThrow({ where: { id: `${code}:WO-STALL` } });
    expect(stall.releaseStatus).toBeNull();
    expect(stall.nextPhaseId).toBeNull();

    // 7. Idempotent: a second run changes nothing.
    const rerun = await backfillLegacyCoherence({ tenantId: ctx.tenantId, workflowCode: code });
    expect(rerun.totals.ordersAttached).toBe(0);
    expect(rerun.totals.terminalReleased).toBe(0);
    expect(rerun.totals.finishedGoodsBridged).toBe(0);
    expect(rerun.totals.chainLinked).toBe(0);
  });

  it('step 2b rebinds a foreign-workflow phase that an AMG work order sits on', async () => {
    // Own tenant + workflows so this scenario never perturbs the run above.
    // Runs before the file afterAll, so the shared prisma client is still live.
    const c2 = `${code}-REBIND`;
    const t2 = `TENANT-${c2}`;
    await prisma.tenant.create({ data: { id: t2, slug: t2, name: `Test ${c2}` } });
    const amg = await prisma.workflow.create({ data: { tenantId: t2, name: `AMG ${c2}`, code: c2, active: true } });
    const foreign = await prisma.workflow.create({ data: { tenantId: t2, name: `Foreign ${c2}`, code: `${c2}-F`, active: true } });
    const phaseId = `${c2}:P`;
    // Phase owned by the FOREIGN workflow...
    await prisma.phase.create({ data: { id: phaseId, tenantId: t2, workflowId: foreign.id, phaseName: 'Stray', phaseShort: 'S1', sortOrder: 1 } });
    const hetId = `${c2}:HET`;
    await prisma.het.create({ data: { id: hetId, tenantId: t2, hetNumber: `${c2}-H`, quantity: 1 } });
    const woId = `${c2}:WO`;
    // ...but an AMG work order already sits on it (legacy incoherence).
    await prisma.workOrder.create({ data: { id: woId, tenantId: t2, woNumber: woId, workflowId: amg.id, hetId, phaseId, phaseOrder: 1 } });

    try {
      const report = await backfillLegacyCoherence({ tenantId: t2, workflowCode: c2 });
      expect(report.totals.phasesBound).toBe(1);
      const rebound = await prisma.phase.findUniqueOrThrow({ where: { id: phaseId } });
      expect(rebound.workflowId).toBe(amg.id);
    } finally {
      await prisma.workOrder.deleteMany({ where: { id: woId } }).catch(() => undefined);
      await prisma.het.deleteMany({ where: { id: hetId } }).catch(() => undefined);
      await prisma.phase.deleteMany({ where: { id: phaseId } }).catch(() => undefined);
      await prisma.workflow.deleteMany({ where: { id: { in: [amg.id, foreign.id] } } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: t2 } }).catch(() => undefined);
    }
  });
});

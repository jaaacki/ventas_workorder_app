import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import { backfillLegacyCoherence } from '../backfillLegacyCoherence.js';
import { DEFAULT_TENANT_ID } from '../../services/tenant.js';

// Retrofits chain coherence onto unwired legacy work orders (workflowId /
// previousWoId / nextPhaseId / releaseStatus all NULL, phases unbound, finished-
// goods lot orphaned) and asserts every work order ends up with a terminal state
// and a forward destination. Self-contained; cleans up afterwards.

const code = `TESTCOH-${Date.now().toString(36).toUpperCase()}`;
const ctx = {
  tenantId: DEFAULT_TENANT_ID,
  workflowId: '',
  phaseIds: [] as string[],
  hetIds: [] as string[],
  woIds: [] as string[],
  lotId: `${code}:FGLOT`,
  lotNumber: `${code}-LOT`,
};

const phaseNames = ['Collection', 'Production', 'Release'];

beforeAll(async () => {
  const workflow = await prisma.workflow.create({
    data: { tenantId: ctx.tenantId, name: `Test ${code}`, code, active: true },
  });
  ctx.workflowId = workflow.id;

  for (let i = 0; i < phaseNames.length; i += 1) {
    const phaseId = `${code}:P${i + 1}`;
    ctx.phaseIds.push(phaseId);
    // Keyless on purpose — the backfill must fill keyText from phaseShort.
    await prisma.phase.create({
      data: { id: phaseId, tenantId: ctx.tenantId, phaseName: phaseNames[i], phaseShort: `P${i + 1}`, phaseOrder: i + 1 },
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
  await prisma.workflowPhase.deleteMany({ where: { workflowId: ctx.workflowId } }).catch(() => undefined);
  await prisma.phase.deleteMany({ where: { id: { in: ctx.phaseIds } } }).catch(() => undefined);
  await prisma.workflow.deleteMany({ where: { id: ctx.workflowId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('backfillLegacyCoherence (integration)', () => {
  it('wires unwired legacy runs into a coherent chain with terminal state, next destination, and LOT bridge', async () => {
    const report = await backfillLegacyCoherence({ tenantId: ctx.tenantId, workflowCode: code });

    // 1. Orphan work orders attached to the workflow (3 full + 1 stall = 4).
    expect(report.totals.ordersAttached).toBe(4);
    const attached = await prisma.workOrder.count({ where: { id: { in: ctx.woIds }, workflowId: ctx.workflowId } });
    expect(attached).toBe(4);

    // 2. Workflow bound to exactly the phases its work orders sit on, keyed.
    const bindings = await prisma.workflowPhase.findMany({ where: { workflowId: ctx.workflowId }, orderBy: { sortOrder: 'asc' } });
    expect(bindings.map((b) => b.phaseId)).toEqual(ctx.phaseIds);
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
});

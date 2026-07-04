import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import {
  createWorkOrder,
  advanceWorkOrder,
  amendWorkOrderEvidence,
  combineHets,
  getWorkOrderRunChain,
  recordWorkOrderOutputQuantity,
  recordWorkOrderPhotoEvidence,
  recordWorkOrderSerial,
  startWorkOrderPhase,
  finishWorkOrderPhase,
} from '../../services/workOrderService.js';
import { DEFAULT_TENANT_ID } from '../../services/tenant.js';

// Execution-hardening integration coverage against the real DB (#207):
//  - the interior-work-order immutability lock rejects evidence once a work
//    order has advanced, and the admin amendment path bypasses it with an audit;
//  - the C12 combine action attaches source HETs and writes COMBINATION
//    genealogy edges anchored on the run's primary HET lot.
// Self-contained: creates its own workflow + phases + HETs + lots, cleans up.

const phaseNames = ['Combine', 'Release'];

const ctx: {
  actorId: string;
  tenantId: string;
  workflowId: string;
  phaseIds: string[];
  bomId: string;
  bomLineId: string;
  primaryHetId: string;
  primaryLotId: string;
  sourceHetIds: string[];
  sourceLotIds: string[];
  workOrderIds: string[];
} = {
  actorId: '',
  tenantId: DEFAULT_TENANT_ID,
  workflowId: '',
  phaseIds: [],
  bomId: '',
  bomLineId: '',
  primaryHetId: '',
  primaryLotId: '',
  sourceHetIds: [],
  sourceLotIds: [],
  workOrderIds: [],
};

beforeAll(async () => {
  let actor = await prisma.staff.findFirst({});
  if (!actor) {
    actor = await prisma.staff.create({
      data: { id: `TEST-ACTOR-${Date.now().toString(36)}`, tenantId: ctx.tenantId, email: `test-${Date.now()}@example.test` },
    });
  }
  ctx.actorId = actor.id;

  const code = `TESTHARD-${Date.now().toString(36)}`;
  const workflow = await prisma.workflow.create({
    data: { tenantId: ctx.tenantId, name: 'Test Hardening', code, description: 'execution-hardening integration workflow', active: true },
  });
  ctx.workflowId = workflow.id;

  ctx.bomId = `${code}:BOM`;
  ctx.bomLineId = `${code}:BOM:LINE:SERIAL`;
  await prisma.bom.create({ data: { id: ctx.bomId, tenantId: ctx.tenantId, bomName: `${code} serial BOM`, keyText: ctx.bomId } });
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

  // Two phases: a combine-allowed first phase (blocksCombine false) and a final
  // Release phase, so advancing past the first phase supersedes it.
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
        blocksCombine: false,
        keyText: phaseId,
        ...(i === 0 && { bomId: ctx.bomId }),
      },
    });
  }

  // Primary HET (carries the run) plus two source HETs to combine. Each gets a
  // raw HET inventory lot so COMBINATION genealogy edges have lots to anchor on.
  ctx.primaryHetId = `${code}:HET:PRIMARY`;
  ctx.primaryLotId = `${code}:LOT:PRIMARY`;
  await prisma.het.create({ data: { id: ctx.primaryHetId, tenantId: ctx.tenantId, hetNumber: `${code}-PRIMARY`, clinicName: 'Integration Clinic', quantity: 1 } });
  await prisma.inventoryLot.create({
    data: { id: ctx.primaryLotId, tenantId: ctx.tenantId, inventoryType: 'HET', status: 'available', lotNumber: `${code}-PRIMARY`, hetId: ctx.primaryHetId },
  });
  for (const suffix of ['S1', 'S2']) {
    const hetId = `${code}:HET:${suffix}`;
    const lotId = `${code}:LOT:${suffix}`;
    ctx.sourceHetIds.push(hetId);
    ctx.sourceLotIds.push(lotId);
    await prisma.het.create({ data: { id: hetId, tenantId: ctx.tenantId, hetNumber: `${code}-${suffix}`, clinicName: 'Integration Clinic', quantity: 1 } });
    await prisma.inventoryLot.create({
      data: { id: lotId, tenantId: ctx.tenantId, inventoryType: 'HET', status: 'available', lotNumber: `${code}-${suffix}`, hetId },
    });
  }
});

afterAll(async () => {
  const woIds = ctx.workOrderIds;
  const allLotIds = [ctx.primaryLotId, ...ctx.sourceLotIds];
  const allHetIds = [ctx.primaryHetId, ...ctx.sourceHetIds];
  await prisma.inventoryGenealogy
    .deleteMany({ where: { OR: [{ workOrderId: { in: woIds } }, { parentInventoryLotId: { in: allLotIds } }, { childInventoryLotId: { in: allLotIds } }] } })
    .catch(() => undefined);
  await prisma.inventoryLot.deleteMany({ where: { id: { in: allLotIds } } }).catch(() => undefined);
  if (woIds.length) {
    await prisma.workOrder.updateMany({ where: { id: { in: woIds } }, data: { steralisationCurrentId: null } }).catch(() => undefined);
    await prisma.het.updateMany({ where: { id: { in: allHetIds } }, data: { usedById: null, finishedById: null } }).catch(() => undefined);
    await prisma.workOrderAuditEvent.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.woSerial.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrderHet.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }).catch(() => undefined);
  }
  await prisma.workOrderHet.deleteMany({ where: { hetId: { in: allHetIds } } }).catch(() => undefined);
  await prisma.het.deleteMany({ where: { id: { in: allHetIds } } }).catch(() => undefined);
  await prisma.bomLine.deleteMany({ where: { id: ctx.bomLineId } }).catch(() => undefined);
  await prisma.bom.deleteMany({ where: { id: ctx.bomId } }).catch(() => undefined);
  await prisma.phase.deleteMany({ where: { id: { in: ctx.phaseIds } } }).catch(() => undefined);
  await prisma.workflow.deleteMany({ where: { id: ctx.workflowId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('execution hardening (integration)', () => {
  it('combines source HETs into a batch and writes COMBINATION genealogy edges', async () => {
    const wo = await createWorkOrder({ workflowId: ctx.workflowId, hetId: ctx.primaryHetId }, ctx.actorId);
    ctx.workOrderIds.push(wo.id);

    const combined = await combineHets(wo.id, ctx.sourceHetIds, ctx.actorId);
    // The combined batch visibly lists the attached source HETs, and the derived
    // combined-batch flag flips on.
    expect(combined.batchHets.map((batchHet) => batchHet.hetId).sort()).toEqual([...ctx.sourceHetIds].sort());
    expect(combined.combinedHetCheck).toBe(true);

    // A COMBINATION edge links each source HET lot -> the run's primary HET lot.
    for (const sourceLotId of ctx.sourceLotIds) {
      const edge = await prisma.inventoryGenealogy.findFirst({
        where: {
          tenantId: ctx.tenantId,
          parentInventoryLotId: sourceLotId,
          childInventoryLotId: ctx.primaryLotId,
          relationshipType: 'COMBINATION',
        },
      });
      expect(edge, `combination edge for ${sourceLotId}`).not.toBeNull();
      expect(edge?.workOrderId).toBe(wo.id);
    }

    // The combine is audited.
    expect(await prisma.workOrderAuditEvent.count({ where: { workOrderId: wo.id, action: 'work_order.hets_combined' } })).toBe(1);

    // Combining is idempotent on re-run (skipDuplicates): no duplicate rows.
    await combineHets(wo.id, ctx.sourceHetIds, ctx.actorId);
    expect(await prisma.workOrderHet.count({ where: { workOrderId: wo.id } })).toBe(ctx.sourceHetIds.length);
  });

  it('locks interior evidence after advance and allows an audited admin amendment', async () => {
    const first = ctx.workOrderIds[0];

    // Drive the first phase to advance-ready, then advance to Release.
    await startWorkOrderPhase(first, ctx.actorId);
    await recordWorkOrderSerial(first, { bomRefId: ctx.bomLineId, serialNumber: `${ctx.bomLineId}:SN-1` }, ctx.actorId);
    await finishWorkOrderPhase(first, ctx.actorId);
    await recordWorkOrderOutputQuantity(first, { outputQuantity: '1.0000' }, ctx.actorId);
    await recordWorkOrderPhotoEvidence(first, { imageDataUrl: 'data:image/png;base64,AAAA' }, ctx.actorId);
    const release = await advanceWorkOrder(first, ctx.actorId);
    ctx.workOrderIds.push(release.id);
    expect(release.previousWoId).toBe(first);

    // The now-superseded interior work order rejects further evidence.
    await expect(
      recordWorkOrderOutputQuantity(first, { outputQuantity: '2.0000' }, ctx.actorId),
    ).rejects.toThrow(/locked/i);
    await expect(
      recordWorkOrderSerial(first, { bomRefId: ctx.bomLineId, serialNumber: `${ctx.bomLineId}:SN-2` }, ctx.actorId),
    ).rejects.toThrow(/locked/i);

    // The admin amendment path bypasses the lock and records the correction with
    // both the specific evidence event and an evidence_amended marker.
    const amended = await amendWorkOrderEvidence(first, { kind: 'output-quantity', outputQuantity: '2.0000' }, ctx.actorId);
    expect(Number(amended.outputQuantity)).toBe(2);
    expect(await prisma.workOrderAuditEvent.count({ where: { workOrderId: first, action: 'work_order.evidence_amended' } })).toBe(1);

    // The run chain walks both phases in order, marking the superseded first
    // phase and the current Release phase.
    const chain = await getWorkOrderRunChain(release.id);
    expect(chain?.workOrders.map((wo) => wo.phase?.phaseName)).toEqual(phaseNames);
    expect(chain?.workOrders.find((wo) => wo.workOrderId === release.id)?.isCurrent).toBe(true);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db/prisma.js';
import { getMetricsOverview } from '../../services/metricsService.js';

// Metrics aggregate raw SQL (percentile_cont, the active-run predicate, groupBy)
// must run against real Postgres. Seeds bare work-order / lot / collection-unit
// rows under a unique throwaway tenant so numbers are deterministic and isolated
// from other integration suites sharing this DB.

const suffix = Date.now().toString(36);
const tenantId = `metrics-int-${suffix}`;
const DAY = 24 * 60 * 60 * 1000;
const id = (name: string) => `${tenantId}:${name}`;

beforeAll(async () => {
  const now = Date.now();
  // tenantId is an FK to Tenant; create the throwaway tenant first.
  await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Metrics integration tenant' } });
  const wo = (
    name: string,
    data: Record<string, unknown>,
  ) => prisma.workOrder.create({ data: { id: id(name), tenantId, ...data } });

  // Cycle time: two finished, released phase-A runs (durations 30 and 50). Being
  // released, they are excluded from WIP; their release timestamps feed throughput.
  await wo('cyc1', { phaseShort: 'A', prodEnd: new Date(now - DAY), prodDuration: '30', releaseStatus: 'released', releaseDecisionAt: new Date(now - 2 * DAY) });
  await wo('cyc2', { phaseShort: 'A', prodEnd: new Date(now - DAY), prodDuration: '50', releaseStatus: 'released', releaseDecisionAt: new Date(now - 9 * DAY) });

  // WIP: three active runs (no nextPhaseId, no releaseStatus, no HET) — A:1, B:2.
  await wo('wip1', { phaseShort: 'A' });
  await wo('wip2', { phaseShort: 'B' });
  await wo('wip3', { phaseShort: 'B' });

  // Backdate wip3's last state change so it reads as stalled (Prisma manages
  // @updatedAt on create, so set it with a raw UPDATE).
  await prisma.$executeRaw`UPDATE "workOrder" SET "updatedAt" = ${new Date(now - 20 * DAY)} WHERE "id" = ${id('wip3')}`;

  // Throughput: two minted finished-goods lots inside the window.
  await prisma.inventoryLot.create({ data: { id: id('lot1'), tenantId, inventoryType: 'FINISHED_GOOD', status: 'available', createdAt: new Date(now - 3 * DAY) } });
  await prisma.inventoryLot.create({ data: { id: id('lot2'), tenantId, inventoryType: 'FINISHED_GOOD', status: 'available', createdAt: new Date(now - 4 * DAY) } });

  // Collection pipeline: operational units by status; the hidden one is excluded.
  await prisma.collectionUnit.create({ data: { id: id('cu1'), tenantId, status: 'RECEIVED_AS_HET' } });
  await prisma.collectionUnit.create({ data: { id: id('cu2'), tenantId, status: 'RECEIVED_AS_HET' } });
  await prisma.collectionUnit.create({ data: { id: id('cu3'), tenantId, status: 'CONSUMED_IN_WORK_ORDER' } });
  await prisma.collectionUnit.create({ data: { id: id('cu4'), tenantId, status: 'RECEIVED_AS_HET', hiddenFromOperations: true } });
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { tenantId } }).catch(() => undefined);
  await prisma.inventoryLot.deleteMany({ where: { tenantId } }).catch(() => undefined);
  await prisma.collectionUnit.deleteMany({ where: { tenantId } }).catch(() => undefined);
  await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('metricsService.getMetricsOverview (integration)', () => {
  it('aggregates cycle time, WIP, throughput, stalled runs, and collection pipeline from real Postgres', async () => {
    const metrics = await getMetricsOverview({ tenantId, stalledDays: 7 });

    // Cycle time per phase: percentile_cont over [30, 50].
    expect(metrics.cycleTimeByPhase).toHaveLength(1);
    const phaseA = metrics.cycleTimeByPhase[0];
    expect(phaseA.phaseShort).toBe('A');
    expect(phaseA.count).toBe(2);
    expect(phaseA.avgMinutes).toBeCloseTo(40, 5);
    expect(phaseA.p50Minutes).toBeCloseTo(40, 5);
    expect(phaseA.p90Minutes).toBeCloseTo(48, 5);

    // WIP by phase: only active runs.
    expect(metrics.wipByPhase).toEqual([
      { phaseShort: 'A', count: 1 },
      { phaseShort: 'B', count: 2 },
    ]);

    // Throughput: 2 released runs + 2 minted lots inside the window, however the
    // week/month boundaries fall.
    const sum = (points: Array<{ released: number; lotsMinted: number }>, key: 'released' | 'lotsMinted') =>
      points.reduce((total, point) => total + point[key], 0);
    expect(sum(metrics.throughput.weekly, 'released')).toBe(2);
    expect(sum(metrics.throughput.weekly, 'lotsMinted')).toBe(2);
    expect(sum(metrics.throughput.monthly, 'released')).toBe(2);
    expect(sum(metrics.throughput.monthly, 'lotsMinted')).toBe(2);

    // Stalled: only wip3 (active + 20 days since last change).
    expect(metrics.stalledRuns).toHaveLength(1);
    expect(metrics.stalledRuns[0].id).toBe(id('wip3'));
    expect(metrics.stalledRuns[0].phaseShort).toBe('B');
    expect(metrics.stalledRuns[0].ageDays).toBeGreaterThanOrEqual(19);

    // Collection pipeline: operational units only, ordered by status.
    expect(metrics.collectionPipeline).toEqual([
      { status: 'CONSUMED_IN_WORK_ORDER', count: 1 },
      { status: 'RECEIVED_AS_HET', count: 2 },
    ]);
  });
});

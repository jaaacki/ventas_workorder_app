import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  workOrder: { findMany: vi.fn() },
  inventoryLot: { findMany: vi.fn() },
  collectionUnit: { groupBy: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: mocks,
}));

import { getMetricsOverview } from '../metricsService.js';

const tenantId = 'tenant-a';

// $queryRaw is a tagged template; branch on the literal SQL of each of the three
// raw queries (cycle time / WIP / stalled) so one mock can serve all of them.
function routeQueryRaw(cycle: unknown[], wip: unknown[], stalled: unknown[]) {
  mocks.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    if (sql.includes('percentile_cont')) return Promise.resolve(cycle);
    if (sql.includes('"updatedAt"')) return Promise.resolve(stalled);
    return Promise.resolve(wip);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routeQueryRaw([], [], []);
  mocks.workOrder.findMany.mockResolvedValue([]);
  mocks.inventoryLot.findMany.mockResolvedValue([]);
  mocks.collectionUnit.groupBy.mockResolvedValue([]);
});

describe('metricsService.getMetricsOverview', () => {
  it('maps cycle-time percentile rows and coerces counts to numbers', async () => {
    routeQueryRaw(
      [{ phaseShort: 'A', count: 12, avgMinutes: 42.5, p50Minutes: 40, p90Minutes: 61 }],
      [],
      [],
    );

    const result = await getMetricsOverview({ tenantId });

    expect(result.cycleTimeByPhase).toEqual([
      { phaseShort: 'A', count: 12, avgMinutes: 42.5, p50Minutes: 40, p90Minutes: 61 },
    ]);
  });

  it('maps WIP-by-phase and stalled runs, computing stalled age in days', async () => {
    const now = Date.now();
    const updatedAt = new Date(now - 9 * 24 * 60 * 60 * 1000);
    routeQueryRaw(
      [],
      [{ phaseShort: 'A', count: 3 }, { phaseShort: null, count: 1 }],
      [{ id: 'WO-1', woNumber: 'WO-1', phaseShort: 'C', updatedAt }],
    );

    const result = await getMetricsOverview({ tenantId, stalledDays: 5 });

    expect(result.wipByPhase).toEqual([
      { phaseShort: 'A', count: 3 },
      { phaseShort: null, count: 1 },
    ]);
    expect(result.stalledRuns).toHaveLength(1);
    expect(result.stalledRuns[0]).toMatchObject({ id: 'WO-1', phaseShort: 'C', ageDays: 9 });
    expect(result.stalledDays).toBe(5);
  });

  it('buckets throughput by ISO-Monday week and by month', async () => {
    mocks.workOrder.findMany.mockResolvedValue([
      { releaseDecisionAt: new Date('2026-06-30T12:00:00.000Z') }, // week of 2026-06-29
      { releaseDecisionAt: new Date('2026-07-01T12:00:00.000Z') }, // week of 2026-06-29
      { releaseDecisionAt: new Date('2026-07-06T12:00:00.000Z') }, // week of 2026-07-06
      { releaseDecisionAt: null },
    ]);
    mocks.inventoryLot.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-30T12:00:00.000Z') },
    ]);

    const result = await getMetricsOverview({ tenantId });

    expect(result.throughput.weekly).toEqual([
      { period: '2026-06-29', released: 2, lotsMinted: 1 },
      { period: '2026-07-06', released: 1, lotsMinted: 0 },
    ]);
    expect(result.throughput.monthly).toEqual([
      { period: '2026-06', released: 1, lotsMinted: 1 },
      { period: '2026-07', released: 2, lotsMinted: 0 },
    ]);
  });

  it('maps collection pipeline group-by counts', async () => {
    mocks.collectionUnit.groupBy.mockResolvedValue([
      { status: 'RECEIVED_AS_HET', _count: { _all: 118 } },
      { status: 'CONSUMED_IN_WORK_ORDER', _count: { _all: 22 } },
    ]);

    const result = await getMetricsOverview({ tenantId });

    expect(result.collectionPipeline).toEqual([
      { status: 'RECEIVED_AS_HET', count: 118 },
      { status: 'CONSUMED_IN_WORK_ORDER', count: 22 },
    ]);
    expect(mocks.collectionUnit.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, deleted: false, hiddenFromOperations: false } }),
    );
  });

  it('clamps the window parameters and is safe on empty data', async () => {
    const result = await getMetricsOverview({ tenantId, windowDays: 9999, stalledDays: 0 });

    expect(result.windowDays).toBe(730);
    expect(result.stalledDays).toBe(1);
    expect(result.cycleTimeByPhase).toEqual([]);
    expect(result.wipByPhase).toEqual([]);
    expect(result.throughput.weekly).toEqual([]);
    expect(result.throughput.monthly).toEqual([]);
    expect(result.stalledRuns).toEqual([]);
    expect(result.collectionPipeline).toEqual([]);
  });
});

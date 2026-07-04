import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({ prisma: mocks.prisma }));

import { getCollectionReport } from '../collectionReportService.js';

const tenantId = 'tenant-a';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('collectionReportService.getCollectionReport', () => {
  it('maps per-clinic and per-period aggregates and totals the clinic counts', async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([
        { clinicId: 'point-1', clinicName: 'Clinic A', hciCode: 'HCI-001', count: 3 },
        { clinicId: 'point-2', clinicName: 'Clinic B', hciCode: 'HCI-002', count: 2 },
      ])
      .mockResolvedValueOnce([
        { period: '2026-05', count: 2 },
        { period: '2026-06', count: 3 },
      ]);

    const report = await getCollectionReport({ tenantId, groupBy: 'month' });

    expect(report.groupBy).toBe('month');
    expect(report.total).toBe(5);
    expect(report.byClinic).toEqual([
      { clinicId: 'point-1', clinicName: 'Clinic A', hciCode: 'HCI-001', count: 3 },
      { clinicId: 'point-2', clinicName: 'Clinic B', hciCode: 'HCI-002', count: 2 },
    ]);
    expect(report.byPeriod).toEqual([
      { period: '2026-05', count: 2 },
      { period: '2026-06', count: 3 },
    ]);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('is empty-safe when no HETs match', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    const report = await getCollectionReport({ tenantId, clinicId: 'point-x', groupBy: 'week' });

    expect(report.total).toBe(0);
    expect(report.byClinic).toEqual([]);
    expect(report.byPeriod).toEqual([]);
    expect(report.clinicId).toBe('point-x');
    expect(report.groupBy).toBe('week');
  });

  it('defaults an unspecified or invalid groupBy to month', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    const report = await getCollectionReport({ tenantId });

    expect(report.groupBy).toBe('month');
  });

  it('makes the `to` bound inclusive of the whole end day (F4)', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    const to = new Date('2026-06-30T00:00:00.000Z');

    const report = await getCollectionReport({ tenantId, to });

    // The report echoes the caller's original `to` unchanged.
    expect(report.to).toEqual(to);
    // The SQL compares against the START OF THE NEXT DAY, so a HET collected any
    // time on 2026-06-30 is counted; a strict `<` on midnight would drop it.
    const boundValues = mocks.prisma.$queryRaw.mock.calls[0]![0].values as unknown[];
    const nextDay = new Date('2026-07-01T00:00:00.000Z').getTime();
    expect(boundValues.some((v) => v instanceof Date && v.getTime() === nextDay)).toBe(true);
    expect(boundValues.some((v) => v instanceof Date && v.getTime() === to.getTime())).toBe(false);
  });
});

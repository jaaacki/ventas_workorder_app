import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CycleTimePhaseMetric {
  phaseShort: string;
  count: number;
  avgMinutes: number;
  p50Minutes: number;
  p90Minutes: number;
}

export interface WipPhaseMetric {
  phaseShort: string | null;
  count: number;
}

export interface ThroughputPoint {
  period: string;
  released: number;
  lotsMinted: number;
}

export interface StalledRunMetric {
  id: string;
  woNumber: string | null;
  phaseShort: string | null;
  ageDays: number;
  updatedAt: Date;
}

export interface CollectionPipelineMetric {
  status: string;
  count: number;
}

export interface MetricsOverview {
  windowDays: number;
  stalledDays: number;
  generatedAt: Date;
  cycleTimeByPhase: CycleTimePhaseMetric[];
  wipByPhase: WipPhaseMetric[];
  throughput: { weekly: ThroughputPoint[]; monthly: ThroughputPoint[] };
  stalledRuns: StalledRunMetric[];
  collectionPipeline: CollectionPipelineMetric[];
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

// Canonical "current/active run" predicate: the tip of each HET chain that has
// not advanced (no nextPhaseId), not released, and not superseded by a
// later-phase peer on the same HET. Mirrors backfillLegacyCoherence.ts so WIP
// and stalled metrics agree with the "genuinely-open work order" definition
// even on legacy data where chain links may be partially wired.
const activeRunPredicate = (tenantId: string) => Prisma.sql`
  o."tenantId" = ${tenantId} AND o."deleted" = false
  AND o."nextPhaseId" IS NULL AND o."releaseStatus" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "workOrder" peer
    WHERE peer."hetId" = o."hetId" AND peer."phaseOrder" > o."phaseOrder" AND peer."deleted" = false
  )`;

async function cycleTimeByPhase(tenantId: string, windowCutoff: Date): Promise<CycleTimePhaseMetric[]> {
  const rows = await prisma.$queryRaw<
    Array<{ phaseShort: string; count: number; avgMinutes: number; p50Minutes: number; p90Minutes: number }>
  >`
    SELECT o."phaseShort" AS "phaseShort",
      count(*)::int AS "count",
      avg(o."prodDuration")::float8 AS "avgMinutes",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY o."prodDuration")::float8 AS "p50Minutes",
      percentile_cont(0.9) WITHIN GROUP (ORDER BY o."prodDuration")::float8 AS "p90Minutes"
    FROM "workOrder" o
    WHERE o."tenantId" = ${tenantId} AND o."deleted" = false
      AND o."phaseShort" IS NOT NULL
      AND o."prodDuration" IS NOT NULL
      AND o."prodEnd" IS NOT NULL AND o."prodEnd" >= ${windowCutoff}
    GROUP BY o."phaseShort"
    ORDER BY o."phaseShort" ASC`;
  return rows.map((row) => ({
    phaseShort: row.phaseShort,
    count: Number(row.count),
    avgMinutes: row.avgMinutes,
    p50Minutes: row.p50Minutes,
    p90Minutes: row.p90Minutes,
  }));
}

async function wipByPhase(tenantId: string): Promise<WipPhaseMetric[]> {
  const rows = await prisma.$queryRaw<Array<{ phaseShort: string | null; count: number }>>`
    SELECT o."phaseShort" AS "phaseShort", count(*)::int AS "count"
    FROM "workOrder" o
    WHERE ${activeRunPredicate(tenantId)}
    GROUP BY o."phaseShort"
    ORDER BY o."phaseShort" ASC NULLS LAST`;
  return rows.map((row) => ({ phaseShort: row.phaseShort, count: Number(row.count) }));
}

async function stalledRuns(tenantId: string, stalledCutoff: Date, now: number): Promise<StalledRunMetric[]> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; woNumber: string | null; phaseShort: string | null; updatedAt: Date }>
  >`
    SELECT o."id" AS "id", o."woNumber" AS "woNumber", o."phaseShort" AS "phaseShort", o."updatedAt" AS "updatedAt"
    FROM "workOrder" o
    WHERE ${activeRunPredicate(tenantId)}
      AND o."updatedAt" < ${stalledCutoff}
    ORDER BY o."updatedAt" ASC
    LIMIT 100`;
  return rows.map((row) => ({
    id: row.id,
    woNumber: row.woNumber,
    phaseShort: row.phaseShort,
    updatedAt: row.updatedAt,
    ageDays: Math.floor((now - new Date(row.updatedAt).getTime()) / DAY_MS),
  }));
}

async function collectionPipeline(tenantId: string): Promise<CollectionPipelineMetric[]> {
  const rows = await prisma.collectionUnit.groupBy({
    by: ['status'],
    where: { tenantId, deleted: false, hiddenFromOperations: false },
    _count: { _all: true },
    orderBy: { status: 'asc' },
  });
  return rows.map((row) => ({ status: row.status, count: row._count._all }));
}

// Week bucket = ISO Monday (UTC) as YYYY-MM-DD; month bucket = YYYY-MM. Using the
// week-start date sidesteps ISO week-number edge cases and stays sortable as a string.
function weekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - mondayOffset);
  return day.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function bucket(
  released: Date[],
  lots: Date[],
  keyOf: (date: Date) => string,
): ThroughputPoint[] {
  const points = new Map<string, ThroughputPoint>();
  const at = (period: string) => {
    let point = points.get(period);
    if (!point) {
      point = { period, released: 0, lotsMinted: 0 };
      points.set(period, point);
    }
    return point;
  };
  for (const date of released) at(keyOf(date)).released += 1;
  for (const date of lots) at(keyOf(date)).lotsMinted += 1;
  return [...points.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export async function getMetricsOverview(options: {
  tenantId?: string | null;
  windowDays?: number;
  stalledDays?: number;
}): Promise<MetricsOverview> {
  const tenantId = tenantIdOrDefault(options.tenantId);
  const windowDays = clamp(options.windowDays, 90, 1, 730);
  const stalledDays = clamp(options.stalledDays, 7, 1, 365);
  const now = Date.now();
  const windowCutoff = new Date(now - windowDays * DAY_MS);
  const stalledCutoff = new Date(now - stalledDays * DAY_MS);

  const [cycle, wip, stalled, pipeline, releasedRows, lotRows] = await Promise.all([
    cycleTimeByPhase(tenantId, windowCutoff),
    wipByPhase(tenantId),
    stalledRuns(tenantId, stalledCutoff, now),
    collectionPipeline(tenantId),
    prisma.workOrder.findMany({
      where: { tenantId, deleted: false, releaseStatus: 'released', releaseDecisionAt: { gte: windowCutoff } },
      select: { releaseDecisionAt: true },
    }),
    prisma.inventoryLot.findMany({
      where: { tenantId, deleted: false, inventoryType: 'FINISHED_GOOD', createdAt: { gte: windowCutoff } },
      select: { createdAt: true },
    }),
  ]);

  const releasedDates = releasedRows
    .map((row) => row.releaseDecisionAt)
    .filter((value): value is Date => value != null);
  const lotDates = lotRows.map((row) => row.createdAt);

  return {
    windowDays,
    stalledDays,
    generatedAt: new Date(now),
    cycleTimeByPhase: cycle,
    wipByPhase: wip,
    throughput: {
      weekly: bucket(releasedDates, lotDates, weekKey),
      monthly: bucket(releasedDates, lotDates, monthKey),
    },
    stalledRuns: stalled,
    collectionPipeline: pipeline,
  };
}

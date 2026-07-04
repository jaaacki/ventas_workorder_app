import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

export type CollectionReportGroupBy = 'week' | 'month';

export interface CollectionReportClinic {
  clinicId: string | null;
  clinicName: string | null;
  hciCode: string | null;
  count: number;
}

export interface CollectionReportPeriod {
  period: string;
  count: number;
}

export interface CollectionReport {
  from: Date | null;
  to: Date | null;
  clinicId: string | null;
  groupBy: CollectionReportGroupBy;
  generatedAt: Date;
  total: number;
  byClinic: CollectionReportClinic[];
  byPeriod: CollectionReportPeriod[];
}

// A "collection" is one minted/collected HET. Het.clinicId/clinicName/HCICode are
// denormalised on the HET (recordHetCollection sets them from the collection
// point; imported HETs carry the legacy clinic), so per-clinic grouping needs no
// fragile join. createdAt is the collection timestamp for live-minted HETs;
// imported HETs use import time.
// ponytail: createdAt is the collection-date proxy; a dedicated collectedAt column
// is a follow-up if imported-HET period accuracy ever matters.
export async function getCollectionReport(options: {
  tenantId?: string | null;
  clinicId?: string | null;
  from?: Date | null;
  to?: Date | null;
  groupBy?: CollectionReportGroupBy;
}): Promise<CollectionReport> {
  const tenantId = tenantIdOrDefault(options.tenantId);
  const clinicId = options.clinicId ?? null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const groupBy: CollectionReportGroupBy = options.groupBy === 'week' ? 'week' : 'month';
  const truncUnit = groupBy === 'week' ? 'week' : 'month';
  const periodFormat = groupBy === 'week' ? 'YYYY-MM-DD' : 'YYYY-MM';

  const conditions: Prisma.Sql[] = [
    Prisma.sql`h."tenantId" = ${tenantId}`,
    Prisma.sql`h."deleted" = false`,
  ];
  if (from) conditions.push(Prisma.sql`h."createdAt" >= ${from}`);
  if (to) conditions.push(Prisma.sql`h."createdAt" < ${to}`);
  if (clinicId) conditions.push(Prisma.sql`h."clinicId" = ${clinicId}`);
  const where = Prisma.join(conditions, ' AND ');

  const [byClinicRows, byPeriodRows] = await Promise.all([
    prisma.$queryRaw<Array<{ clinicId: string | null; clinicName: string | null; hciCode: string | null; count: number }>>(
      Prisma.sql`
        SELECT h."clinicId" AS "clinicId", h."clinicName" AS "clinicName", h."HCICode" AS "hciCode", count(*)::int AS "count"
        FROM "het" h
        WHERE ${where}
        GROUP BY h."clinicId", h."clinicName", h."HCICode"
        ORDER BY count(*) DESC, h."clinicName" ASC NULLS LAST`,
    ),
    prisma.$queryRaw<Array<{ period: string; count: number }>>(
      // GROUP BY/ORDER BY the output ordinal (the formatted period): Prisma binds
      // each ${} as a distinct parameter, so repeating date_trunc(${truncUnit}, …)
      // in GROUP BY would be a different param node and Postgres would reject it.
      Prisma.sql`
        SELECT to_char(date_trunc(${truncUnit}, h."createdAt"), ${periodFormat}) AS "period", count(*)::int AS "count"
        FROM "het" h
        WHERE ${where}
        GROUP BY 1
        ORDER BY 1 ASC`,
    ),
  ]);

  const byClinic = byClinicRows.map((row) => ({
    clinicId: row.clinicId,
    clinicName: row.clinicName,
    hciCode: row.hciCode,
    count: Number(row.count),
  }));
  const byPeriod = byPeriodRows.map((row) => ({ period: row.period, count: Number(row.count) }));
  const total = byClinic.reduce((sum, row) => sum + row.count, 0);

  return { from, to, clinicId, groupBy, generatedAt: new Date(), total, byClinic, byPeriod };
}

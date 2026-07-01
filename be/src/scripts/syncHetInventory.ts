import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { DEFAULT_TENANT_ID, tenantIdOrDefault } from '../services/tenant.js';

interface HetInventorySyncReport {
  startedAt: string;
  finishedAt?: string;
  tenantId: string;
  dryRun: boolean;
  totals: {
    hetsRead: number;
    lotsUpserted: number;
    consumptionsUpserted: number;
    skippedNoWorkOrder: number;
  };
  warnings: Array<{ row?: string; reason: string }>;
}

function arg(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function statusForHet(het: {
  usedById: string | null;
  finishedById: string | null;
  collectionUnit: { status: string; hiddenFromOperations: boolean } | null;
}) {
  if (het.collectionUnit?.hiddenFromOperations) return 'PLACEHOLDER_FOR_PARITY';
  if (het.finishedById) return 'CONSUMED_IN_WORK_ORDER';
  if (het.usedById) return 'IN_PROCESS_LEGACY';
  return het.collectionUnit?.status ?? 'AVAILABLE_LEGACY';
}

async function writeOrCount<T>(dryRun: boolean, write: () => Promise<T>) {
  if (dryRun) return undefined;
  return write();
}

export async function syncHetInventory(options: {
  tenantId?: string | null;
  dryRun?: boolean;
}) {
  const tenantId = tenantIdOrDefault(options.tenantId);
  const dryRun = Boolean(options.dryRun);
  const report: HetInventorySyncReport = {
    startedAt: new Date().toISOString(),
    tenantId,
    dryRun,
    totals: {
      hetsRead: 0,
      lotsUpserted: 0,
      consumptionsUpserted: 0,
      skippedNoWorkOrder: 0,
    },
    warnings: [],
  };

  const hets = await prisma.het.findMany({
    where: { tenantId, deleted: false },
    include: {
      collectionUnit: true,
      workOrderHets: { select: { workOrderId: true } },
    },
    orderBy: { id: 'asc' },
  });
  report.totals.hetsRead = hets.length;

  for (const het of hets) {
    const lotId = `inv-het:${het.id}`;
    await writeOrCount(dryRun, () =>
      prisma.inventoryLot.upsert({
        where: { id: lotId },
        update: {
          tenantId,
          inventoryType: 'HET',
          status: statusForHet(het),
          lotNumber: het.hetNumber,
          collectionUnitId: het.collectionUnitId,
          hetId: het.id,
          sourceSystem: het.sourceSystem ?? 'BOM_WO_HET_BRIDGE',
          legacyHetId: het.id,
          legacyRaw: {
            hetId: het.id,
            hetNumber: het.hetNumber,
            collectionUnitId: het.collectionUnitId,
            usedById: het.usedById,
            finishedById: het.finishedById,
          },
        },
        create: {
          id: lotId,
          tenantId,
          inventoryType: 'HET',
          status: statusForHet(het),
          lotNumber: het.hetNumber,
          collectionUnitId: het.collectionUnitId,
          hetId: het.id,
          sourceSystem: het.sourceSystem ?? 'BOM_WO_HET_BRIDGE',
          legacyHetId: het.id,
          legacyRaw: {
            hetId: het.id,
            hetNumber: het.hetNumber,
            collectionUnitId: het.collectionUnitId,
            usedById: het.usedById,
            finishedById: het.finishedById,
          },
        },
      }),
    );
    report.totals.lotsUpserted++;

    const workOrderIds = new Set<string>([
      ...(het.usedById ? [het.usedById] : []),
      ...(het.finishedById ? [het.finishedById] : []),
      ...het.workOrderHets.map((row) => row.workOrderId),
    ]);
    if (workOrderIds.size === 0) {
      report.totals.skippedNoWorkOrder++;
      continue;
    }
    for (const workOrderId of workOrderIds) {
      const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        select: { id: true },
      });
      if (!workOrder) {
        report.warnings.push({ row: het.id, reason: `HET references missing work order ${workOrderId}` });
        continue;
      }
      await writeOrCount(dryRun, () =>
        prisma.workOrderInventoryConsumption.upsert({
          where: { id: `wo-inv:${workOrderId}:${het.id}` },
          update: {
            tenantId,
            workOrderId,
            inventoryLotId: lotId,
            quantity: het.quantity ?? 1,
            uom: 'HET',
            sourceSystem: 'HET_WORKORDER_BRIDGE',
            legacyRaw: { hetId: het.id, workOrderId },
          },
          create: {
            id: `wo-inv:${workOrderId}:${het.id}`,
            tenantId,
            workOrderId,
            inventoryLotId: lotId,
            quantity: het.quantity ?? 1,
            uom: 'HET',
            sourceSystem: 'HET_WORKORDER_BRIDGE',
            legacyRaw: { hetId: het.id, workOrderId },
          },
        }),
      );
      report.totals.consumptionsUpserted++;
    }
  }

  report.finishedAt = new Date().toISOString();
  if (!dryRun) {
    await prisma.inventoryImportReport.create({
      data: {
        tenantId,
        source: 'HET_WORKORDER_BRIDGE',
        dryRun,
        startedAt: new Date(report.startedAt),
        finishedAt: new Date(report.finishedAt),
        report: report as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncHetInventory({
    tenantId: arg('tenant-id', DEFAULT_TENANT_ID),
    dryRun: flag('dry-run'),
  })
    .then((report) => {
      console.table(report.totals);
      if (report.warnings.length) console.warn(`Warnings: ${report.warnings.length}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

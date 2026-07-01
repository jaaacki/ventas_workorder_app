import fs from 'node:fs';
import path from 'node:path';
import csv from 'csv-parser';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { DEFAULT_TENANT_ID, tenantIdOrDefault } from '../services/tenant.js';

type Row = Record<string, string | undefined>;

interface ProcurementImportReport {
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  sourceDir: string;
  tenantId: string;
  totals: {
    clinicRows: number;
    deliverCollectRows: number;
    hetRows: number;
    supplyEntities: number;
    collectionPoints: number;
    collectionUnits: number;
    issuanceOrders: number;
    collectionOrders: number;
    collectionReceipts: number;
    placeholderUnits: number;
    hetLinks: number;
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

function text(row: Row, keys: string[]) {
  for (const key of keys) {
    const exact = row[key];
    if (exact !== undefined && exact.trim() !== '') return exact.trim();
    const actual = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (actual && row[actual] !== undefined && row[actual]!.trim() !== '') return row[actual]!.trim();
  }
  return undefined;
}

function dateValue(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function legacyDateValue(value: string | undefined) {
  if (!value) return undefined;
  const direct = dateValue(value);
  if (direct) return direct;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (!m) return undefined;
  const [, mo, da, yr, hh = '0', mm = '0', ss = '0', ampm] = m;
  let h = parseInt(hh, 10);
  if (ampm) {
    const pm = ampm.toUpperCase() === 'PM';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  const parsed = new Date(
    parseInt(yr, 10),
    parseInt(mo, 10) - 1,
    parseInt(da, 10),
    h,
    parseInt(mm, 10),
    parseInt(ss, 10),
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function stableId(prefix: string, value: string) {
  return `${prefix}:${value.replace(/[^a-zA-Z0-9_.:-]+/g, '_')}`;
}

async function readCsv(filePath: string): Promise<Row[]> {
  if (!fs.existsSync(filePath)) return [];
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row: Row) => rows.push(row))
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

async function writeOrCount<T>(dryRun: boolean, write: () => Promise<T>) {
  if (dryRun) return undefined;
  return write();
}

async function ensureSupplyAndPoint(input: {
  tenantId: string;
  clinicId: string;
  row?: Row;
  dryRun: boolean;
}) {
  const supplyEntityId = stableId('supply', input.clinicId);
  const collectionPointId = stableId('point', input.clinicId);
  const row = input.row ?? {};
  await writeOrCount(input.dryRun, () =>
    prisma.supplyEntity.upsert({
      where: { id: supplyEntityId },
      update: {
        tenantId: input.tenantId,
        name: text(row, ['clinicName', 'name', 'Clinic Name']) ?? `Legacy clinic ${input.clinicId}`,
        legalName: text(row, ['licenseName', 'License Name']),
        externalCode: text(row, ['HCICode', 'hciCode']),
        sourceSystem: 'HETDeliveryReturnRecords',
        legacyClinicId: input.clinicId,
        legacyGroupKey: input.clinicId,
      },
      create: {
        id: supplyEntityId,
        tenantId: input.tenantId,
        name: text(row, ['clinicName', 'name', 'Clinic Name']) ?? `Legacy clinic ${input.clinicId}`,
        legalName: text(row, ['licenseName', 'License Name']),
        externalCode: text(row, ['HCICode', 'hciCode']),
        sourceSystem: 'HETDeliveryReturnRecords',
        legacyClinicId: input.clinicId,
        legacyGroupKey: input.clinicId,
      },
    }),
  );
  await writeOrCount(input.dryRun, () =>
    prisma.collectionPoint.upsert({
      where: { id: collectionPointId },
      update: {
        tenantId: input.tenantId,
        supplyEntityId,
        legacyClinicId: input.clinicId,
        hciCode: text(row, ['HCICode', 'hciCode']),
        displayName: text(row, ['clinicName', 'name', 'Clinic Name']) ?? `Legacy clinic ${input.clinicId}`,
        licenseName: text(row, ['licenseName', 'License Name']),
        address: text(row, ['address', 'Address']),
        postalCode: text(row, ['postalCode', 'Postal Code']),
        telephone: text(row, ['telephone', 'phone', 'Tel']),
        personInCharge: text(row, ['personInCharge', 'PIC']),
      },
      create: {
        id: collectionPointId,
        tenantId: input.tenantId,
        supplyEntityId,
        legacyClinicId: input.clinicId,
        hciCode: text(row, ['HCICode', 'hciCode']),
        displayName: text(row, ['clinicName', 'name', 'Clinic Name']) ?? `Legacy clinic ${input.clinicId}`,
        licenseName: text(row, ['licenseName', 'License Name']),
        address: text(row, ['address', 'Address']),
        postalCode: text(row, ['postalCode', 'Postal Code']),
        telephone: text(row, ['telephone', 'phone', 'Tel']),
        personInCharge: text(row, ['personInCharge', 'PIC']),
      },
    }),
  );
  return { supplyEntityId, collectionPointId };
}

export async function importProcurementLegacy(options: {
  sourceDir: string;
  tenantId?: string | null;
  dryRun?: boolean;
}) {
  const tenantId = tenantIdOrDefault(options.tenantId);
  const dryRun = Boolean(options.dryRun);
  const report: ProcurementImportReport = {
    startedAt: new Date().toISOString(),
    dryRun,
    sourceDir: options.sourceDir,
    tenantId,
    totals: {
      clinicRows: 0,
      deliverCollectRows: 0,
      hetRows: 0,
      supplyEntities: 0,
      collectionPoints: 0,
      collectionUnits: 0,
      issuanceOrders: 0,
      collectionOrders: 0,
      collectionReceipts: 0,
      placeholderUnits: 0,
      hetLinks: 0,
    },
    warnings: [],
  };

  const clinicRows = await readCsv(path.join(options.sourceDir, 'clinicDb.csv'));
  const deliverCollectRows = await readCsv(path.join(options.sourceDir, 'deliverCollect.csv'));
  const hetRows = await readCsv(path.join(options.sourceDir, 'HETLot_TODEL.csv'));
  report.totals.clinicRows = clinicRows.length;
  report.totals.deliverCollectRows = deliverCollectRows.length;
  report.totals.hetRows = hetRows.length;

  const clinicById = new Map<string, Row>();
  for (const row of clinicRows) {
    const clinicId = text(row, ['clinicId', 'clinicDbId', 'id', '_RowNumber']);
    if (!clinicId) {
      report.warnings.push({ reason: 'clinic row missing stable clinic id' });
      continue;
    }
    clinicById.set(clinicId, row);
    await ensureSupplyAndPoint({ tenantId, clinicId, row, dryRun });
    report.totals.supplyEntities++;
    report.totals.collectionPoints++;
  }

  const hetById = new Map<string, Row>();
  for (const row of hetRows) {
    const hetId = text(row, ['hetId', 'HETId', 'id', '_RowNumber']);
    if (!hetId) {
      report.warnings.push({ reason: 'HET row missing stable het id' });
      continue;
    }
    hetById.set(hetId, row);
    const clinicId = text(row, ['clinicId', 'clinicDbId']);
    const unitId = stableId('unit', hetId);
    const clinicRef = clinicId
      ? await ensureSupplyAndPoint({ tenantId, clinicId, row: clinicById.get(clinicId), dryRun })
      : undefined;
    const supplyEntityId = clinicRef?.supplyEntityId;
    const collectionPointId = clinicRef?.collectionPointId;
    await writeOrCount(dryRun, () =>
      prisma.collectionUnit.upsert({
        where: { id: unitId },
        update: {
          tenantId,
          supplyEntityId,
          collectionPointId,
          legacyHetId: hetId,
          unitNumber: text(row, ['hetNumber', 'HETNo', 'HET Number']),
          parcelTrackingNumber: text(row, ['parcelTrackingNumber', 'trackingNumber']),
          status: text(row, ['usedBy', 'usedById']) ? 'CONSUMED_IN_WORK_ORDER' : 'RECEIVED_AS_HET',
          legacyDeliverId: text(row, ['deliverId']),
          legacyCollectId: text(row, ['collectId']),
          legacyUsedByWorkOrderId: text(row, ['usedBy', 'usedById']),
          legacyNextHetId: text(row, ['nextHetId']),
          sourceSystem: 'HETDeliveryReturnRecords',
          linkCompleteness: clinicId ? 'CLINIC_AND_HET' : 'HET_ONLY',
          semanticConfidence: 'LEGACY_DIRECT',
          legacyRaw: row,
        },
        create: {
          id: unitId,
          tenantId,
          supplyEntityId,
          collectionPointId,
          legacyHetId: hetId,
          unitNumber: text(row, ['hetNumber', 'HETNo', 'HET Number']),
          parcelTrackingNumber: text(row, ['parcelTrackingNumber', 'trackingNumber']),
          status: text(row, ['usedBy', 'usedById']) ? 'CONSUMED_IN_WORK_ORDER' : 'RECEIVED_AS_HET',
          legacyDeliverId: text(row, ['deliverId']),
          legacyCollectId: text(row, ['collectId']),
          legacyUsedByWorkOrderId: text(row, ['usedBy', 'usedById']),
          legacyNextHetId: text(row, ['nextHetId']),
          sourceSystem: 'HETDeliveryReturnRecords',
          linkCompleteness: clinicId ? 'CLINIC_AND_HET' : 'HET_ONLY',
          semanticConfidence: 'LEGACY_DIRECT',
          legacyRaw: row,
        },
      }),
    );
    report.totals.collectionUnits++;
    const hetUpdateCount = dryRun
      ? await prisma.het.count({ where: { id: hetId, tenantId } })
      : (await prisma.het.updateMany({
        where: { id: hetId, tenantId },
        data: {
          collectionUnitId: unitId,
          sourceSystem: 'HETDeliveryReturnRecords',
          legacyClinicId: clinicId,
          legacyDeliverId: text(row, ['deliverId']),
          legacyCollectId: text(row, ['collectId']),
        },
      })).count;
    report.totals.hetLinks += hetUpdateCount;
  }

  for (const row of deliverCollectRows) {
    const eventId = text(row, ['deliverCollectId', 'id', '_RowNumber']);
    const direction = text(row, ['direction', 'Direction', 'type'])?.toUpperCase();
    if (!eventId || !direction) {
      report.warnings.push({ row: eventId, reason: 'deliverCollect row missing id or direction' });
      continue;
    }
    const clinicId = text(row, ['clinicId', 'clinicDbId']);
    const clinicRef = clinicId
      ? await ensureSupplyAndPoint({ tenantId, clinicId, row: clinicById.get(clinicId), dryRun })
      : undefined;
    const supplyEntityId = clinicRef?.supplyEntityId;
    const collectionPointId = clinicRef?.collectionPointId;
    const hetId = text(row, ['hetId', 'HETId']);
    const unitId = hetId ? stableId('unit', hetId) : stableId('unit-event', eventId);
    if (direction === 'DELIVER') {
      const issuanceId = stableId('issuance', eventId);
      if (!hetId || !hetById.has(hetId)) {
        await writeOrCount(dryRun, () =>
          prisma.collectionUnit.upsert({
            where: { id: unitId },
            update: {
              tenantId,
              supplyEntityId,
              collectionPointId,
              status: 'ISSUED_TO_SUPPLIER_LEGACY',
              legacyHetId: hetId,
              legacyDeliverId: eventId,
              sourceSystem: 'HETDeliveryReturnRecords',
              linkCompleteness: clinicId ? 'CLINIC_AND_ISSUANCE' : 'ISSUANCE_ONLY',
              semanticConfidence: 'INFERRED_FROM_LEGACY_DELIVER',
              legacyRaw: row,
            },
            create: {
              id: unitId,
              tenantId,
              supplyEntityId,
              collectionPointId,
              status: 'ISSUED_TO_SUPPLIER_LEGACY',
              legacyHetId: hetId,
              legacyDeliverId: eventId,
              sourceSystem: 'HETDeliveryReturnRecords',
              linkCompleteness: clinicId ? 'CLINIC_AND_ISSUANCE' : 'ISSUANCE_ONLY',
              semanticConfidence: 'INFERRED_FROM_LEGACY_DELIVER',
              legacyRaw: row,
            },
          }),
        );
        report.totals.collectionUnits++;
      }
      await writeOrCount(dryRun, () =>
        prisma.issuanceOrder.upsert({
          where: { id: issuanceId },
          update: {
            tenantId,
            supplyEntityId,
            collectionPointId,
            issuedAt: legacyDateValue(text(row, ['date', 'createdOn', 'timestamp'])),
            issuedBy: text(row, ['createdBy', 'issuedBy']),
            legacyDeliverCollectId: eventId,
            legacyDirection: direction,
            semanticConfidence: 'INFERRED_FROM_LEGACY_DELIVER',
            level: text(row, ['level']),
            remarks: text(row, ['remarks', 'comment']),
            legacyRaw: row,
          },
          create: {
            id: issuanceId,
            tenantId,
            supplyEntityId,
            collectionPointId,
            issuedAt: legacyDateValue(text(row, ['date', 'createdOn', 'timestamp'])),
            issuedBy: text(row, ['createdBy', 'issuedBy']),
            legacyDeliverCollectId: eventId,
            legacyDirection: direction,
            semanticConfidence: 'INFERRED_FROM_LEGACY_DELIVER',
            level: text(row, ['level']),
            remarks: text(row, ['remarks', 'comment']),
            legacyRaw: row,
          },
        }),
      );
      report.totals.issuanceOrders++;
      await writeOrCount(dryRun, () =>
        prisma.issuanceOrderLine.upsert({
          where: { id: stableId('issuance-line', `${eventId}:${hetId ?? 'unknown'}`) },
          update: {
            tenantId,
            issuanceOrderId: issuanceId,
            collectionUnitId: unitId,
            legacyHetId: hetId,
            legacyHetNumber: text(row, ['hetNumber', 'HETNo']),
            parcelTrackingNumber: text(row, ['parcelTrackingNumber', 'trackingNumber']),
          },
          create: {
            id: stableId('issuance-line', `${eventId}:${hetId ?? 'unknown'}`),
            tenantId,
            issuanceOrderId: issuanceId,
            collectionUnitId: unitId,
            legacyHetId: hetId,
            legacyHetNumber: text(row, ['hetNumber', 'HETNo']),
            parcelTrackingNumber: text(row, ['parcelTrackingNumber', 'trackingNumber']),
          },
        }),
      );
    } else if (direction === 'COLLECT') {
      const orderId = stableId('collection-order', eventId);
      const receiptId = stableId('collection-receipt', eventId);
      const receiptLineId = stableId('collection-receipt-line', `${eventId}:${hetId ?? 'unknown'}`);
      await writeOrCount(dryRun, () =>
        prisma.collectionOrder.upsert({
          where: { id: orderId },
          update: {
            tenantId,
            supplyEntityId,
            collectionPointId,
            requestedAt: legacyDateValue(text(row, ['date', 'createdOn', 'timestamp'])),
            status: 'RECEIVED_LEGACY',
            legacyCollectDeliverCollectId: eventId,
            legacyDirection: direction,
            semanticConfidence: 'LEGACY_CONFLATED_ORDER_RECEIPT',
            legacyConflatedOrderReceipt: true,
            level: text(row, ['level']),
            remarks: text(row, ['remarks', 'comment']),
            legacyRaw: row,
          },
          create: {
            id: orderId,
            tenantId,
            supplyEntityId,
            collectionPointId,
            requestedAt: legacyDateValue(text(row, ['date', 'createdOn', 'timestamp'])),
            status: 'RECEIVED_LEGACY',
            legacyCollectDeliverCollectId: eventId,
            legacyDirection: direction,
            semanticConfidence: 'LEGACY_CONFLATED_ORDER_RECEIPT',
            legacyConflatedOrderReceipt: true,
            level: text(row, ['level']),
            remarks: text(row, ['remarks', 'comment']),
            legacyRaw: row,
          },
        }),
      );
      report.totals.collectionOrders++;
      await writeOrCount(dryRun, () =>
        prisma.collectionReceipt.upsert({
          where: { id: receiptId },
          update: {
            tenantId,
            collectionOrderId: orderId,
            receivedAt: legacyDateValue(text(row, ['date', 'createdOn', 'timestamp'])),
            receivedBy: text(row, ['createdBy', 'receivedBy']),
            remarks: text(row, ['remarks', 'comment']),
            legacyCollectDeliverCollectId: eventId,
            legacyConflatedOrderReceipt: true,
            acceptanceState: 'ACCEPTED_LEGACY',
            legacyRaw: row,
          },
          create: {
            id: receiptId,
            tenantId,
            collectionOrderId: orderId,
            receivedAt: legacyDateValue(text(row, ['date', 'createdOn', 'timestamp'])),
            receivedBy: text(row, ['createdBy', 'receivedBy']),
            remarks: text(row, ['remarks', 'comment']),
            legacyCollectDeliverCollectId: eventId,
            legacyConflatedOrderReceipt: true,
            acceptanceState: 'ACCEPTED_LEGACY',
            legacyRaw: row,
          },
        }),
      );
      await writeOrCount(dryRun, () =>
        prisma.collectionReceiptLine.upsert({
          where: { id: receiptLineId },
          update: {
            tenantId,
            collectionReceiptId: receiptId,
            collectionUnitId: hetId ? unitId : undefined,
            conditionStatus: 'LEGACY_NOT_RECORDED',
            acceptanceStatus: 'ACCEPTED_LEGACY',
            resultingHetId: hetId,
          },
          create: {
            id: receiptLineId,
            tenantId,
            collectionReceiptId: receiptId,
            collectionUnitId: hetId ? unitId : undefined,
            conditionStatus: 'LEGACY_NOT_RECORDED',
            acceptanceStatus: 'ACCEPTED_LEGACY',
            resultingHetId: hetId,
          },
        }),
      );
      if (hetId) {
        await writeOrCount(dryRun, () =>
          prisma.het.updateMany({
            where: { id: hetId, tenantId },
            data: { collectionReceiptLineId: receiptLineId, legacyCollectId: eventId },
          }),
        );
      }
      report.totals.collectionReceipts++;
    } else {
      report.warnings.push({ row: eventId, reason: `unknown direction ${direction}` });
    }
  }

  const referencedHetIds = await prisma.workOrder.findMany({
    where: { tenantId, hetId: { not: null } },
    select: { hetId: true, id: true },
  });
  const referencedBatchHetIds = await prisma.workOrderHet.findMany({
    where: { workOrder: { tenantId } },
    select: { hetId: true, workOrderId: true },
  });
  const referencedHets = [
    ...referencedHetIds.map((ref) => ({ hetId: ref.hetId, workOrderId: ref.id })),
    ...referencedBatchHetIds.map((ref) => ({ hetId: ref.hetId, workOrderId: ref.workOrderId })),
  ];
  const seenPlaceholderHets = new Set<string>();
  for (const ref of referencedHets) {
    if (!ref.hetId || hetById.has(ref.hetId)) continue;
    const hetId = ref.hetId;
    if (seenPlaceholderHets.has(hetId)) continue;
    seenPlaceholderHets.add(hetId);
    const unitId = stableId('placeholder-unit', hetId);
    await writeOrCount(dryRun, () =>
      prisma.collectionUnit.upsert({
        where: { id: unitId },
        update: {
          tenantId,
          legacyHetId: hetId,
          status: 'WORKORDER_REFERENCED_NO_PROCUREMENT_SOURCE',
          legacyUsedByWorkOrderId: ref.workOrderId,
          sourceSystem: 'BOM_WO_BACKFILL',
          linkCompleteness: 'WORKORDER_HET_ONLY',
          semanticConfidence: 'PLACEHOLDER_FOR_PARITY',
          hiddenFromOperations: true,
        },
        create: {
          id: unitId,
          tenantId,
          legacyHetId: hetId,
          status: 'WORKORDER_REFERENCED_NO_PROCUREMENT_SOURCE',
          legacyUsedByWorkOrderId: ref.workOrderId,
          sourceSystem: 'BOM_WO_BACKFILL',
          linkCompleteness: 'WORKORDER_HET_ONLY',
          semanticConfidence: 'PLACEHOLDER_FOR_PARITY',
          hiddenFromOperations: true,
        },
      }),
    );
    await writeOrCount(dryRun, () =>
      prisma.het.updateMany({
        where: { id: hetId, tenantId, collectionUnitId: null },
        data: { collectionUnitId: unitId, sourceSystem: 'BOM_WO_BACKFILL' },
      }),
    );
    report.totals.placeholderUnits++;
  }

  report.finishedAt = new Date().toISOString();
  if (!dryRun) {
    await prisma.procurementImportReport.create({
      data: {
        tenantId,
        source: 'HETDeliveryReturnRecords',
        dryRun,
        startedAt: new Date(report.startedAt),
        finishedAt: new Date(report.finishedAt!),
        report: report as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sourceDir = arg('source-dir', process.env.PROCUREMENT_CSV_DIR || path.resolve(process.cwd(), 'data/procurement'))!;
  importProcurementLegacy({
    sourceDir,
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

import fs from 'node:fs';
import path from 'node:path';
import csv from 'csv-parser';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { DEFAULT_TENANT_ID, tenantIdOrDefault } from '../services/tenant.js';

type Row = Record<string, string | undefined>;

interface InventoryImportReport {
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  sourceDir: string;
  tenantId: string;
  totals: {
    itemRows: number;
    itemSerialRows: number;
    checkInOutRows: number;
    itemRackRows: number;
    storageRows: number;
    storageRackRows: number;
    referenceRows: number;
    skus: number;
    lots: number;
    transactions: number;
    balances: number;
    locations: number;
  };
  reconciliation: {
    checkedBalances: number;
    mismatchedBalances: number;
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

function decimalText(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? normalized : undefined;
}

function legacyDateValue(value: string | undefined) {
  if (!value) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
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

async function readFirstExistingCsv(sourceDir: string, fileNames: string[]) {
  for (const fileName of fileNames) {
    const rows = await readCsv(path.join(sourceDir, fileName));
    if (rows.length > 0) return rows;
  }
  return [];
}

async function writeOrCount<T>(dryRun: boolean, write: () => Promise<T>) {
  if (dryRun) return undefined;
  return write();
}

export function inventoryTransactionType(directionRaw?: string, reasonRaw?: string) {
  const direction = directionRaw?.trim().toUpperCase();
  const reason = reasonRaw?.trim().toUpperCase();
  if (direction === 'IN' && reason === 'ADDING NEW STOCK') return 'RECEIVE';
  if (direction === 'IN' && reason === 'TRANSFER IN') return 'TRANSFER_IN';
  if (direction === 'IN') return 'ADJUST';
  if (direction === 'OUT' && reason === 'USAGE') return 'CONSUME';
  if (direction === 'OUT' && reason === 'TRANSFER OUT') return 'TRANSFER_OUT';
  if (direction === 'OUT' && reason === 'DISPOSAL') return 'SCRAP';
  if (direction === 'OUT' && reason === 'LOST/FOUND') return 'ADJUST';
  if (direction === 'OUT') return 'ADJUST';
  return 'ADJUST';
}

function inventoryTypeForCategory(category?: string) {
  const normalized = category?.trim().toUpperCase();
  if (normalized === 'FINISHED GOODS') return 'FINISHED_GOOD';
  if (normalized === 'RAW MATERIALS') return 'RAW_MATERIAL';
  if (normalized === 'PROCESSING REAGENTS AND CONSUMABLES') return 'PROCESSING_REAGENT';
  if (normalized === 'STERILISATION CONSUMABLES') return 'CONSUMABLE';
  if (normalized === 'PACKAGING') return 'PACKAGING';
  if (normalized === 'PPE') return 'PPE';
  if (normalized === 'WASTE') return 'WASTE';
  if (normalized === 'STORAGE CONTAINER') return 'STORAGE_CONTAINER';
  return 'CONSUMABLE';
}

function balanceKey(itemId?: string, rackNumber?: string) {
  return `${itemId ?? ''}::${rackNumber ?? ''}`;
}

export async function importInventoryLegacy(options: {
  sourceDir: string;
  tenantId?: string | null;
  dryRun?: boolean;
}) {
  const tenantId = tenantIdOrDefault(options.tenantId);
  const dryRun = Boolean(options.dryRun);
  const report: InventoryImportReport = {
    startedAt: new Date().toISOString(),
    dryRun,
    sourceDir: options.sourceDir,
    tenantId,
    totals: {
      itemRows: 0,
      itemSerialRows: 0,
      checkInOutRows: 0,
      itemRackRows: 0,
      storageRows: 0,
      storageRackRows: 0,
      referenceRows: 0,
      skus: 0,
      lots: 0,
      transactions: 0,
      balances: 0,
      locations: 0,
    },
    reconciliation: {
      checkedBalances: 0,
      mismatchedBalances: 0,
    },
    warnings: [],
  };

  const itemRows = await readFirstExistingCsv(options.sourceDir, ['ventasInventory---item.csv', 'item.csv']);
  const itemSerialRows = await readFirstExistingCsv(options.sourceDir, ['ventasInventory---itemSerial.csv', 'itemSerial.csv']);
  const checkInOutRows = await readFirstExistingCsv(options.sourceDir, ['ventasInventory---checkInOut.csv', 'checkInOut.csv']);
  const itemRackRows = await readFirstExistingCsv(options.sourceDir, ['ventasInventory---itemRack.csv', 'itemRack.csv']);
  const storageRows = await readFirstExistingCsv(options.sourceDir, ['ventasInventory---storage.csv', 'storage.csv']);
  const storageRackRows = await readFirstExistingCsv(options.sourceDir, ['ventasInventory---storageRack.csv', 'storageRack.csv']);
  const referenceSources = [
    { refType: 'CATEGORY', nameKeys: ['catName'], shortKeys: ['catShort'], descKeys: ['catDesc'], rows: await readFirstExistingCsv(options.sourceDir, ['ventasInventory---itemCat.csv', 'itemCat.csv']) },
    { refType: 'UOM', nameKeys: ['uomName'], shortKeys: ['uomShort'], descKeys: ['uomDesc'], rows: await readFirstExistingCsv(options.sourceDir, ['ventasInventory---refUom.csv', 'refUom.csv']) },
    { refType: 'SIZE', nameKeys: ['sizeName'], shortKeys: ['sizeShort'], descKeys: ['sizeDesc'], rows: await readFirstExistingCsv(options.sourceDir, ['ventasInventory---refSize.csv', 'refSize.csv']) },
    { refType: 'BRAND', nameKeys: ['brandId'], shortKeys: ['brandShort'], descKeys: ['brandDesc'], rows: await readFirstExistingCsv(options.sourceDir, ['ventasInventory---refBrand.csv', 'refBrand.csv']) },
    { refType: 'COLOUR', nameKeys: ['colourName'], shortKeys: ['colourShort'], descKeys: ['colourDesc'], rows: await readFirstExistingCsv(options.sourceDir, ['ventasInventory---refColor.csv', 'refColor.csv']) },
  ];

  report.totals.itemRows = itemRows.length;
  report.totals.itemSerialRows = itemSerialRows.length;
  report.totals.checkInOutRows = checkInOutRows.length;
  report.totals.itemRackRows = itemRackRows.length;
  report.totals.storageRows = storageRows.length;
  report.totals.storageRackRows = storageRackRows.length;

  for (const source of referenceSources) {
    for (const row of source.rows) {
      const name = text(row, source.nameKeys);
      if (!name) {
        report.warnings.push({ reason: `${source.refType} reference row missing name` });
        continue;
      }
      await writeOrCount(dryRun, () =>
        prisma.inventoryReference.upsert({
          where: { tenantId_refType_name: { tenantId, refType: source.refType, name } },
          update: {
            shortCode: text(row, source.shortKeys),
            description: text(row, source.descKeys),
            sourceSystem: 'ventasInventory',
            legacyRaw: row,
          },
          create: {
            id: stableId(`inv-ref:${source.refType}`, name),
            tenantId,
            refType: source.refType,
            name,
            shortCode: text(row, source.shortKeys),
            description: text(row, source.descKeys),
            sourceSystem: 'ventasInventory',
            legacyRaw: row,
          },
        }),
      );
      report.totals.referenceRows++;
    }
  }

  const storageByBin = new Set<string>();
  for (const row of storageRows) {
    const binNumber = text(row, ['binNumber']);
    if (!binNumber) {
      report.warnings.push({ reason: 'storage row missing binNumber' });
      continue;
    }
    storageByBin.add(binNumber);
    await writeOrCount(dryRun, () =>
      prisma.inventoryLocation.upsert({
        where: { id: stableId('inv-bin', binNumber) },
        update: {
          tenantId,
          locationType: 'BIN',
          name: binNumber,
          description: text(row, ['binDesc']),
          imagePath: text(row, ['image']),
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
        create: {
          id: stableId('inv-bin', binNumber),
          tenantId,
          locationType: 'BIN',
          name: binNumber,
          description: text(row, ['binDesc']),
          imagePath: text(row, ['image']),
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
      }),
    );
    report.totals.locations++;
  }

  const rackById = new Set<string>();
  for (const row of storageRackRows) {
    const rackId = text(row, ['id']);
    const binNumber = text(row, ['binNumber']);
    if (!rackId) {
      report.warnings.push({ reason: 'storageRack row missing id' });
      continue;
    }
    rackById.add(rackId);
    await writeOrCount(dryRun, () =>
      prisma.inventoryLocation.upsert({
        where: { id: stableId('inv-rack', rackId) },
        update: {
          tenantId,
          locationType: 'RACK',
          name: text(row, ['rackName']) ?? rackId,
          parentLocationId: binNumber ? stableId('inv-bin', binNumber) : undefined,
          description: text(row, ['rackDesc']),
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
        create: {
          id: stableId('inv-rack', rackId),
          tenantId,
          locationType: 'RACK',
          name: text(row, ['rackName']) ?? rackId,
          parentLocationId: binNumber ? stableId('inv-bin', binNumber) : undefined,
          description: text(row, ['rackDesc']),
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
      }),
    );
    report.totals.locations++;
  }

  const skuById = new Map<string, Row>();
  for (const row of itemRows) {
    const itemId = text(row, ['itemId']);
    if (!itemId) {
      report.warnings.push({ reason: 'item row missing itemId' });
      continue;
    }
    skuById.set(itemId, row);
    await writeOrCount(dryRun, () =>
      prisma.inventorySku.upsert({
        where: { id: itemId },
        update: {
          tenantId,
          sku: text(row, ['SKU']),
          description: text(row, ['itemDesc']),
          category: text(row, ['category']),
          brand: text(row, ['brand']),
          size: text(row, ['size']),
          colour: text(row, ['colour']),
          uom: text(row, ['uom']),
          packQuantity: decimalText(text(row, ['packQuantity'])),
          threshold: decimalText(text(row, ['threshold'])),
          serialisedMode: text(row, ['serialised']),
          qrImagePath: text(row, ['qrImg']),
          mediaUrl: text(row, ['mediaUrl']),
          qrPrintPath: text(row, ['qrPrint']),
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
        create: {
          id: itemId,
          tenantId,
          sku: text(row, ['SKU']),
          description: text(row, ['itemDesc']),
          category: text(row, ['category']),
          brand: text(row, ['brand']),
          size: text(row, ['size']),
          colour: text(row, ['colour']),
          uom: text(row, ['uom']),
          packQuantity: decimalText(text(row, ['packQuantity'])),
          threshold: decimalText(text(row, ['threshold'])),
          serialisedMode: text(row, ['serialised']),
          qrImagePath: text(row, ['qrImg']),
          mediaUrl: text(row, ['mediaUrl']),
          qrPrintPath: text(row, ['qrPrint']),
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
      }),
    );
    report.totals.skus++;
  }

  const lotBySerialId = new Map<string, Row>();
  for (const row of itemSerialRows) {
    const itemSerialId = text(row, ['itemSerialId']);
    const itemId = text(row, ['itemId']);
    if (!itemSerialId) {
      report.warnings.push({ reason: 'itemSerial row missing itemSerialId' });
      continue;
    }
    lotBySerialId.set(itemSerialId, row);
    if (itemId && !skuById.has(itemId)) {
      report.warnings.push({ row: itemSerialId, reason: `itemSerial references missing item ${itemId}` });
    }
    const sku = itemId ? skuById.get(itemId) : undefined;
    await writeOrCount(dryRun, () =>
      prisma.inventoryLot.upsert({
        where: { id: itemSerialId },
        update: {
          tenantId,
          inventorySkuId: itemId && skuById.has(itemId) ? itemId : undefined,
          lotNumber: text(row, ['serialNo']),
          inventoryType: inventoryTypeForCategory(text(sku ?? {}, ['category'])),
          status: 'AVAILABLE_LEGACY',
          sourceSystem: 'ventasInventory',
          legacyItemSerialId: itemSerialId,
          legacyCheckInOutId: text(row, ['checkInOutId']),
          legacyRaw: row,
        },
        create: {
          id: itemSerialId,
          tenantId,
          inventorySkuId: itemId && skuById.has(itemId) ? itemId : undefined,
          lotNumber: text(row, ['serialNo']),
          inventoryType: inventoryTypeForCategory(text(sku ?? {}, ['category'])),
          status: 'AVAILABLE_LEGACY',
          sourceSystem: 'ventasInventory',
          legacyItemSerialId: itemSerialId,
          legacyCheckInOutId: text(row, ['checkInOutId']),
          legacyRaw: row,
        },
      }),
    );
    report.totals.lots++;
  }

  const transactionBalance = new Map<string, number>();
  for (const row of checkInOutRows) {
    const id = text(row, ['id']);
    const itemId = text(row, ['itemId']);
    const rackNumber = text(row, ['rackNumber']);
    const direction = text(row, ['direction']);
    const refNumber = text(row, ['refNumber']);
    const refNumberOut = text(row, ['refNumberOut']);
    if (!id) {
      report.warnings.push({ reason: 'checkInOut row missing id' });
      continue;
    }
    if (itemId && !skuById.has(itemId)) {
      report.warnings.push({ row: id, reason: `checkInOut references missing item ${itemId}` });
    }
    if (rackNumber && !rackById.has(rackNumber)) {
      report.warnings.push({ row: id, reason: `checkInOut references missing rack ${rackNumber}` });
    }
    const serialRef = direction?.toUpperCase() === 'OUT' ? refNumberOut : refNumber;
    const inventoryLotId = serialRef && lotBySerialId.has(serialRef) ? serialRef : undefined;
    if (serialRef && !inventoryLotId) {
      report.warnings.push({ row: id, reason: `serial reference ${serialRef} did not match itemSerial` });
    }
    const quantity = decimalText(text(row, ['quantity']));
    const numericQuantity = quantity ? Number(quantity) : 0;
    if (itemId && rackNumber && numericQuantity) {
      const key = balanceKey(itemId, rackNumber);
      const sign = direction?.toUpperCase() === 'OUT' ? -1 : 1;
      transactionBalance.set(key, (transactionBalance.get(key) ?? 0) + sign * numericQuantity);
    }
    const locationId = rackNumber && rackById.has(rackNumber) ? stableId('inv-rack', rackNumber) : undefined;
    await writeOrCount(dryRun, () =>
      prisma.inventoryTransaction.upsert({
        where: { id },
        update: {
          tenantId,
          inventorySkuId: itemId && skuById.has(itemId) ? itemId : undefined,
          inventoryLotId,
          transactionType: inventoryTransactionType(direction, text(row, ['reason'])),
          direction,
          reason: text(row, ['reason']),
          quantity,
          uom: text(row, ['uom']),
          fromLocationId: direction?.toUpperCase() === 'OUT' ? locationId : undefined,
          toLocationId: direction?.toUpperCase() === 'IN' ? locationId : undefined,
          occurredAt: legacyDateValue(text(row, ['createdOn'])),
          actor: text(row, ['createdBy']),
          signaturePath: text(row, ['staffSign']),
          remarks: text(row, ['remarks']),
          legacyRefNumber: refNumber,
          legacyRefNumberOut: refNumberOut,
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
        create: {
          id,
          tenantId,
          inventorySkuId: itemId && skuById.has(itemId) ? itemId : undefined,
          inventoryLotId,
          transactionType: inventoryTransactionType(direction, text(row, ['reason'])),
          direction,
          reason: text(row, ['reason']),
          quantity,
          uom: text(row, ['uom']),
          fromLocationId: direction?.toUpperCase() === 'OUT' ? locationId : undefined,
          toLocationId: direction?.toUpperCase() === 'IN' ? locationId : undefined,
          occurredAt: legacyDateValue(text(row, ['createdOn'])),
          actor: text(row, ['createdBy']),
          signaturePath: text(row, ['staffSign']),
          remarks: text(row, ['remarks']),
          legacyRefNumber: refNumber,
          legacyRefNumberOut: refNumberOut,
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
      }),
    );
    report.totals.transactions++;
  }

  for (const row of itemRackRows) {
    const itemId = text(row, ['itemId']);
    const rackNumber = text(row, ['rackNumber']);
    if (!itemId || !rackNumber) {
      report.warnings.push({ reason: 'itemRack row missing itemId or rackNumber' });
      continue;
    }
    if (!skuById.has(itemId)) {
      report.warnings.push({ row: itemId, reason: `itemRack references missing item ${itemId}` });
      continue;
    }
    if (!rackById.has(rackNumber)) {
      report.warnings.push({ row: itemId, reason: `itemRack references missing rack ${rackNumber}` });
    }
    const snapshotQuantity = decimalText(text(row, ['rackQty']));
    const transactionQuantity = transactionBalance.get(balanceKey(itemId, rackNumber));
    if (transactionQuantity !== undefined && snapshotQuantity !== undefined) {
      report.reconciliation.checkedBalances++;
      if (Math.abs(transactionQuantity - Number(snapshotQuantity)) > 0.0001) {
        report.reconciliation.mismatchedBalances++;
      }
    }
    await writeOrCount(dryRun, () =>
      prisma.inventoryBalance.upsert({
        where: { id: stableId('inv-balance', `${itemId}:${rackNumber}`) },
        update: {
          tenantId,
          inventorySkuId: itemId,
          inventoryLocationId: rackById.has(rackNumber) ? stableId('inv-rack', rackNumber) : undefined,
          quantity: snapshotQuantity,
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
        create: {
          id: stableId('inv-balance', `${itemId}:${rackNumber}`),
          tenantId,
          inventorySkuId: itemId,
          inventoryLocationId: rackById.has(rackNumber) ? stableId('inv-rack', rackNumber) : undefined,
          quantity: snapshotQuantity,
          sourceSystem: 'ventasInventory',
          legacyRaw: row,
        },
      }),
    );
    report.totals.balances++;
  }

  report.finishedAt = new Date().toISOString();
  if (!dryRun) {
    await prisma.inventoryImportReport.create({
      data: {
        tenantId,
        source: 'ventasInventory',
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
  const sourceDir = arg('source-dir', process.env.INVENTORY_CSV_DIR || path.resolve(process.cwd(), 'data/inventory'))!;
  importInventoryLegacy({
    sourceDir,
    tenantId: arg('tenant-id', DEFAULT_TENANT_ID),
    dryRun: flag('dry-run'),
  })
    .then((report) => {
      console.table(report.totals);
      console.table(report.reconciliation);
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const prismaMock = vi.hoisted(() => ({
  inventoryReference: { upsert: vi.fn(async () => ({})) },
  inventoryLocation: { upsert: vi.fn(async () => ({})) },
  inventorySku: { upsert: vi.fn(async () => ({})) },
  inventoryLot: { upsert: vi.fn(async () => ({})) },
  inventoryTransaction: { upsert: vi.fn(async () => ({})) },
  inventoryBalance: { upsert: vi.fn(async () => ({})) },
  inventoryImportReport: { create: vi.fn(async () => ({})) },
}));

vi.mock('../../db/prisma.js', () => ({ prisma: prismaMock }));

import { importInventoryLegacy, inventoryTransactionType } from '../importInventoryLegacy.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-import-'));
  vi.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeCsv(name: string, rows: string[][]) {
  const csv =
    rows
      .map((row) =>
        row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','),
      )
      .join('\n') + '\n';
  fs.writeFileSync(path.join(tmpDir, name), csv, 'utf8');
}

describe('importInventoryLegacy', () => {
  it('maps legacy inventory export filenames and reports reconciliation mismatches', async () => {
    writeCsv('ventasInventory---item.csv', [
      ['itemId', 'SKU', 'itemDesc', 'category', 'uom', 'packQuantity', 'threshold', 'serialised'],
      ['SKU-1', 'SKU-CODE-1', 'Finished item', 'Finished Goods', 'Packet', '1', '5', 'BATCH'],
    ]);
    writeCsv('ventasInventory---itemSerial.csv', [
      ['itemSerialId', 'itemId', 'serialNo', 'checkInOutId'],
      ['ITS-1', 'SKU-1', 'LOT-1', 'CIO-IN'],
    ]);
    writeCsv('ventasInventory---storage.csv', [
      ['binNumber', 'binDesc'],
      ['BIN-1', 'Main bin'],
    ]);
    writeCsv('ventasInventory---storageRack.csv', [
      ['id', 'binNumber', 'rackName'],
      ['RACK-1', 'BIN-1', 'Rack one'],
    ]);
    writeCsv('ventasInventory---checkInOut.csv', [
      ['id', 'createdOn', 'createdBy', 'itemId', 'category', 'uom', 'rackNumber', 'direction', 'reason', 'quantity', 'refNumber', 'refNumberOut'],
      ['CIO-IN', '9/9/2024 9:47:22', 'user@example.com', 'SKU-1', 'Finished Goods', 'Packet', 'RACK-1', 'IN', 'Adding New Stock', '10', 'ITS-1', ''],
      ['CIO-OUT', '9/10/2024 9:47:22', 'user@example.com', 'SKU-1', 'Finished Goods', 'Packet', 'RACK-1', 'OUT', 'Usage', '3', '', 'ITS-1'],
    ]);
    writeCsv('ventasInventory---itemRack.csv', [
      ['itemId', 'rackNumber', 'rackQty'],
      ['SKU-1', 'RACK-1', '9'],
    ]);
    writeCsv('ventasInventory---itemCat.csv', [
      ['catName', 'catShort'],
      ['Finished Goods', 'FG'],
    ]);

    const report = await importInventoryLegacy({ sourceDir: tmpDir, dryRun: true });

    expect(report.totals.itemRows).toBe(1);
    expect(report.totals.itemSerialRows).toBe(1);
    expect(report.totals.checkInOutRows).toBe(2);
    expect(report.totals.itemRackRows).toBe(1);
    expect(report.totals.skus).toBe(1);
    expect(report.totals.lots).toBe(1);
    expect(report.totals.transactions).toBe(2);
    expect(report.totals.balances).toBe(1);
    expect(report.reconciliation.checkedBalances).toBe(1);
    expect(report.reconciliation.mismatchedBalances).toBe(1);
    expect(prismaMock.inventorySku.upsert).not.toHaveBeenCalled();
  });

  it('maps movement directions and reasons to canonical transaction types', () => {
    expect(inventoryTransactionType('IN', 'Adding New Stock')).toBe('RECEIVE');
    expect(inventoryTransactionType('IN', 'Transfer In')).toBe('TRANSFER_IN');
    expect(inventoryTransactionType('OUT', 'Usage')).toBe('CONSUME');
    expect(inventoryTransactionType('OUT', 'Transfer Out')).toBe('TRANSFER_OUT');
    expect(inventoryTransactionType('OUT', 'Disposal')).toBe('SCRAP');
    expect(inventoryTransactionType('OUT', 'Lost/Found')).toBe('ADJUST');
  });
});

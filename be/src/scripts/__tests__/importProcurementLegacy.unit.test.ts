import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const prismaMock = vi.hoisted(() => ({
  het: {
    count: vi.fn(async () => 0),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  workOrder: {
    findMany: vi.fn(async () => []),
  },
  workOrderHet: {
    findMany: vi.fn(async () => []),
  },
  procurementImportReport: {
    create: vi.fn(async () => ({})),
  },
}));

vi.mock('../../db/prisma.js', () => ({ prisma: prismaMock }));

import { importProcurementLegacy } from '../importProcurementLegacy.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procurement-import-'));
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

describe('importProcurementLegacy', () => {
  it('accepts legacy HETDeliveryReturnRecords export filenames', async () => {
    writeCsv('HETDeliveryReturnRecords---clinicDb.csv', [
      ['clinicId', 'clinicName', 'HCICode'],
      ['CLINIC-1', 'Clinic One', 'HCI-1'],
    ]);
    writeCsv('HETDeliveryReturnRecords---deliverCollect.csv', [
      ['deliverCollectId', 'direction', 'hetId', 'clinicId'],
      ['DC-1', 'DELIVER', 'HET-1', 'CLINIC-1'],
      ['DC-2', 'COLLECT', 'HET-1', 'CLINIC-1'],
    ]);
    writeCsv('HETDeliveryReturnRecords---HETLot-TODEL.csv', [
      ['hetId', 'clinicId', 'HETLotNumber'],
      ['HET-1', 'CLINIC-1', 'LOT-1'],
    ]);

    const report = await importProcurementLegacy({ sourceDir: tmpDir, dryRun: true });

    expect(report.totals.clinicRows).toBe(1);
    expect(report.totals.deliverCollectRows).toBe(2);
    expect(report.totals.hetRows).toBe(1);
    expect(report.totals.supplyEntities).toBe(1);
    expect(report.totals.collectionPoints).toBe(1);
    expect(report.totals.collectionUnits).toBe(1);
    expect(report.totals.issuanceOrders).toBe(1);
    expect(report.totals.collectionOrders).toBe(1);
    expect(report.totals.collectionReceipts).toBe(1);
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock the prisma singleton so we can run without a real DB.
// Each delegate exposes upsert (used by importer for main + join tables).
const mocks = vi.hoisted(() => {
  const make = () => ({
    upsert: vi.fn(async () => ({})),
    findUnique: vi.fn(async () => null), // null = "would be created" in dry-run
    findMany: vi.fn(async () => []),
  });
  return {
    staff: make(),
    manufacturer: make(),
    procedure: make(),
    bom: make(),
    bomLine: make(),
    het: make(),
    phase: make(),
    phaseEquip: make(),
    workOrder: make(),
    workOrderHet: make(),
    workOrderPhaseEquip: make(),
    woSerial: make(),
    sterilise: make(),
    steriliseHet: make(),
    printLabel: make(),
    manufacturerHet: make(),
  };
});

vi.mock('../../db/prisma.js', () => ({ prisma: mocks }));

import { importAll, tableConfigs } from '../importCsv.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-test-'));
  // Reset mocks
  for (const m of Object.values(mocks)) {
    for (const fn of Object.values(m) as any[]) {
      if (typeof fn?.mockReset === 'function') fn.mockReset();
      if (typeof fn?.mockResolvedValue === 'function') fn.mockResolvedValue(null);
    }
  }
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeCsv(name: string, header: string[], rows: string[][]): void {
  const csv = [header, ...rows]
    .map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
  fs.writeFileSync(path.join(tmpDir, name), csv + '\n', 'utf8');
}

describe('importCsv — D3 idempotency + validation report', () => {
  it('imports all 12 entities in tableConfigs order', async () => {
    // Write minimal valid CSVs for every entity. Empty body is OK for entities
    // we don't care about — the importer logs "file not found" as a warning.
    writeCsv('staff.csv', ['email', 'name', 'bitrixId', 'active'], [
      ['alice@example.com', 'Alice', 'bx-1', 'yes'],
    ]);
    writeCsv('manufacturer.csv', ['manuId', 'manuName'], [['MAN-1', 'Mfg A']]);
    writeCsv('procedure.csv', ['procedureId', 'procedureName'], [['PRO-1', 'Proc A']]);
    writeCsv('bom.csv', ['bomId', 'bomName'], [['BOM-1', 'BOM A']]);
    writeCsv('bomLine.csv', ['bomLineId', 'bomId'], [['BOL-1', 'BOM-1']]);
    writeCsv('het.csv', ['hetId'], [['HET-1']]);
    writeCsv('phase.csv', ['phaseId'], [['PHS-1']]);
    writeCsv('phaseEquip.csv', ['phaseEquipId'], [['PHQ-1']]);
    writeCsv('workOrder.csv', ['woId', 'phaseId'], [['WKO-1', 'PHS-1']]);
    writeCsv('woSerial.csv', ['woSerialId'], [['WSR-1']]);
    writeCsv('sterilise.csv', ['steriliseId', 'workOrderId'], [['STR-1', 'WKO-1']]);
    writeCsv('printLabels.csv', ['_ID'], [['PL-1']]);

    const report = await importAll(tmpDir, { dryRun: false });

    expect(report.perEntity.staff.upserted).toBe(1);
    expect(report.perEntity.workOrder.upserted).toBe(1);
    expect(report.perEntity.sterilise.upserted).toBe(1);
    expect(report.totals.upserted).toBeGreaterThanOrEqual(12);
    expect(report.errored).toEqual([]);
  });

  it('is idempotent: re-running yields 0 errored and same upserted counts', async () => {
    writeCsv('staff.csv', ['email', 'name'], [['alice@example.com', 'Alice']]);
    writeCsv('manufacturer.csv', ['manuId', 'manuName'], [['MAN-1', 'Mfg A']]);
    writeCsv('procedure.csv', ['procedureId'], [['PRO-1']]);
    writeCsv('bom.csv', ['bomId'], [['BOM-1']]);
    writeCsv('bomLine.csv', ['bomLineId'], [['BOL-1']]);
    writeCsv('het.csv', ['hetId'], [['HET-1']]);
    writeCsv('phase.csv', ['phaseId'], [['PHS-1']]);
    writeCsv('phaseEquip.csv', ['phaseEquipId'], [['PHQ-1']]);
    writeCsv('workOrder.csv', ['woId'], [['WKO-1']]);
    writeCsv('woSerial.csv', ['woSerialId'], [['WSR-1']]);
    writeCsv('sterilise.csv', ['steriliseId'], [['STR-1']]);
    writeCsv('printLabels.csv', ['_ID'], [['PL-1']]);

    const r1 = await importAll(tmpDir, { dryRun: false });
    const r2 = await importAll(tmpDir, { dryRun: false });

    expect(r1.errored).toEqual([]);
    expect(r2.errored).toEqual([]);
    // Same upserted totals — upsert is idempotent.
    expect(r1.totals.upserted).toBe(r2.totals.upserted);
  });

  it('records skipped rows for missing PK', async () => {
    writeCsv('staff.csv', ['email', 'name'], [
      ['', 'NoId'],     // missing PK
      ['alice@example.com', 'Alice'],
    ]);
    writeCsv('manufacturer.csv', ['manuId'], [['MAN-1']]);
    writeCsv('procedure.csv', ['procedureId'], [['PRO-1']]);
    writeCsv('bom.csv', ['bomId'], [['BOM-1']]);
    writeCsv('bomLine.csv', ['bomLineId'], [['BOL-1']]);
    writeCsv('het.csv', ['hetId'], [['HET-1']]);
    writeCsv('phase.csv', ['phaseId'], [['PHS-1']]);
    writeCsv('phaseEquip.csv', ['phaseEquipId'], [['PHQ-1']]);
    writeCsv('workOrder.csv', ['woId'], [['WKO-1']]);
    writeCsv('woSerial.csv', ['woSerialId'], [['WSR-1']]);
    writeCsv('sterilise.csv', ['steriliseId'], [['STR-1']]);
    writeCsv('printLabels.csv', ['_ID'], [['PL-1']]);

    const report = await importAll(tmpDir, { dryRun: false });

    expect(report.perEntity.staff.skipped).toBe(1);
    expect(report.perEntity.staff.upserted).toBe(1);
    expect(report.skipped.some((s) => s.reason.includes('missing PK'))).toBe(true);
  });

  it('dry-run does not call upsert (it probes with findUnique)', async () => {
    writeCsv('staff.csv', ['email'], [['alice@example.com']]);
    writeCsv('manufacturer.csv', ['manuId'], [['MAN-1']]);
    writeCsv('procedure.csv', ['procedureId'], [['PRO-1']]);
    writeCsv('bom.csv', ['bomId'], [['BOM-1']]);
    writeCsv('bomLine.csv', ['bomLineId'], [['BOL-1']]);
    writeCsv('het.csv', ['hetId'], [['HET-1']]);
    writeCsv('phase.csv', ['phaseId'], [['PHS-1']]);
    writeCsv('phaseEquip.csv', ['phaseEquipId'], [['PHQ-1']]);
    writeCsv('workOrder.csv', ['woId'], [['WKO-1']]);
    writeCsv('woSerial.csv', ['woSerialId'], [['WSR-1']]);
    writeCsv('sterilise.csv', ['steriliseId'], [['STR-1']]);
    writeCsv('printLabels.csv', ['_ID'], [['PL-1']]);

    const report = await importAll(tmpDir, { dryRun: true });

    // dry-run does NOT call upsert; it probes findUnique.
    expect(mocks.staff.upsert).not.toHaveBeenCalled();
    expect(mocks.staff.findUnique).toHaveBeenCalled();
    expect(report.dryRun).toBe(true);
    expect(report.totals.upserted).toBeGreaterThan(0);
  });

  it('manufacturerafterImport hook derives ManufacturerHet rows (GAP-1)', async () => {
    // Manufacture a workOrder with manuId, plus a WorkOrderHet join with HET-X.
    // Then the manufacturer.afterImport hook should produce a ManufacturerHet row.
    writeCsv('workOrder.csv', ['woId', 'manuId'], [['WKO-1', 'MAN-1']]);
    writeCsv('manufacturer.csv', ['manuId'], [['MAN-1']]);
    writeCsv('procedure.csv', ['procedureId'], [['PRO-1']]);
    writeCsv('bom.csv', ['bomId'], [['BOM-1']]);
    writeCsv('bomLine.csv', ['bomLineId'], [['BOL-1']]);
    writeCsv('het.csv', ['hetId'], [['HET-X']]);
    writeCsv('phase.csv', ['phaseId'], [['PHS-1']]);
    writeCsv('phaseEquip.csv', ['phaseEquipId'], [['PHQ-1']]);
    writeCsv('staff.csv', ['email'], [['a@b.c']]);
    writeCsv('woSerial.csv', ['woSerialId'], [['WSR-1']]);
    writeCsv('sterilise.csv', ['steriliseId'], [['STR-1']]);
    writeCsv('printLabels.csv', ['_ID'], [['PL-1']]);

    // The importer reads workOrderHet and then runs the manufacturer.afterImport
    // hook. We pre-populate mocks so the hook sees the right state.
    mocks.workOrder.findMany.mockResolvedValue([{ id: 'WKO-1', manuId: 'MAN-1' }]);
    mocks.workOrderHet.findMany.mockResolvedValue([{ workOrderId: 'WKO-1', hetId: 'HET-X' }]);

    await importAll(tmpDir, { dryRun: false });

    expect(mocks.manufacturerHet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { manufacturerId_hetId: { manufacturerId: 'MAN-1', hetId: 'HET-X' } },
        create: { manufacturerId: 'MAN-1', hetId: 'HET-X' },
      }),
    );
  });
});

describe('importCsv — tableConfigs single-source-of-truth contract', () => {
  it('exports 12 entries matching seed_data/README.md', () => {
    const expected = [
      'staff.csv', 'manufacturer.csv', 'procedure.csv', 'bom.csv', 'bomLine.csv',
      'het.csv', 'phase.csv', 'phaseEquip.csv', 'workOrder.csv', 'woSerial.csv',
      'sterilise.csv', 'printLabels.csv',
    ];
    const actual = tableConfigs.map((c) => c.fileName).sort();
    expect(actual).toEqual([...expected].sort());
  });
});
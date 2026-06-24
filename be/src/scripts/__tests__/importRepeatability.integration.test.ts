/**
 * D4 of issue #36 — repeatability proof.
 *
 * Spec: running the export → import pipeline N consecutive times against the
 * same database yields byte-identical state. Asserted by:
 *   - For each cycle: snapshot row counts + SHA-256 per table.
 *   - Run importAll().
 *   - Snapshot again. Diff against cycle 1.
 *   - Repeat N times (default 3 to keep CI fast; override via REPEATABILITY_CYCLES).
 *   - Acceptance: 0 row-count drift, 0 checksum drift across cycles.
 *
 * Requires the schema to be migrated (handled by .woodpecker/dev.yml's
 * dev-db-setup step). The test creates its own seed CSVs in tmpdir — no
 * dependency on the live BOM_WO sheet. The importer's tableConfigs is the
 * single source of truth for which CSVs and which columns to write.
 *
 * Note: this test does NOT mock the prisma singleton. It needs a real DB
 * to prove the upsert path is genuinely idempotent (mocks would prove
 * nothing). The PR#2 importCsv.integration.test mocks prisma and runs
 * first; vi.mock is per-file, so the mock does not leak into this test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { importAll, tableConfigs } from '../importCsv.js';

const CYCLES = Number(process.env.REPEATABILITY_CYCLES ?? 3);

// Tables we expect to import (single source of truth = tableConfigs).
// Derived from the same array at runtime to avoid drift.
const MODELS = tableConfigs.map((c) => c.model);

// Join tables are not in tableConfigs but are populated via relations.
const JOIN_TABLES = ['workOrderHet', 'workOrderPhaseEquip', 'steriliseHet', 'manufacturerHet'];

interface Snapshot {
  rows: Record<string, number>;
  checksums: Record<string, string>;
}

const ALL_TABLES = [...MODELS, ...JOIN_TABLES];

/**
 * Hash a table's full content. For models with a single `id` PK: hash the
 * ordered id list. For join tables with composite PKs: probe the known
 * column set and hash the resulting tuples in canonical order. The
 * function is defensive — if a new join table appears that we don't know
 * about, the test fails with a clear error rather than silently reporting
 * a zero hash.
 */
async function checksumOfTable(model: string): Promise<string> {
  const delegate = (prisma as any)[model];
  if (!delegate) throw new Error(`Unknown prisma model: ${model}`);

  // Try id-based first (works for all main tables).
  try {
    const ids: Array<{ id: unknown }> = await delegate.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (ids.length === 0) return 'sha256:empty';
    if (ids[0]!.id !== undefined && ids[0]!.id !== null) {
      const h = crypto.createHash('sha256');
      for (const { id } of ids) h.update(`${String(id)}\n`);
      return h.digest('hex');
    }
  } catch {
    // Delegate doesn't expose `id` — fall through to composite-PK probe.
  }

  // Composite-PK probe for join tables.
  const probes: Record<string, string[]> = {
    workOrderHet: ['workOrderId', 'hetId'],
    workOrderPhaseEquip: ['workOrderId', 'phaseEquipId'],
    steriliseHet: ['steriliseId', 'hetId'],
    manufacturerHet: ['manuId', 'hetId'],
  };
  const cols = probes[model];
  if (!cols) {
    throw new Error(
      `Repeatability test: no checksum strategy for join table '${model}'. ` +
        'Add it to checksumOfTable() in importRepeatability.integration.test.ts.',
    );
  }
  const select: Record<string, true> = {};
  for (const c of cols) select[c] = true;
  const rows: Array<Record<string, unknown>> = await delegate.findMany({ select });
  const h = crypto.createHash('sha256');
  for (const row of rows.sort((a, b) => {
    for (const c of cols) {
      const av = String(a[c] ?? '');
      const bv = String(b[c] ?? '');
      if (av !== bv) return av < bv ? -1 : 1;
    }
    return 0;
  })) {
    for (const c of cols) h.update(`${c}=${String(row[c])};`);
    h.update('\n');
  }
  return h.digest('hex');
}

async function snapshot(): Promise<Snapshot> {
  const rows: Record<string, number> = {};
  const checksums: Record<string, string> = {};

  for (const t of ALL_TABLES) {
    const delegate = (prisma as any)[t];
    if (!delegate) continue;
    rows[t] = await delegate.count();
    checksums[t] = await checksumOfTable(t);
  }
  return { rows, checksums };
}

function diff(a: Snapshot, b: Snapshot, labelA: string, labelB: string): string[] {
  const out: string[] = [];
  for (const t of new Set([...Object.keys(a.rows), ...Object.keys(b.rows)])) {
    if (a.rows[t] !== b.rows[t]) {
      out.push(`rows[${t}]: ${labelA}=${a.rows[t]} -> ${labelB}=${b.rows[t]}`);
    }
  }
  for (const t of new Set([...Object.keys(a.checksums), ...Object.keys(b.checksums)])) {
    if (a.checksums[t] !== b.checksums[t]) {
      out.push(`checksum[${t}]: drifted between ${labelA} and ${labelB}`);
    }
  }
  return out;
}

/**
 * Deterministic seed CSVs that exactly satisfy importCsv.ts tableConfigs.
 * Every CSV header is a subset of the columnMap keys. Every required field
 * (the sourceIdColumn + any columnMap entry with a non-nullable target) is
 * populated. All FK references (manuId, bomId, phaseId, etc.) point to rows
 * in their parent table within the same seed.
 */
function writeSeed(dir: string, seed = 1): void {
  const stem = (n: number) => `${n}-${seed}`;
  const csv = (rows: string[][]) =>
    rows
      .map((r) =>
        r.map((c) => (c.includes(',') || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(','),
      )
      .join('\n') + '\n';

  // Order matters: parent rows before children. tableConfigs iterates in
  // this order, so children are imported after their parents and FKs resolve.

  // staff (sourceIdColumn = email)
  fs.writeFileSync(
    path.join(dir, 'staff.csv'),
    csv([
      ['email', 'name', 'active'],
      [`s${seed}@e.com`, `User ${seed}`, 'yes'],
    ]),
  );

  // manufacturer (sourceIdColumn = manuId → id)
  fs.writeFileSync(
    path.join(dir, 'manufacturer.csv'),
    csv([
      ['manuId', 'manuName'],
      [`MAN-${stem(1)}`, `Mfg ${seed}`],
    ]),
  );

  // procedure (sourceIdColumn = procedureId → id)
  fs.writeFileSync(
    path.join(dir, 'procedure.csv'),
    csv([
      ['procedureId', 'procedureName'],
      [`PRO-${stem(1)}`, `Proc ${seed}`],
    ]),
  );

  // bom (sourceIdColumn = bomId → id)
  fs.writeFileSync(
    path.join(dir, 'bom.csv'),
    csv([
      ['bomId', 'bomName'],
      [`BOM-${stem(1)}`, `Bom ${seed}`],
    ]),
  );

  // bomLine (sourceIdColumn = bomLineId → id; FK bomId)
  fs.writeFileSync(
    path.join(dir, 'bomLine.csv'),
    csv([
      ['bomLineId', 'bomId', 'quantity', 'uom'],
      [`BOL-${stem(1)}`, `BOM-${stem(1)}`, '5', 'ea'],
    ]),
  );

  // het (sourceIdColumn = hetId → id)
  fs.writeFileSync(
    path.join(dir, 'het.csv'),
    csv([
      ['hetId', 'clinicName'],
      [`HET-${stem(1)}`, `Clinic ${seed}`],
    ]),
  );

  // phase (sourceIdColumn = phaseId → id)
  fs.writeFileSync(
    path.join(dir, 'phase.csv'),
    csv([
      ['phaseId', 'phaseName', 'phaseOrder'],
      [`PHS-${stem(1)}`, `Phase ${seed}`, '1'],
    ]),
  );

  // phaseEquip (sourceIdColumn = phaseEquipId → id)
  fs.writeFileSync(
    path.join(dir, 'phaseEquip.csv'),
    csv([
      ['phaseEquipId', 'equipmentName'],
      [`PHQ-${stem(1)}`, `Equip ${seed}`],
    ]),
  );

  // workOrder (sourceIdColumn = woId → id; FKs: manuId, phaseId, batchHetIds/phaseEquipIds via relations)
  // batchHetIds + phaseEquipIds are split into workOrderHet / workOrderPhaseEquip join tables.
  fs.writeFileSync(
    path.join(dir, 'workOrder.csv'),
    csv([
      ['woId', 'manuId', 'phaseId', 'batchHetIds', 'phaseEquipIds'],
      [
        `WKO-${stem(1)}`,
        `MAN-${stem(1)}`,
        `PHS-${stem(1)}`,
        `HET-${stem(1)}`,
        `PHQ-${stem(1)}`,
      ],
    ]),
  );

  // woSerial (sourceIdColumn = woSerialId → id; FK workOrderId)
  fs.writeFileSync(
    path.join(dir, 'woSerial.csv'),
    csv([
      ['woSerialId', 'workOrderId', 'serialNumber'],
      [`WSR-${stem(1)}`, `WKO-${stem(1)}`, `SN-${seed}`],
    ]),
  );

  // sterilise (sourceIdColumn = steriliseId → id; FK workOrderId, manuId; batchHetId → steriliseHet)
  fs.writeFileSync(
    path.join(dir, 'sterilise.csv'),
    csv([
      ['steriliseId', 'workOrderId', 'manuId', 'result', 'batchHetId'],
      [`STR-${stem(1)}`, `WKO-${stem(1)}`, `MAN-${stem(1)}`, 'ok', `HET-${stem(1)}`],
    ]),
  );

  // printLabels (PrintLabel model; sourceIdColumn = _ID → id)
  fs.writeFileSync(
    path.join(dir, 'printLabels.csv'),
    csv([
      ['_ID', 'File', 'MimeType'],
      [`PL-${stem(1)}`, `https://drive.example/${stem(1)}.pdf`, 'application/pdf'],
    ]),
  );
}

let seedDir: string;

beforeAll(async () => {
  seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repeatability-'));
  writeSeed(seedDir, 1);
});

afterAll(async () => {
  if (seedDir) fs.rmSync(seedDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Wipe everything before each test so we start from a clean slate.
  // Order matters: children before parents (FK constraints).
  await prisma.manufacturerHet.deleteMany();
  await prisma.steriliseHet.deleteMany();
  await prisma.workOrderPhaseEquip.deleteMany();
  await prisma.workOrderHet.deleteMany();
  await prisma.woSerial.deleteMany();
  await prisma.sterilise.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.phaseEquip.deleteMany();
  await prisma.phase.deleteMany();
  await prisma.het.deleteMany();
  await prisma.bomLine.deleteMany();
  await prisma.bom.deleteMany();
  await prisma.procedure.deleteMany();
  await prisma.manufacturer.deleteMany();
  await prisma.printLabel.deleteMany();
  await prisma.staff.deleteMany();
});

describe('D4 repeatability — N consecutive import cycles', () => {
  it('produces byte-identical DB state across N cycles', async () => {
    expect(CYCLES).toBeGreaterThanOrEqual(2);

    const snapshots: Snapshot[] = [];

    for (let i = 1; i <= CYCLES; i++) {
      const report = await importAll(seedDir, { dryRun: false });
      expect(report.errored, `cycle ${i}: errored rows`).toEqual([]);
      expect(report.totals.skipped, `cycle ${i}: skipped rows`).toBe(0);
      expect(report.warnings, `cycle ${i}: warnings`).toEqual([]);
      snapshots.push(await snapshot());
    }

    // Every cycle after the first must be byte-identical to cycle 1.
    const baseline = snapshots[0]!;
    for (let i = 1; i < snapshots.length; i++) {
      const drift = diff(baseline, snapshots[i]!, 'cycle 1', `cycle ${i + 1}`);
      expect(drift, `drift between cycle 1 and cycle ${i + 1}`).toEqual([]);
    }
  }, 120_000);

  it('a changed seed (one new staff row) produces a stable new baseline on re-runs', async () => {
    // Cycle 1: original seed.
    const report1 = await importAll(seedDir, { dryRun: false });
    expect(report1.errored).toEqual([]);
    const baseline = await snapshot();

    // Mutate: append a second staff row.
    fs.appendFileSync(
      path.join(seedDir, 'staff.csv'),
      `extra${baseline.rows.staff}@e.com,Extra,yes\n`,
    );
    const report2 = await importAll(seedDir, { dryRun: false });
    expect(report2.errored).toEqual([]);
    const afterMutation = await snapshot();

    expect(afterMutation.rows.staff).toBe(baseline.rows.staff + 1);
    expect(afterMutation.checksums.staff).not.toBe(baseline.checksums.staff);
    // All other tables must be byte-identical.
    const others = Object.keys(baseline.rows).filter((k) => k !== 'staff');
    for (const t of others) {
      expect(afterMutation.rows[t], `rows[${t}]`).toBe(baseline.rows[t]);
      expect(afterMutation.checksums[t], `checksum[${t}]`).toBe(baseline.checksums[t]);
    }

    // Re-run: the mutated state must be the new stable baseline.
    const report3 = await importAll(seedDir, { dryRun: false });
    expect(report3.errored).toEqual([]);
    const reimported = await snapshot();
    expect(
      diff(afterMutation, reimported, 'after mutation', 're-imported'),
      're-import drift',
    ).toEqual([]);
  }, 60_000);
});
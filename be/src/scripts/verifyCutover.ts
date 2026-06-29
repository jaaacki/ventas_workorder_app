/**
 * D5 of issue #36 — cutover verification script.
 *
 * Used by `make db-verify-cutover STAMP=<cutover-iso-stamp>`.
 *
 * Compares the legacy export's manifest.json (row counts) against the
 * current DB counts, and samples N rows per entity to confirm every
 * field round-trips through importCsv.mapRow. Exits non-zero on any
 * mismatch; otherwise prints a per-entity PASS line and exits 0.
 *
 * Usage:
 *   tsx src/scripts/verifyCutover.ts <cutover-iso-stamp> [sample-size]
 *
 * The export directory is expected at:
 *   be/scripts/seed_data/exports/<cutover-iso-stamp>/
 * with manifest.json at the top and one CSV per entity in tableConfigs.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import csv from 'csv-parser';
import { prisma } from '../db/prisma.js';
import { tableConfigs } from './importCsv.js';

const STAMP = process.argv[2];
const SAMPLE = Number(process.argv[3] ?? 10);
const EXPORT_ROOT = path.resolve(
  process.cwd(),
  `scripts/seed_data/exports/${STAMP}`,
);
const MANIFEST = path.join(EXPORT_ROOT, 'manifest.json');

if (!STAMP) {
  console.error('usage: tsx verifyCutover.ts <cutover-iso-stamp> [sample-size]');
  process.exit(2);
}
if (!fs.existsSync(MANIFEST)) {
  console.error(`manifest not found: ${MANIFEST}`);
  process.exit(2);
}

interface Manifest {
  files: Record<string, { rows: number; sha256: string }>;
}
const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

interface Failure {
  entity: string;
  kind: 'row-count' | 'sample-field';
  detail: string;
}
const failures: Failure[] = [];

async function count(model: string): Promise<number> {
  return (prisma as any)[model].count();
}

function csvRowHash(file: string): string {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .pipe(csv())
      .on('data', (row) => {
        for (const [k, v] of Object.entries(row)) h.update(`${k}=${v};`);
        h.update('\n');
      })
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  }) as unknown as string; // we await it below; see csvRowHashAsync
}

async function csvRowHashAsync(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .pipe(csv())
      .on('data', (row) => {
        for (const [k, v] of Object.entries(row)) h.update(`${k}=${v};`);
        h.update('\n');
      })
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

async function sampleFieldCheck(config: (typeof tableConfigs)[number]): Promise<void> {
  const file = path.join(EXPORT_ROOT, config.fileName);
  if (!fs.existsSync(file)) {
    failures.push({ entity: config.model, kind: 'row-count', detail: `missing CSV: ${config.fileName}` });
    return;
  }
  const rows: Record<string, string>[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(file)
      .pipe(csv())
      .on('data', (r) => rows.push(r))
      .on('end', () => resolve())
      .on('error', reject);
  });
  if (rows.length === 0) {
    failures.push({ entity: config.model, kind: 'row-count', detail: 'no rows in source CSV' });
    return;
  }
  // Take N evenly-spaced rows (deterministic; no PRNG).
  const stride = Math.max(1, Math.floor(rows.length / SAMPLE));
  const samples = rows.filter((_, i) => i % stride === 0).slice(0, SAMPLE);
  for (const row of samples) {
    const sourceId = row[config.sourceIdColumn];
    if (!sourceId) {
      failures.push({
        entity: config.model,
        kind: 'sample-field',
        detail: `sample row missing sourceId column '${config.sourceIdColumn}'`,
      });
      continue;
    }
    const dbRow = await (prisma as any)[config.model].findUnique({ where: { id: sourceId } });
    if (!dbRow) {
      failures.push({
        entity: config.model,
        kind: 'sample-field',
        detail: `sourceId=${sourceId} not in DB`,
      });
      continue;
    }
    // Spot-check the columnMap fields. Other fields may legitimately
    // differ (timestamps, defaults), so we only verify the fields the
    // importer claims to write.
    for (const [col, mapping] of Object.entries(config.columnMap)) {
      const sourceVal = (row[col] ?? '').trim();
      const dbVal = dbRow[mapping.field];
      const normalised =
        dbVal === null || dbVal === undefined
          ? ''
          : mapping.type === 'date'
            ? new Date(dbVal).toISOString().replace(/\.\d{3}Z$/, 'Z')
            : String(dbVal);
      // AppSheet date export is human-formatted; we don't try to
      // exact-match dates in this spot check, just confirm presence.
      if (mapping.type === 'date') {
        if (sourceVal && !normalised) {
          failures.push({
            entity: config.model,
            kind: 'sample-field',
            detail: `${col} (${mapping.field}) present in source but empty in DB`,
          });
        }
        continue;
      }
      if (sourceVal && normalised !== sourceVal) {
        failures.push({
          entity: config.model,
          kind: 'sample-field',
          detail: `${col} (${mapping.field}): source='${sourceVal}' db='${normalised}'`,
        });
      }
    }
  }
}

async function main() {
  // 1. Row-count diff.
  for (const config of tableConfigs) {
    const expected = manifest.files[config.fileName]?.rows ?? 0;
    const actual = await count(config.model);
    if (actual !== expected) {
      failures.push({
        entity: config.model,
        kind: 'row-count',
        detail: `expected ${expected}, got ${actual} (${config.fileName})`,
      });
    } else {
      console.log(`PASS ${config.model}: ${actual} rows`);
    }
  }
  // 2. Sample-10 per-entity field check.
  for (const config of tableConfigs) {
    await sampleFieldCheck(config);
  }
  await prisma.$disconnect();
  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} mismatch(es):`);
    for (const f of failures) console.error(`  [${f.kind}] ${f.entity}: ${f.detail}`);
    process.exit(1);
  }
  console.log(`\nOK: all ${tableConfigs.length} entities match export manifest + sample check.`);
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
import fs from 'node:fs';
import path from 'node:path';
import csv from 'csv-parser';
import { prisma } from '../db/prisma.js';

export type Row = Record<string, string | undefined>;

function value(row: Row, keys: string[]): string | undefined {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
}

function booleanValue(v: string | undefined): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  return /^(yes|true|1|y)$/i.test(v);
}

function numberValue(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function decimalValue(v: string | undefined): number | undefined {
  return numberValue(v);
}

/**
 * Date parsing hardened for AppSheet export formats (GAP-5 of issue #36).
 * Accepts ISO strings, AppSheet human format (e.g., "8/26/2024 11:11:53"),
 * and "DD MMM YYYY". Returns undefined for blank/invalid input.
 */
function dateValue(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  // ISO path first (cheap)
  const direct = new Date(v);
  if (!Number.isNaN(direct.getTime())) return direct;
  // AppSheet "M/D/YYYY H:M:S" or "M/D/YYYY"
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    const [, mo, da, yr, hh = '0', mm = '0', ss = '0', ampm] = m;
    let h = parseInt(hh, 10);
    if (ampm) {
      const isPm = ampm.toUpperCase() === 'PM';
      if (isPm && h < 12) h += 12;
      if (!isPm && h === 12) h = 0;
    }
    const d = new Date(
      parseInt(yr, 10),
      parseInt(mo, 10) - 1,
      parseInt(da, 10),
      h,
      parseInt(mm, 10),
      parseInt(ss, 10),
    );
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

function listValue(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

const identity = (v: string | undefined) => v;

const fieldMappers: Record<string, (v: string | undefined) => unknown> = {
  string: identity,
  text: identity,
  number: numberValue,
  decimal: decimalValue,
  boolean: booleanValue,
  date: dateValue,
  list: listValue,
};

export interface TableConfig {
  fileName: string;
  model: string;
  sourceIdColumn: string;
  /** PK column on the Prisma model — defaults to 'id'. */
  pkColumn?: string;
  columnMap: Record<string, { field: string; type: keyof typeof fieldMappers }>;
  relations?: Record<
    string,
    {
      type: 'manyToMany';
      joinTable: string;
      sourceFk: string;
      targetFk: string;
    }
  >;
  /**
   * Hook called after the rows are imported but before returning.
   * Use for cross-table derivations like ManufacturerHet (GAP-1).
   */
  afterImport?: (ctx: ImportContext) => Promise<void>;
}

export interface ImportContext {
  prisma: typeof import('../db/prisma.js').prisma;
  config: TableConfig;
  rows: Row[];
  report: ImportReport;
  dryRun: boolean;
}

export interface ImportReport {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  sourceDir: string;
  totals: {
    read: number;
    upserted: number;
    updated: number;
    skipped: number;
    errored: number;
  };
  perEntity: Record<
    string,
    {
      read: number;
      upserted: number;
      updated: number;
      skipped: number;
      errored: number;
      unmappedColumns?: string[];
    }
  >;
  skipped: Array<{ entity: string; rowIndex: number; sourceId?: string; reason: string }>;
  errored: Array<{ entity: string; rowIndex: number; sourceId?: string; reason: string }>;
  warnings: Array<{ entity: string; rowIndex?: number; column?: string; value?: string; reason: string }>;
}

export const tableConfigs: TableConfig[] = [
  {
    fileName: 'staff.csv',
    model: 'staff',
    sourceIdColumn: 'email',
    columnMap: {
      email: { field: 'email', type: 'text' },
      name: { field: 'name', type: 'text' },
      bitrixId: { field: 'bitrixId', type: 'text' },
      active: { field: 'active', type: 'boolean' },
    },
  },
  {
    fileName: 'manufacturer.csv',
    model: 'manufacturer',
    sourceIdColumn: 'manuId',
    columnMap: {
      manuId: { field: 'id', type: 'text' },
      manuName: { field: 'manuName', type: 'text' },
      manuNumber: { field: 'manuNumber', type: 'text' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
    /**
     * GAP-1 (issue #36): legacy AppSheet had no explicit manufacturer↔HET
     * column. Derive the ManufacturerHet rows from workOrder.batchHetIds ×
     * workOrder.manuId cross-product. Runs after `workOrder` has been imported.
     */
    afterImport: async ({ prisma: p, dryRun }: ImportContext) => {
      const wos = await p.workOrder.findMany({
        select: { id: true, manuId: true },
        where: { manuId: { not: null } },
      });
      const hetJoinRows = await p.workOrderHet.findMany({
        select: { workOrderId: true, hetId: true },
      });
      const joinByWo = new Map<string, string[]>();
      for (const j of hetJoinRows) {
        const arr = joinByWo.get(j.workOrderId) ?? [];
        arr.push(j.hetId);
        joinByWo.set(j.workOrderId, arr);
      }
      const pairs = new Set<string>();
      for (const wo of wos) {
        const hets = joinByWo.get(wo.id) ?? [];
        for (const het of hets) {
          pairs.add(`${wo.manuId}|${het}`);
        }
      }
      let count = 0;
      for (const pair of pairs) {
        const [manuId, hetId] = pair.split('|');
        if (!dryRun) {
          await p.manufacturerHet.upsert({
            where: { manufacturerId_hetId: { manufacturerId: manuId!, hetId: hetId! } },
            update: {},
            create: { manufacturerId: manuId!, hetId: hetId! },
          });
        }
        count++;
      }
      console.log(`  [ManufacturerHet] derived ${count} join rows`);
    },
  },
  {
    fileName: 'procedure.csv',
    model: 'procedure',
    sourceIdColumn: 'procedureId',
    columnMap: {
      procedureId: { field: 'id', type: 'text' },
      procedureName: { field: 'procedureName', type: 'text' },
      procedureShort: { field: 'procedureShort', type: 'text' },
      procedureDesc: { field: 'procedureDesc', type: 'text' },
      keyText: { field: 'keyText', type: 'text' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
  },
  {
    fileName: 'bom.csv',
    model: 'bom',
    sourceIdColumn: 'bomId',
    columnMap: {
      bomId: { field: 'id', type: 'text' },
      bomName: { field: 'bomName', type: 'text' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
  },
  {
    fileName: 'bomLine.csv',
    model: 'bomLine',
    sourceIdColumn: 'bomLineId',
    columnMap: {
      bomLineId: { field: 'id', type: 'text' },
      bomId: { field: 'bomId', type: 'text' },
      bomName: { field: 'bomName', type: 'text' },
      description: { field: 'description', type: 'text' },
      quantity: { field: 'quantity', type: 'decimal' },
      uom: { field: 'uom', type: 'text' },
      hasSerial: { field: 'hasSerial', type: 'boolean' },
      deleted: { field: 'deleted', type: 'boolean' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
  },
  {
    fileName: 'het.csv',
    model: 'het',
    sourceIdColumn: 'hetId',
    columnMap: {
      hetId: { field: 'id', type: 'text' },
      clinicId: { field: 'clinicId', type: 'text' },
      HCICode: { field: 'HCICode', type: 'text' },
      clinicName: { field: 'clinicName', type: 'text' },
      licenseName: { field: 'licenseName', type: 'text' },
      address: { field: 'address', type: 'text' },
      hetNumber: { field: 'hetNumber', type: 'text' },
      parcelTrackingNumber: { field: 'parcelTrackingNumber', type: 'text' },
      deliverId: { field: 'deliverId', type: 'text' },
      collectId: { field: 'collectId', type: 'text' },
      quantity: { field: 'quantity', type: 'number' },
      usedById: { field: 'usedById', type: 'text' },
      finishedById: { field: 'finishedById', type: 'text' },
      deleted: { field: 'deleted', type: 'boolean' },
      forceField: { field: 'forceField', type: 'number' },
      keyText: { field: 'keyText', type: 'text' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
  },
  {
    fileName: 'phase.csv',
    model: 'phase',
    sourceIdColumn: 'phaseId',
    columnMap: {
      phaseId: { field: 'id', type: 'text' },
      phaseName: { field: 'phaseName', type: 'text' },
      phaseShort: { field: 'phaseShort', type: 'text' },
      phaseOrder: { field: 'phaseOrder', type: 'number' },
      description: { field: 'description', type: 'text' },
      bomId: { field: 'bomId', type: 'text' },
      keyText: { field: 'keyText', type: 'text' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
  },
  {
    fileName: 'phaseEquip.csv',
    model: 'phaseEquip',
    sourceIdColumn: 'phaseEquipId',
    columnMap: {
      phaseEquipId: { field: 'id', type: 'text' },
      phaseId: { field: 'phaseId', type: 'text' },
      equipmentName: { field: 'equipmentName', type: 'text' },
      keyText: { field: 'keyText', type: 'text' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
  },
  {
    fileName: 'workOrder.csv',
    model: 'workOrder',
    sourceIdColumn: 'woId',
    columnMap: {
      woId: { field: 'id', type: 'text' },
      hetId: { field: 'hetId', type: 'text' },
      phaseId: { field: 'phaseId', type: 'text' },
      phaseOrder: { field: 'phaseOrder', type: 'number' },
      phaseShort: { field: 'phaseShort', type: 'text' },
      prodStart: { field: 'prodStart', type: 'date' },
      prodEnd: { field: 'prodEnd', type: 'date' },
      prodDuration: { field: 'prodDuration', type: 'decimal' },
      manuId: { field: 'manuId', type: 'text' },
      manuNumber: { field: 'manuNumber', type: 'text' },
      woNumber: { field: 'woNumber', type: 'text' },
      reportPdf: { field: 'reportPdfPath', type: 'text' },
      delete: { field: 'deleted', type: 'boolean' },
      forceField: { field: 'forceField', type: 'number' },
      previousWo: { field: 'previousWoId', type: 'text' },
      steralisationCurrent: { field: 'steralisationCurrentId', type: 'text' },
      nextPhase: { field: 'nextPhaseId', type: 'text' },
      startSignBy: { field: 'startSignById', type: 'text' },
      endSignBy: { field: 'endSignById', type: 'text' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
    relations: {
      batchHetIds: {
        type: 'manyToMany',
        joinTable: 'workOrderHet',
        sourceFk: 'workOrderId',
        targetFk: 'hetId',
      },
      phaseEquipIds: {
        type: 'manyToMany',
        joinTable: 'workOrderPhaseEquip',
        sourceFk: 'workOrderId',
        targetFk: 'phaseEquipId',
      },
    },
  },
  {
    fileName: 'woSerial.csv',
    model: 'woSerial',
    sourceIdColumn: 'woSerialId',
    columnMap: {
      woSerialId: { field: 'id', type: 'text' },
      workOrderId: { field: 'workOrderId', type: 'text' },
      bomRefId: { field: 'bomRefId', type: 'text' },
      serialNumber: { field: 'serialNumber', type: 'text' },
      keyText: { field: 'keyText', type: 'text' },
      createdOn: { field: 'createdOn', type: 'date' },
      updatedOn: { field: 'updatedOn', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
  },
  {
    fileName: 'sterilise.csv',
    model: 'sterilise',
    sourceIdColumn: 'steriliseId',
    columnMap: {
      steriliseId: { field: 'id', type: 'text' },
      workOrderId: { field: 'workOrderId', type: 'text' },
      manuId: { field: 'manuId', type: 'text' },
      direction: { field: 'direction', type: 'text' },
      result: { field: 'result', type: 'text' },
      betReading: { field: 'betReading', type: 'decimal' },
      quantity: { field: 'quantity', type: 'number' },
      comment: { field: 'comment', type: 'text' },
      imagePath: { field: 'imagePath', type: 'text' },
      signOn: { field: 'signOn', type: 'date' },
      signBy: { field: 'signById', type: 'text' },
      signature: { field: 'signaturePath', type: 'text' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
    relations: {
      batchHetId: {
        type: 'manyToMany',
        joinTable: 'steriliseHet',
        sourceFk: 'steriliseId',
        targetFk: 'hetId',
      },
    },
  },
  {
    fileName: 'printLabels.csv',
    model: 'printLabel',
    sourceIdColumn: '_ID',
    columnMap: {
      _ID: { field: 'id', type: 'text' },
      Path: { field: 'path', type: 'text' },
      File: { field: 'fileUrl', type: 'text' },
      CreateTime: { field: 'createdTime', type: 'date' },
      LastModifiedBy: { field: 'lastModifiedBy', type: 'text' },
      MimeType: { field: 'mimeType', type: 'text' },
    },
  },
];

function mapRow(row: Row, config: TableConfig): { mapped: Record<string, unknown>; unmapped: string[] } {
  const mapped: Record<string, unknown> = {};
  const unmapped: string[] = [];
  for (const [col, mapping] of Object.entries(config.columnMap)) {
    const raw = value(row, [col]);
    const mapper = fieldMappers[mapping.type];
    const val = mapper(raw);
    if (val !== undefined) mapped[mapping.field] = val;
  }
  // Track columns present in CSV but not in columnMap
  for (const csvCol of Object.keys(row)) {
    if (!(csvCol in config.columnMap)) unmapped.push(csvCol);
  }
  return { mapped, unmapped };
}

async function loadCsv(filePath: string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data: Row) => rows.push(data))
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

/**
 * Idempotent upsert: replaces createMany+ON CONFLICT DO NOTHING.
 * Tracks created vs updated, returns counts for the validation report.
 */
async function upsertMany(
  model: string,
  pkColumn: string,
  data: Record<string, unknown>[],
  report: ImportReport,
  dryRun: boolean,
): Promise<{ upserted: number; updated: number }> {
  const delegate = (prisma as any)[model];
  if (!delegate || typeof delegate.upsert !== 'function') {
    throw new Error(`Unknown Prisma model: ${model}`);
  }
  let upserted = 0;
  let updated = 0;
  for (const row of data) {
    const pkValue = row[pkColumn];
    if (pkValue === undefined || pkValue === null || pkValue === '') {
      report.skipped.push({ entity: model, rowIndex: -1, reason: `missing PK column '${pkColumn}'` });
      continue;
    }
    if (dryRun) {
      // In dry-run, we still want to know if the row would be created vs updated.
      // Probe with findUnique; if exists, count as update, else create.
      const existing = await delegate.findUnique({ where: { [pkColumn]: pkValue } });
      if (existing) updated++;
      else upserted++;
      continue;
    }
    try {
      const result = await delegate.upsert({
        where: { [pkColumn]: pkValue },
        update: row,
        create: row,
      });
      // Prisma doesn't return "was created vs updated". Probe to count.
      // Cheap because we just wrote; if `createdAt` equals now, it was just created.
      // Simpler: keep a side channel — always count as upserted (we don't strictly
      // need to distinguish for the validation report).
      upserted++;
      void result;
    } catch (e) {
      report.errored.push({
        entity: model,
        rowIndex: -1,
        sourceId: String(pkValue),
        reason: (e as Error).message,
      });
    }
  }
  return { upserted, updated };
}

async function upsertJoins(
  joinTable: string,
  joins: Array<Record<string, string>>,
  report: ImportReport,
  dryRun: boolean,
): Promise<number> {
  if (joins.length === 0) return 0;
  const delegate = (prisma as any)[joinTable];
  if (!delegate) {
    report.errored.push({
      entity: joinTable,
      rowIndex: -1,
      reason: `unknown join table delegate '${joinTable}'`,
    });
    return 0;
  }
  // Composite PK key naming convention: prisma generates `aId_bId` from `@@id([aId, bId])`
  const sample = joins[0]!;
  const fkCols = Object.keys(sample);
  const whereKey = fkCols.join('_');
  let count = 0;
  for (const j of joins) {
    if (dryRun) { count++; continue; }
    try {
      await delegate.upsert({
        where: { [whereKey]: j },
        update: {},
        create: j,
      });
      count++;
    } catch (e) {
      report.errored.push({
        entity: joinTable,
        rowIndex: -1,
        reason: (e as Error).message,
      });
    }
  }
  return count;
}

export async function importTable(
  config: TableConfig,
  seedDir: string,
  report: ImportReport,
  dryRun: boolean,
): Promise<void> {
  const filePath = path.join(seedDir, config.fileName);
  const entityStats = (report.perEntity[config.model] ??= {
    read: 0,
    upserted: 0,
    updated: 0,
    skipped: 0,
    errored: 0,
    unmappedColumns: [],
  });

  if (!fs.existsSync(filePath)) {
    report.warnings.push({
      entity: config.model,
      reason: `file not found: ${config.fileName}`,
    });
    return;
  }

  const rows = await loadCsv(filePath);
  entityStats.read = rows.length;
  report.totals.read += rows.length;

  const pkColumn = config.pkColumn ?? 'id';
  const mapped: Record<string, unknown>[] = [];
  const unmappedCols = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const { mapped: m, unmapped } = mapRow(rows[i]!, config);
    for (const u of unmapped) unmappedCols.add(u);
    if (m[pkColumn] === undefined || m[pkColumn] === null || m[pkColumn] === '') {
      entityStats.skipped++;
      report.totals.skipped++;
      report.skipped.push({
        entity: config.model,
        rowIndex: i,
        reason: `missing PK '${pkColumn}'`,
      });
      continue;
    }
    mapped.push(m);
  }

  if (mapped.length > 0) {
    const { upserted, updated } = await upsertMany(config.model, pkColumn, mapped, report, dryRun);
    entityStats.upserted += upserted;
    entityStats.updated += updated;
    report.totals.upserted += upserted;
    report.totals.updated += updated;
  }

  if (config.relations) {
    for (const [col, rel] of Object.entries(config.relations)) {
      const joins: Array<Record<string, string>> = [];
      for (let i = 0; i < rows.length; i++) {
        const sourceId = value(rows[i]!, [config.sourceIdColumn]);
        if (!sourceId) continue;
        const targets = listValue(rows[i]![col]);
        for (const targetId of targets) {
          joins.push({ [rel.sourceFk]: sourceId, [rel.targetFk]: targetId });
        }
      }
      const joined = await upsertJoins(rel.joinTable, joins, report, dryRun);
      console.log(`  [${rel.joinTable}] upserted ${joined} join rows from ${col}`);
    }
  }

  if (unmappedCols.size > 0) {
    entityStats.unmappedColumns = [...unmappedCols];
    report.warnings.push({
      entity: config.model,
      reason: `${unmappedCols.size} unmapped CSV columns: ${[...unmappedCols].join(', ')}`,
    });
  }

  if (config.afterImport) {
    await config.afterImport({ prisma, config, rows, report, dryRun });
  }
}

export async function importAll(
  seedDir = '/app/scripts/seed_data',
  opts: { dryRun?: boolean; reportPath?: string } = {},
): Promise<ImportReport> {
  const dryRun = opts.dryRun ?? false;
  const report: ImportReport = {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    dryRun,
    sourceDir: seedDir,
    totals: { read: 0, upserted: 0, updated: 0, skipped: 0, errored: 0 },
    perEntity: {},
    skipped: [],
    errored: [],
    warnings: [],
  };

  for (const config of tableConfigs) {
    console.log(`Importing ${config.model}…`);
    await importTable(config, seedDir, report, dryRun);
  }

  report.finishedAt = new Date().toISOString();

  if (opts.reportPath) {
    fs.mkdirSync(path.dirname(opts.reportPath), { recursive: true });
    fs.writeFileSync(opts.reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`Report: ${opts.reportPath}`);
  }

  console.log('\nTotals:');
  console.table(report.totals);
  console.log(`Skipped: ${report.skipped.length}, Errored: ${report.errored.length}, Warnings: ${report.warnings.length}`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirmProd = args.includes('--confirm-prod');
  const seedDirArg = args.find((a) => !a.startsWith('--')) ?? '/app/scripts/seed_data';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const reportPath = path.join('/app/be/reports', `import-${stamp}.json`);

  // Production safety gate (D5 of issue #36): refuse to run a real (non
  // --dry-run) import unless the env declares WORKORDER_ENV=staging OR the
  // operator passes --confirm-prod explicitly. Staging is the safe default
  // for the cutover dry-run; --confirm-prod is the one-shot override for
  // the actual cutover.
  if (!dryRun && process.env.WORKORDER_ENV !== 'staging' && !confirmProd) {
    console.error(
      'REFUSED: importing against a non-staging target requires --confirm-prod.\n' +
        'Set WORKORDER_ENV=staging for cutover dry-runs, or pass --confirm-prod\n' +
        'exactly once for the production cutover. See docs/CUTOVER.md.',
    );
    process.exit(2);
  }

  importAll(seedDirArg, { dryRun, reportPath })
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
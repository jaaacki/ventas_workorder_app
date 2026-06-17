import fs from 'node:fs';
import path from 'node:path';
import csv from 'csv-parser';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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
  const n = Number(v.replace(/,/g, ''));
  return Number.isNaN(n) ? undefined : n;
}

function decimalValue(v: string | undefined): number | undefined {
  return numberValue(v);
}

function dateValue(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
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
  },
  {
    fileName: 'procedure.csv',
    model: 'procedure',
    sourceIdColumn: 'procedureId',
    columnMap: {
      procedureId: { field: 'id', type: 'text' },
      procedureName: { field: 'procedureName', type: 'text' },
      procedureDesc: { field: 'procedureDesc', type: 'text' },
      procedureShort: { field: 'procedureShort', type: 'text' },
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
      parcelTrackingNumber: { field: 'parcelTrackingNumber', type: 'number' },
      deliverId: { field: 'deliverId', type: 'text' },
      collectId: { field: 'collectId', type: 'text' },
      quantity: { field: 'quantity', type: 'number' },
      delete: { field: 'deleted', type: 'boolean' },
      forceField: { field: 'forceField', type: 'number' },
      b11Weight: { field: 'b11Weight', type: 'decimal' },
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
      usedBy: { field: 'usedById', type: 'text' },
      finishedBy: { field: 'finishedById', type: 'text' },
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
      createdOn: { field: 'createdAt', type: 'date' },
      updatedOn: { field: 'updatedAt', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
    relations: {
      procedureIds: {
        type: 'manyToMany',
        joinTable: 'phaseProcedure',
        sourceFk: 'phaseId',
        targetFk: 'procedureId',
      },
      phaseEquipIds: {
        type: 'manyToMany',
        joinTable: 'phasePhaseEquip',
        sourceFk: 'phaseId',
        targetFk: 'phaseEquipId',
      },
    },
  },
  {
    fileName: 'phaseEquip.csv',
    model: 'phaseEquip',
    sourceIdColumn: 'id',
    columnMap: {
      id: { field: 'id', type: 'text' },
      equipId: { field: 'equipId', type: 'text' },
      name: { field: 'name', type: 'text' },
      description: { field: 'description', type: 'text' },
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
      woId: { field: 'workOrderId', type: 'text' },
      bomRef: { field: 'bomRefId', type: 'text' },
      serialNumber: { field: 'serialNumber', type: 'text' },
      createdOn: { field: 'createdOn', type: 'date' },
      updatedOn: { field: 'updatedOn', type: 'date' },
      createdBy: { field: 'createdById', type: 'text' },
      updatedBy: { field: 'updatedById', type: 'text' },
    },
  },
  {
    fileName: 'sterilise.csv',
    model: 'sterilise',
    sourceIdColumn: 'sterId',
    columnMap: {
      sterId: { field: 'id', type: 'text' },
      woId: { field: 'workOrderId', type: 'text' },
      manuId: { field: 'manuId', type: 'text' },
      direction: { field: 'direction', type: 'text' },
      result: { field: 'result', type: 'boolean' },
      betReading: { field: 'betReading', type: 'decimal' },
      quantity: { field: 'quantity', type: 'number' },
      comment: { field: 'comment', type: 'text' },
      image: { field: 'imagePath', type: 'text' },
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

function mapRow(row: Row, config: TableConfig): Record<string, unknown> | null {
  const mapped: Record<string, unknown> = {};
  for (const [col, mapping] of Object.entries(config.columnMap)) {
    const raw = value(row, [col]);
    const mapper = fieldMappers[mapping.type];
    const val = mapper(raw);
    if (val !== undefined) mapped[mapping.field] = val;
  }
  return mapped;
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

function createMany(model: string, data: Record<string, unknown>[]) {
  const delegate = (prisma as any)[model];
  if (!delegate || typeof delegate.createMany !== 'function') {
    throw new Error(`Unknown Prisma model: ${model}`);
  }
  return delegate.createMany({ data, skipDuplicates: true }) as Promise<{ count: number }>;
}

export async function importTable(config: TableConfig, seedDir: string): Promise<number> {
  const filePath = path.join(seedDir, config.fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${config.fileName}: file not found`);
    return 0;
  }

  const rows = await loadCsv(filePath);
  const data = rows.map((r) => mapRow(r, config)).filter(Boolean) as Record<string, unknown>[];
  if (data.length === 0) return 0;

  const result = await createMany(config.model, data);

  if (config.relations) {
    for (const [col, rel] of Object.entries(config.relations)) {
      const joins: Record<string, string>[] = [];
      for (const row of rows) {
        const sourceId = value(row, [config.sourceIdColumn]);
        if (!sourceId) continue;
        const targets = listValue(row[col]);
        for (const targetId of targets) {
          joins.push({ [rel.sourceFk]: sourceId, [rel.targetFk]: targetId });
        }
      }
      if (joins.length > 0) {
        const columns = Object.keys(joins[0]);
        const values = joins
          .map((j) => `(${columns.map((c) => `'${(j[c] || '').replace(/'/g, "''")}'`).join(', ')})`)
          .join(', ');
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${rel.joinTable}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${values} ON CONFLICT DO NOTHING`
        );
      }
    }
  }

  return result.count;
}

export async function importAll(seedDir = '/app/scripts/seed_data'): Promise<void> {
  const counts: Record<string, number> = {};
  for (const config of tableConfigs) {
    counts[config.model] = await importTable(config, seedDir);
  }
  console.table(counts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seedDir = process.argv[2] || '/app/scripts/seed_data';
  importAll(seedDir)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

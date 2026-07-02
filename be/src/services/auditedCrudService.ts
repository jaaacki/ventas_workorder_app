import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import type { JwtPayload } from '../plugins/auth.js';
import { tenantIdOrDefault } from './tenant.js';
import { listAuditLogs, writeAuditLog } from './auditLogService.js';

export class CrudValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrudValidationError';
  }
}

export class CrudConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrudConflictError';
  }
}

type PrismaDelegate = {
  findMany(args: unknown): Promise<unknown[]>;
  findFirst(args: unknown): Promise<unknown | null>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

type ReferenceValidator = (input: {
  tenantId: string;
  id?: string;
  payload: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
}) => Promise<void>;

const softDeletedDelegates = new Set<keyof typeof prisma>([
  'bomLine',
  'collectionOrder',
  'collectionPoint',
  'collectionReceipt',
  'collectionReceiptLine',
  'collectionUnit',
  'collectionUnitFulfilment',
  'het',
  'inventoryBalance',
  'inventoryGenealogy',
  'inventoryImportReport',
  'inventoryLocation',
  'inventoryLot',
  'inventorySku',
  'inventoryTransaction',
  'issuanceOrder',
  'issuanceOrderLine',
  'procurementImportReport',
  'supplyEntity',
  'workOrder',
  'workOrderInventoryConsumption',
]);

export interface CrudResourceConfig {
  resource: string;
  entityType: string;
  delegate: keyof typeof prisma;
  mutableFields: readonly string[];
  searchableFields?: readonly string[];
  defaultOrderBy?: unknown;
  include?: unknown;
  select?: unknown;
  archiveOnly?: boolean;
  validators?: readonly ReferenceValidator[];
}

export interface CrudListOptions {
  tenantId?: string | null;
  q?: string;
  take?: number;
  includeDeleted?: boolean;
  filters?: Record<string, unknown>;
}

function delegateFor(config: CrudResourceConfig): PrismaDelegate {
  return prisma[config.delegate] as PrismaDelegate;
}

function stripUndefined(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export function pickMutable(config: CrudResourceConfig, payload: Record<string, unknown>) {
  const allowed = new Set(config.mutableFields);
  return stripUndefined(Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key))));
}

function listWhere(config: CrudResourceConfig, options: CrudListOptions, tenantId: string) {
  const q = options.q?.trim();
  const filters = stripUndefined(options.filters ?? {});
  return {
    tenantId,
    ...(options.includeDeleted ? {} : { deleted: false }),
    ...filters,
    ...(q && config.searchableFields?.length
      ? {
          OR: config.searchableFields.map((field) => ({
            [field]: { contains: q, mode: 'insensitive' },
          })),
        }
      : {}),
  };
}

function relationShape(config: CrudResourceConfig) {
  if (config.include) return { include: config.include };
  if (config.select) return { select: config.select };
  return {};
}

async function runValidators(
  config: CrudResourceConfig,
  input: { tenantId: string; id?: string; payload: Record<string, unknown>; existing?: Record<string, unknown> | null },
) {
  for (const validator of config.validators ?? []) {
    await validator(input);
  }
}

export async function listCrud(config: CrudResourceConfig, options: CrudListOptions): Promise<any[]> {
  const tenantId = tenantIdOrDefault(options.tenantId);
  return delegateFor(config).findMany({
    where: listWhere(config, options, tenantId),
    ...relationShape(config),
    orderBy: config.defaultOrderBy ?? [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: options.take ?? 200,
  });
}

export async function getCrud(config: CrudResourceConfig, id: string, tenantId?: string | null, includeDeleted = false): Promise<any | null> {
  return delegateFor(config).findFirst({
    where: {
      id,
      tenantId: tenantIdOrDefault(tenantId),
      ...(includeDeleted ? {} : { deleted: false }),
    },
    ...relationShape(config),
  });
}

export async function createCrud(config: CrudResourceConfig, input: { tenantId?: string | null; actor: JwtPayload; payload: Record<string, unknown> }): Promise<any> {
  const tenantId = tenantIdOrDefault(input.tenantId);
  const payload = pickMutable(config, input.payload);
  if (!Object.keys(payload).length) throw new CrudValidationError('At least one mutable field is required');
  await runValidators(config, { tenantId, payload });

  const created = await delegateFor(config).create({
    data: {
      ...payload,
      tenantId,
      createdById: input.actor.id,
      updatedById: input.actor.id,
    },
    ...relationShape(config),
  });

  await writeAuditLog({
    tenantId,
    actor: input.actor,
    entityType: config.entityType,
    entityId: (created as { id: string }).id,
    action: 'create',
    after: created,
  });

  return created;
}

export async function updateCrud(config: CrudResourceConfig, input: { id: string; tenantId?: string | null; actor: JwtPayload; payload: Record<string, unknown> }): Promise<any | null> {
  const tenantId = tenantIdOrDefault(input.tenantId);
  const existing = (await getCrud(config, input.id, tenantId, true)) as Record<string, unknown> | null;
  if (!existing) return null;
  if (existing.deleted) throw new CrudConflictError('Archived records must be restored before update');

  const payload = pickMutable(config, input.payload);
  if (!Object.keys(payload).length) throw new CrudValidationError('At least one mutable field is required');
  await runValidators(config, { tenantId, id: input.id, payload, existing });

  const updated = await delegateFor(config).update({
    where: { id: input.id },
    data: {
      ...payload,
      updatedById: input.actor.id,
    },
    ...relationShape(config),
  });

  await writeAuditLog({
    tenantId,
    actor: input.actor,
    entityType: config.entityType,
    entityId: input.id,
    action: 'update',
    before: existing,
    after: updated,
  });

  return updated;
}

export async function archiveCrud(config: CrudResourceConfig, input: { id: string; tenantId?: string | null; actor: JwtPayload }): Promise<any | null> {
  const tenantId = tenantIdOrDefault(input.tenantId);
  const existing = (await getCrud(config, input.id, tenantId, true)) as Record<string, unknown> | null;
  if (!existing) return null;
  if (existing.deleted) return existing;

  const archived = await delegateFor(config).update({
    where: { id: input.id },
    data: {
      deleted: true,
      deletedAt: new Date(),
      deletedById: input.actor.id,
      updatedById: input.actor.id,
    },
    ...relationShape(config),
  });

  await writeAuditLog({
    tenantId,
    actor: input.actor,
    entityType: config.entityType,
    entityId: input.id,
    action: config.archiveOnly ? 'archive' : 'delete',
    before: existing,
    after: archived,
    metadata: { softDelete: true, archiveOnly: Boolean(config.archiveOnly) },
  });

  return archived;
}

export async function restoreCrud(config: CrudResourceConfig, input: { id: string; tenantId?: string | null; actor: JwtPayload }): Promise<any | null> {
  const tenantId = tenantIdOrDefault(input.tenantId);
  const existing = (await getCrud(config, input.id, tenantId, true)) as Record<string, unknown> | null;
  if (!existing) return null;
  if (!existing.deleted) return existing;

  const restored = await delegateFor(config).update({
    where: { id: input.id },
    data: {
      deleted: false,
      deletedAt: null,
      deletedById: null,
      updatedById: input.actor.id,
    },
    ...relationShape(config),
  });

  await writeAuditLog({
    tenantId,
    actor: input.actor,
    entityType: config.entityType,
    entityId: input.id,
    action: 'restore',
    before: existing,
    after: restored,
  });

  return restored;
}

export async function listCrudAudit(config: CrudResourceConfig, input: { id: string; tenantId?: string | null }) {
  return listAuditLogs({ tenantId: input.tenantId, entityType: config.entityType, entityId: input.id });
}

export async function requireSameTenant(delegate: keyof typeof prisma, id: unknown, tenantId: string, label: string) {
  if (id === null || id === undefined || id === '') return;
  const where = {
    id: String(id),
    tenantId,
    ...(softDeletedDelegates.has(delegate) ? { deleted: false } : {}),
  };
  const row = await (prisma[delegate] as PrismaDelegate).findFirst({
    where,
    select: { id: true },
  });
  if (!row) throw new CrudValidationError(`${label} must exist in the same tenant`);
}

export function decimalFromUnknown(value: unknown) {
  if (value === null || value === undefined || value === '') return value;
  return new Prisma.Decimal(String(value));
}

import { inventoryTypeSchema, inventoryTypeValues } from '@workorder/shared';
import { prisma } from '../db/prisma.js';
import type { JwtPayload } from '../plugins/auth.js';
import {
  CrudValidationError,
  archiveCrud,
  createCrud,
  getCrud,
  listCrud,
  listCrudAudit,
  requireSameTenant,
  restoreCrud,
  updateCrud,
  type CrudListOptions,
  type CrudResourceConfig,
} from './auditedCrudService.js';
import { tenantIdOrDefault } from './tenant.js';

const inventoryLotStatusValues = ['available', 'reserved', 'consumed', 'quarantined', 'released', 'scrapped'] as const;
const inventoryLotStatusSet = new Set<string>(inventoryLotStatusValues);
const createProvenanceFields: Partial<Record<InventoryCrudResourceKey, readonly string[]>> = {
  transactions: ['occurredAt', 'actor'],
};

function hasOperationalValue(value: unknown) {
  if (value === null || value === undefined) return false;
  return typeof value !== 'string' || value.trim() !== '';
}

function rejectClientProvenanceFields(key: InventoryCrudResourceKey, payload: Record<string, unknown>) {
  const protectedFields = createProvenanceFields[key] ?? [];
  const supplied = protectedFields.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
  if (supplied.length) {
    throw new CrudValidationError(`Server-managed field${supplied.length === 1 ? '' : 's'} cannot be supplied: ${supplied.join(', ')}`);
  }
}

// Reject inventoryType values outside the closed HET|FINISHED_GOOD set on the
// API write path. Legacy rows are imported via prisma directly (bypassing these
// validators), so this only constrains records created/updated through the API.
function validateInventoryType(input: { payload: Record<string, unknown> }): Promise<void> {
  if (
    input.payload.inventoryType !== undefined &&
    !inventoryTypeSchema.safeParse(input.payload.inventoryType).success
  ) {
    throw new CrudValidationError(`inventoryType must be one of: ${inventoryTypeValues.join(', ')}`);
  }
  return Promise.resolve();
}

function validateInventoryLotPayload(input: {
  payload: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
}): Promise<void> {
  if (input.payload.status !== undefined && !inventoryLotStatusSet.has(String(input.payload.status))) {
    throw new CrudValidationError(`status must be one of: ${inventoryLotStatusValues.join(', ')}`);
  }

  if (input.existing) return Promise.resolve();
  if (!hasOperationalValue(input.payload.inventorySkuId)) {
    throw new CrudValidationError('Inventory lot requires an inventory SKU');
  }
  const hasIdentifier = hasOperationalValue(input.payload.lotNumber) ||
    hasOperationalValue(input.payload.hetId) ||
    hasOperationalValue(input.payload.collectionUnitId);
  if (!hasIdentifier) {
    throw new CrudValidationError('Inventory lot requires a lot number, HET, or collection unit');
  }
  if (!hasOperationalValue(input.payload.quantityInitial) && !hasOperationalValue(input.payload.quantityCurrent)) {
    throw new CrudValidationError('Inventory lot requires an initial or current quantity');
  }
  return Promise.resolve();
}

function payloadWithCreateProvenance(
  key: InventoryCrudResourceKey,
  input: { actor: JwtPayload; payload: Record<string, unknown> },
) {
  const payload = { ...input.payload };
  if (key === 'transactions') {
    payload.occurredAt = new Date();
    payload.actor = input.actor.id;
  }
  return payload;
}

async function validateLocationParent(input: {
  tenantId: string;
  id?: string;
  payload: Record<string, unknown>;
}) {
  const parentLocationId = input.payload.parentLocationId;
  if (parentLocationId === null || parentLocationId === undefined || parentLocationId === '') return;
  const parentId = String(parentLocationId);
  if (input.id && parentId === input.id) {
    throw new CrudValidationError('Location cannot be its own parent');
  }
  await requireSameTenant('inventoryLocation', parentId, input.tenantId, 'Parent location');

  const seen = new Set<string>(input.id ? [input.id] : []);
  let currentId: string | null = parentId;
  while (currentId) {
    if (seen.has(currentId)) {
      throw new CrudValidationError('Location parent cycle is not allowed');
    }
    seen.add(currentId);
    const current: { parentLocationId: string | null } | null = await prisma.inventoryLocation.findFirst({
      where: { id: currentId, tenantId: input.tenantId },
      select: { parentLocationId: true },
    });
    currentId = current?.parentLocationId ?? null;
  }
}

async function validateGenealogy(input: { tenantId: string; payload: Record<string, unknown> }) {
  const parentId = input.payload.parentInventoryLotId;
  const childId = input.payload.childInventoryLotId;
  if (parentId && childId && String(parentId) === String(childId)) {
    throw new CrudValidationError('Genealogy parent and child lots must be different');
  }
  await requireSameTenant('inventoryLot', parentId, input.tenantId, 'Parent lot');
  await requireSameTenant('inventoryLot', childId, input.tenantId, 'Child lot');
}

async function validateTransactionCorrection(input: {
  payload: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
}) {
  if (!input.existing) return;
  const movementFields = [
    'inventorySkuId',
    'inventoryLotId',
    'transactionType',
    'direction',
    'quantity',
    'uom',
    'fromLocationId',
    'toLocationId',
    'occurredAt',
  ];
  const changesMovement = movementFields.some((field) => Object.prototype.hasOwnProperty.call(input.payload, field));
  if (!changesMovement) return;
  const reason = typeof input.payload.reason === 'string' ? input.payload.reason.trim() : '';
  const remarks = typeof input.payload.remarks === 'string' ? input.payload.remarks.trim() : '';
  if (!reason && !remarks) {
    throw new CrudValidationError('Inventory transaction corrections require a reason or remarks');
  }
}

export const inventoryCrudResources = {
  references: {
    resource: 'inventory.reference',
    entityType: 'InventoryReference',
    delegate: 'inventoryReference',
    mutableFields: ['refType', 'name', 'shortCode', 'description', 'sourceSystem', 'legacyRaw'],
    createRequiredFields: ['refType', 'name'],
    searchableFields: ['id', 'refType', 'name', 'shortCode', 'description'],
    defaultOrderBy: [{ refType: 'asc' }, { name: 'asc' }],
  },
  locations: {
    resource: 'inventory.location',
    entityType: 'InventoryLocation',
    delegate: 'inventoryLocation',
    mutableFields: ['locationType', 'name', 'parentLocationId', 'description', 'imagePath', 'sourceSystem', 'legacyRaw'],
    createRequiredFields: ['locationType', 'name'],
    searchableFields: ['id', 'locationType', 'name', 'description'],
    defaultOrderBy: [{ locationType: 'asc' }, { name: 'asc' }],
    validators: [validateLocationParent],
  },
  skus: {
    resource: 'inventory.sku',
    entityType: 'InventorySku',
    delegate: 'inventorySku',
    mutableFields: [
      'sku',
      'description',
      'category',
      'brand',
      'size',
      'colour',
      'uom',
      'packQuantity',
      'threshold',
      'serialisedMode',
      'qrImagePath',
      'mediaUrl',
      'qrPrintPath',
      'sourceSystem',
      'legacyRaw',
    ],
    createRequiredFields: ['sku'],
    searchableFields: ['id', 'sku', 'description', 'category', 'brand'],
    defaultOrderBy: [{ description: 'asc' }, { id: 'asc' }],
  },
  lots: {
    resource: 'inventory.lot',
    entityType: 'InventoryLot',
    delegate: 'inventoryLot',
    mutableFields: [
      'inventorySkuId',
      'lotNumber',
      'inventoryType',
      'status',
      'quantityInitial',
      'quantityCurrent',
      'uom',
      'currentLocationId',
      'collectionUnitId',
      'hetId',
      'workOrderId',
      'sourceSystem',
      'legacyItemSerialId',
      'legacyCheckInOutId',
      'legacyHetId',
      'legacyRaw',
    ],
    createRequiredFields: ['inventorySkuId', 'inventoryType', 'status'],
    searchableFields: ['id', 'lotNumber', 'legacyItemSerialId', 'legacyHetId'],
    defaultOrderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: { inventorySku: true, currentLocation: true },
    validators: [
      validateInventoryType,
      validateInventoryLotPayload,
      ({ tenantId, payload }) => requireSameTenant('inventorySku', payload.inventorySkuId, tenantId, 'Inventory SKU'),
      ({ tenantId, payload }) => requireSameTenant('inventoryLocation', payload.currentLocationId, tenantId, 'Current location'),
      ({ tenantId, payload }) => requireSameTenant('collectionUnit', payload.collectionUnitId, tenantId, 'Collection unit'),
      ({ tenantId, payload }) => requireSameTenant('het', payload.hetId, tenantId, 'HET'),
      ({ tenantId, payload }) => requireSameTenant('workOrder', payload.workOrderId, tenantId, 'Work order'),
    ],
  },
  transactions: {
    resource: 'inventory.transaction',
    entityType: 'InventoryTransaction',
    delegate: 'inventoryTransaction',
    mutableFields: [
      'inventorySkuId',
      'inventoryLotId',
      'transactionType',
      'direction',
      'reason',
      'quantity',
      'uom',
      'fromLocationId',
      'toLocationId',
      'workOrderId',
      'occurredAt',
      'actor',
      'signaturePath',
      'remarks',
      'legacyRefNumber',
      'legacyRefNumberOut',
      'sourceSystem',
      'legacyRaw',
    ],
    createRequiredFields: ['transactionType'],
    searchableFields: ['id', 'reason', 'legacyRefNumber', 'legacyRefNumberOut', 'actor', 'remarks'],
    defaultOrderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    include: { inventorySku: true, inventoryLot: true, fromLocation: true, toLocation: true },
    validators: [
      validateTransactionCorrection,
      ({ tenantId, payload }) => requireSameTenant('inventorySku', payload.inventorySkuId, tenantId, 'Inventory SKU'),
      ({ tenantId, payload }) => requireSameTenant('inventoryLot', payload.inventoryLotId, tenantId, 'Inventory lot'),
      ({ tenantId, payload }) => requireSameTenant('inventoryLocation', payload.fromLocationId, tenantId, 'From location'),
      ({ tenantId, payload }) => requireSameTenant('inventoryLocation', payload.toLocationId, tenantId, 'To location'),
      ({ tenantId, payload }) => requireSameTenant('workOrder', payload.workOrderId, tenantId, 'Work order'),
    ],
  },
  balances: {
    resource: 'inventory.balance',
    entityType: 'InventoryBalance',
    delegate: 'inventoryBalance',
    mutableFields: ['inventorySkuId', 'inventoryLotId', 'inventoryLocationId', 'quantity', 'sourceSystem', 'legacyRaw'],
    createRequiredFields: ['inventorySkuId'],
    searchableFields: ['id', 'inventorySkuId', 'inventoryLotId', 'inventoryLocationId'],
    defaultOrderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: { inventorySku: true, inventoryLot: true, inventoryLocation: true },
    validators: [
      ({ tenantId, payload }) => requireSameTenant('inventorySku', payload.inventorySkuId, tenantId, 'Inventory SKU'),
      ({ tenantId, payload }) => requireSameTenant('inventoryLot', payload.inventoryLotId, tenantId, 'Inventory lot'),
      ({ tenantId, payload }) => requireSameTenant('inventoryLocation', payload.inventoryLocationId, tenantId, 'Inventory location'),
    ],
  },
  genealogy: {
    resource: 'inventory.genealogy',
    entityType: 'InventoryGenealogy',
    delegate: 'inventoryGenealogy',
    mutableFields: ['parentInventoryLotId', 'childInventoryLotId', 'relationshipType', 'workOrderId', 'phaseId', 'sourceSystem', 'legacyRaw'],
    createRequiredFields: ['parentInventoryLotId', 'childInventoryLotId', 'relationshipType'],
    searchableFields: ['id', 'parentInventoryLotId', 'childInventoryLotId', 'relationshipType', 'workOrderId', 'phaseId'],
    defaultOrderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: { parentInventoryLot: { include: { inventorySku: true } }, childInventoryLot: { include: { inventorySku: true } } },
    validators: [
      validateGenealogy,
      ({ tenantId, payload }) => requireSameTenant('workOrder', payload.workOrderId, tenantId, 'Work order'),
      ({ tenantId, payload }) => requireSameTenant('phase', payload.phaseId, tenantId, 'Phase'),
    ],
  },
  workOrderConsumptions: {
    resource: 'inventory.workOrderConsumption',
    entityType: 'WorkOrderInventoryConsumption',
    delegate: 'workOrderInventoryConsumption',
    mutableFields: ['workOrderId', 'inventoryLotId', 'inventorySkuId', 'bomLineId', 'quantity', 'uom', 'sourceSystem', 'legacyRaw'],
    createRequiredFields: ['workOrderId'],
    searchableFields: ['id', 'workOrderId', 'inventoryLotId', 'inventorySkuId', 'bomLineId'],
    defaultOrderBy: [{ createdAt: 'desc' }],
    include: { inventoryLot: true },
    validators: [
      ({ tenantId, payload }) => requireSameTenant('workOrder', payload.workOrderId, tenantId, 'Work order'),
      ({ tenantId, payload }) => requireSameTenant('inventoryLot', payload.inventoryLotId, tenantId, 'Inventory lot'),
      ({ tenantId, payload }) => requireSameTenant('inventorySku', payload.inventorySkuId, tenantId, 'Inventory SKU'),
      ({ tenantId, payload }) => requireSameTenant('bomLine', payload.bomLineId, tenantId, 'BOM line'),
    ],
  },
  importReports: {
    resource: 'inventory.importReport',
    entityType: 'InventoryImportReport',
    delegate: 'inventoryImportReport',
    mutableFields: [],
    searchableFields: ['id', 'source'],
    defaultOrderBy: [{ startedAt: 'desc' }],
    archiveOnly: true,
  },
} satisfies Record<string, CrudResourceConfig>;

export type InventoryCrudResourceKey = keyof typeof inventoryCrudResources;

export async function getInventoryOverview(tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const [
    skus,
    lots,
    transactions,
    locations,
    balances,
    importReports,
    hetLots,
    finishedGoodLots,
  ] = await Promise.all([
    prisma.inventorySku.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.inventoryLot.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.inventoryTransaction.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.inventoryLocation.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.inventoryBalance.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.inventoryImportReport.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.inventoryLot.count({ where: { tenantId: scopedTenantId, deleted: false, inventoryType: 'HET' } }),
    prisma.inventoryLot.count({ where: { tenantId: scopedTenantId, deleted: false, inventoryType: 'FINISHED_GOOD' } }),
  ]);

  return { skus, lots, transactions, locations, balances, importReports, hetLots, finishedGoodLots };
}

export async function listSkus(options: { tenantId?: string | null; q?: string; take?: number; includeDeleted?: boolean }) {
  return listCrud(inventoryCrudResources.skus, options);
}

export async function listLots(options: {
  tenantId?: string | null;
  q?: string;
  inventoryType?: string;
  status?: string;
  take?: number;
  includeDeleted?: boolean;
}) {
  return listCrud(inventoryCrudResources.lots, {
    ...options,
    filters: {
      inventoryType: options.inventoryType,
      status: options.status,
    },
  });
}

export async function getLot(id: string, tenantId?: string | null, includeDeleted = false) {
  return getCrud(inventoryCrudResources.lots, id, tenantId, includeDeleted);
}

export async function listTransactions(options: { tenantId?: string | null; q?: string; take?: number; includeDeleted?: boolean }) {
  return listCrud(inventoryCrudResources.transactions, options);
}

export async function listLocations(options: { tenantId?: string | null; includeDeleted?: boolean } = {}) {
  return listCrud(inventoryCrudResources.locations, options);
}

export async function getGenealogy(lotId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const lot = await prisma.inventoryLot.findFirst({
    where: { id: lotId, tenantId: scopedTenantId, deleted: false },
    include: { inventorySku: true },
  });
  if (!lot) return null;
  const [parents, children] = await Promise.all([
    prisma.inventoryGenealogy.findMany({
      where: { tenantId: scopedTenantId, childInventoryLotId: lotId, deleted: false },
      include: { parentInventoryLot: { include: { inventorySku: true } } },
    }),
    prisma.inventoryGenealogy.findMany({
      where: { tenantId: scopedTenantId, parentInventoryLotId: lotId, deleted: false },
      include: { childInventoryLot: { include: { inventorySku: true } } },
    }),
  ]);
  return { id: lot.id, lot, parents, children };
}

export async function listImportReports(options: { tenantId?: string | null; includeDeleted?: boolean } = {}) {
  return listCrud(inventoryCrudResources.importReports, { ...options, take: 20 });
}

export async function listInventoryResource(key: InventoryCrudResourceKey, options: CrudListOptions) {
  return listCrud(inventoryCrudResources[key], options);
}

export async function getInventoryResource(key: InventoryCrudResourceKey, id: string, tenantId?: string | null, includeDeleted = false) {
  return getCrud(inventoryCrudResources[key], id, tenantId, includeDeleted);
}

export async function createInventoryResource(
  key: InventoryCrudResourceKey,
  input: { tenantId?: string | null; actor: JwtPayload; payload: Record<string, unknown> },
) {
  rejectClientProvenanceFields(key, input.payload);
  return createCrud(inventoryCrudResources[key], {
    ...input,
    payload: payloadWithCreateProvenance(key, input),
  });
}

export async function updateInventoryResource(
  key: InventoryCrudResourceKey,
  input: { id: string; tenantId?: string | null; actor: JwtPayload; payload: Record<string, unknown> },
) {
  rejectClientProvenanceFields(key, input.payload);
  return updateCrud(inventoryCrudResources[key], input);
}

export async function archiveInventoryResource(
  key: InventoryCrudResourceKey,
  input: { id: string; tenantId?: string | null; actor: JwtPayload },
) {
  return archiveCrud(inventoryCrudResources[key], input);
}

export async function restoreInventoryResource(
  key: InventoryCrudResourceKey,
  input: { id: string; tenantId?: string | null; actor: JwtPayload },
) {
  return restoreCrud(inventoryCrudResources[key], input);
}

export async function listInventoryResourceAudit(key: InventoryCrudResourceKey, input: { id: string; tenantId?: string | null }) {
  return listCrudAudit(inventoryCrudResources[key], input);
}

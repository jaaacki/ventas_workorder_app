import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import type { JwtPayload } from '../plugins/auth.js';
import {
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

const unitSelect = {
  id: true,
  tenantId: true,
  supplyEntityId: true,
  collectionPointId: true,
  legacyHetId: true,
  unitNumber: true,
  parcelTrackingNumber: true,
  status: true,
  legacyDeliverId: true,
  legacyCollectId: true,
  legacyUsedByWorkOrderId: true,
  legacyNextHetId: true,
  sourceSystem: true,
  linkCompleteness: true,
  semanticConfidence: true,
  hiddenFromOperations: true,
  deleted: true,
  deletedAt: true,
  deletedById: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CollectionUnitSelect;

export const procurementCrudResources = {
  supplyEntities: {
    resource: 'procurement.supplyEntity',
    entityType: 'SupplyEntity',
    delegate: 'supplyEntity',
    mutableFields: ['name', 'legalName', 'externalCode', 'sourceSystem', 'legacyGroupKey', 'legacyClinicId'],
    createRequiredFields: ['name'],
    searchableFields: ['id', 'name', 'legalName', 'externalCode', 'legacyClinicId'],
    defaultOrderBy: [{ name: 'asc' }, { id: 'asc' }],
  },
  collectionPoints: {
    resource: 'procurement.collectionPoint',
    entityType: 'CollectionPoint',
    delegate: 'collectionPoint',
    mutableFields: [
      'supplyEntityId',
      'legacyClinicId',
      'hciCode',
      'displayName',
      'licenseName',
      'address',
      'postalCode',
      'telephone',
      'personInCharge',
    ],
    createRequiredFields: ['supplyEntityId', 'displayName'],
    searchableFields: ['id', 'displayName', 'licenseName', 'legacyClinicId', 'hciCode'],
    defaultOrderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    validators: [
      ({ tenantId, payload }) => requireSameTenant('supplyEntity', payload.supplyEntityId, tenantId, 'Supply entity'),
    ],
  },
  collectionUnits: {
    resource: 'procurement.collectionUnit',
    entityType: 'CollectionUnit',
    delegate: 'collectionUnit',
    mutableFields: [
      'supplyEntityId',
      'collectionPointId',
      'legacyHetId',
      'unitNumber',
      'parcelTrackingNumber',
      'status',
      'legacyDeliverId',
      'legacyCollectId',
      'legacyUsedByWorkOrderId',
      'legacyNextHetId',
      'sourceSystem',
      'linkCompleteness',
      'semanticConfidence',
      'hiddenFromOperations',
      'legacyRaw',
    ],
    createRequiredFields: ['status'],
    searchableFields: ['id', 'legacyHetId', 'unitNumber', 'parcelTrackingNumber', 'legacyUsedByWorkOrderId'],
    defaultOrderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: { ...unitSelect, legacyRaw: true },
    validators: [
      ({ tenantId, payload }) => requireSameTenant('supplyEntity', payload.supplyEntityId, tenantId, 'Supply entity'),
      ({ tenantId, payload }) => requireSameTenant('collectionPoint', payload.collectionPointId, tenantId, 'Collection point'),
    ],
  },
  issuanceOrders: {
    resource: 'procurement.issuanceOrder',
    entityType: 'IssuanceOrder',
    delegate: 'issuanceOrder',
    mutableFields: [
      'supplyEntityId',
      'collectionPointId',
      'issuedAt',
      'issuedBy',
      'legacyDeliverCollectId',
      'legacyDirection',
      'semanticConfidence',
      'level',
      'remarks',
      'legacyRaw',
    ],
    createRequiredFields: ['issuedAt'],
    searchableFields: ['id', 'issuedBy', 'legacyDeliverCollectId', 'remarks'],
    defaultOrderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    validators: [
      ({ tenantId, payload }) => requireSameTenant('supplyEntity', payload.supplyEntityId, tenantId, 'Supply entity'),
      ({ tenantId, payload }) => requireSameTenant('collectionPoint', payload.collectionPointId, tenantId, 'Collection point'),
    ],
  },
  issuanceOrderLines: {
    resource: 'procurement.issuanceOrderLine',
    entityType: 'IssuanceOrderLine',
    delegate: 'issuanceOrderLine',
    mutableFields: ['issuanceOrderId', 'collectionUnitId', 'itemCode', 'quantity', 'uom', 'legacyHetId', 'legacyHetNumber', 'parcelTrackingNumber'],
    createRequiredFields: ['issuanceOrderId'],
    searchableFields: ['id', 'issuanceOrderId', 'itemCode', 'legacyHetId', 'legacyHetNumber', 'parcelTrackingNumber'],
    defaultOrderBy: [{ createdAt: 'desc' }],
    validators: [
      ({ tenantId, payload }) => requireSameTenant('issuanceOrder', payload.issuanceOrderId, tenantId, 'Issuance order'),
      ({ tenantId, payload }) => requireSameTenant('collectionUnit', payload.collectionUnitId, tenantId, 'Collection unit'),
    ],
  },
  collectionUnitFulfilments: {
    resource: 'procurement.collectionUnitFulfilment',
    entityType: 'CollectionUnitFulfilment',
    delegate: 'collectionUnitFulfilment',
    mutableFields: ['collectionUnitId', 'fulfilledAt', 'fulfilledBy', 'source', 'evidencePath', 'remarks', 'inferred'],
    createRequiredFields: ['collectionUnitId'],
    searchableFields: ['id', 'collectionUnitId', 'fulfilledBy', 'source', 'remarks'],
    defaultOrderBy: [{ fulfilledAt: 'desc' }, { createdAt: 'desc' }],
    validators: [
      ({ tenantId, payload }) => requireSameTenant('collectionUnit', payload.collectionUnitId, tenantId, 'Collection unit'),
    ],
  },
  collectionOrders: {
    resource: 'procurement.collectionOrder',
    entityType: 'CollectionOrder',
    delegate: 'collectionOrder',
    mutableFields: [
      'supplyEntityId',
      'collectionPointId',
      'requestedAt',
      'scheduledFor',
      'requestedBy',
      'status',
      'legacyCollectDeliverCollectId',
      'legacyDirection',
      'semanticConfidence',
      'legacyConflatedOrderReceipt',
      'level',
      'remarks',
      'legacyRaw',
    ],
    createRequiredFields: ['status'],
    searchableFields: ['id', 'requestedBy', 'status', 'legacyCollectDeliverCollectId', 'remarks'],
    defaultOrderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }],
    validators: [
      ({ tenantId, payload }) => requireSameTenant('supplyEntity', payload.supplyEntityId, tenantId, 'Supply entity'),
      ({ tenantId, payload }) => requireSameTenant('collectionPoint', payload.collectionPointId, tenantId, 'Collection point'),
    ],
  },
  collectionReceipts: {
    resource: 'procurement.collectionReceipt',
    entityType: 'CollectionReceipt',
    delegate: 'collectionReceipt',
    mutableFields: [
      'collectionOrderId',
      'receivedAt',
      'receivedBy',
      'signaturePath',
      'remarks',
      'legacyCollectDeliverCollectId',
      'legacyConflatedOrderReceipt',
      'acceptanceState',
      'legacyRaw',
    ],
    createRequiredFields: ['collectionOrderId'],
    searchableFields: ['id', 'receivedBy', 'legacyCollectDeliverCollectId', 'acceptanceState', 'remarks'],
    defaultOrderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    validators: [
      ({ tenantId, payload }) => requireSameTenant('collectionOrder', payload.collectionOrderId, tenantId, 'Collection order'),
    ],
  },
  collectionReceiptLines: {
    resource: 'procurement.collectionReceiptLine',
    entityType: 'CollectionReceiptLine',
    delegate: 'collectionReceiptLine',
    mutableFields: ['collectionReceiptId', 'collectionUnitId', 'itemCode', 'quantity', 'uom', 'conditionStatus', 'acceptanceStatus', 'resultingHetId', 'discrepancyReason'],
    createRequiredFields: ['collectionReceiptId'],
    searchableFields: ['id', 'collectionReceiptId', 'collectionUnitId', 'itemCode', 'acceptanceStatus', 'resultingHetId', 'discrepancyReason'],
    defaultOrderBy: [{ createdAt: 'desc' }],
    validators: [
      ({ tenantId, payload }) => requireSameTenant('collectionReceipt', payload.collectionReceiptId, tenantId, 'Collection receipt'),
      ({ tenantId, payload }) => requireSameTenant('collectionUnit', payload.collectionUnitId, tenantId, 'Collection unit'),
      ({ tenantId, payload }) => requireSameTenant('het', payload.resultingHetId, tenantId, 'Resulting HET'),
    ],
  },
  importReports: {
    resource: 'procurement.importReport',
    entityType: 'ProcurementImportReport',
    delegate: 'procurementImportReport',
    mutableFields: [],
    searchableFields: ['id', 'source'],
    defaultOrderBy: [{ startedAt: 'desc' }],
    archiveOnly: true,
  },
} satisfies Record<string, CrudResourceConfig>;

export type ProcurementCrudResourceKey = keyof typeof procurementCrudResources;

export function procurementCrudResource(key: ProcurementCrudResourceKey) {
  return procurementCrudResources[key];
}

export async function getProcurementOverview(tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const [
    supplyEntities,
    collectionPoints,
    unitsTotal,
    unitsOperational,
    unitsPlaceholder,
    issuanceOrders,
    collectionOrders,
    collectionReceipts,
    linkedHets,
  ] = await Promise.all([
    prisma.supplyEntity.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.collectionPoint.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.collectionUnit.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.collectionUnit.count({ where: { tenantId: scopedTenantId, deleted: false, hiddenFromOperations: false } }),
    prisma.collectionUnit.count({ where: { tenantId: scopedTenantId, deleted: false, hiddenFromOperations: true } }),
    prisma.issuanceOrder.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.collectionOrder.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.collectionReceipt.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.het.count({ where: { tenantId: scopedTenantId, collectionUnitId: { not: null } } }),
  ]);

  return {
    supplyEntities,
    collectionPoints,
    unitsTotal,
    unitsOperational,
    unitsPlaceholder,
    issuanceOrders,
    collectionOrders,
    collectionReceipts,
    linkedHets,
  };
}

export async function listSupplyEntities(tenantId?: string | null) {
  return listCrud(procurementCrudResources.supplyEntities, { tenantId });
}

export async function listCollectionPoints(tenantId?: string | null, supplyEntityId?: string) {
  return listCrud(procurementCrudResources.collectionPoints, {
    tenantId,
    filters: supplyEntityId ? { supplyEntityId } : undefined,
  });
}

export async function listCollectionUnits(options: {
  tenantId?: string | null;
  includeHidden?: boolean;
  includeDeleted?: boolean;
  status?: string;
  q?: string;
  take?: number;
}) {
  const q = options.q?.trim();
  return prisma.collectionUnit.findMany({
    where: {
      tenantId: tenantIdOrDefault(options.tenantId),
      ...(options.includeHidden ? {} : { hiddenFromOperations: false }),
      ...(options.includeDeleted ? {} : { deleted: false }),
      ...(options.status ? { status: options.status } : {}),
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: 'insensitive' } },
              { legacyHetId: { contains: q, mode: 'insensitive' } },
              { unitNumber: { contains: q, mode: 'insensitive' } },
              { parcelTrackingNumber: { contains: q, mode: 'insensitive' } },
              { legacyUsedByWorkOrderId: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: unitSelect,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: options.take ?? 200,
  });
}

export async function getCollectionUnit(id: string, tenantId?: string | null, includeDeleted = false) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const unit = await prisma.collectionUnit.findFirst({
    where: { id, tenantId: scopedTenantId, ...(includeDeleted ? {} : { deleted: false }) },
    select: {
      ...unitSelect,
      legacyRaw: true,
    },
  });
  if (!unit) return null;

  const [issuanceLines, fulfilments, receiptLines, hets] = await Promise.all([
    prisma.issuanceOrderLine.findMany({ where: { tenantId: scopedTenantId, collectionUnitId: id, deleted: false }, orderBy: { createdAt: 'desc' } }),
    prisma.collectionUnitFulfilment.findMany({ where: { tenantId: scopedTenantId, collectionUnitId: id, deleted: false }, orderBy: { createdAt: 'desc' } }),
    prisma.collectionReceiptLine.findMany({ where: { tenantId: scopedTenantId, collectionUnitId: id, deleted: false }, orderBy: { createdAt: 'desc' } }),
    prisma.het.findMany({
      where: { tenantId: scopedTenantId, collectionUnitId: id },
      select: { id: true, hetNumber: true, clinicName: true, usedById: true, finishedById: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  return { ...unit, issuanceLines, fulfilments, receiptLines, hets };
}

export async function listIssuanceOrders(tenantId?: string | null) {
  return listCrud(procurementCrudResources.issuanceOrders, { tenantId });
}

export async function listCollectionOrders(tenantId?: string | null) {
  return listCrud(procurementCrudResources.collectionOrders, { tenantId });
}

export async function listCollectionReceipts(tenantId?: string | null) {
  return listCrud(procurementCrudResources.collectionReceipts, { tenantId });
}

export async function listImportReports(options: { tenantId?: string | null; includeDeleted?: boolean } = {}) {
  return listCrud(procurementCrudResources.importReports, { ...options, take: 20 });
}

export async function listProcurementResource(key: ProcurementCrudResourceKey, options: CrudListOptions) {
  return listCrud(procurementCrudResources[key], options);
}

export async function getProcurementResource(key: ProcurementCrudResourceKey, id: string, tenantId?: string | null, includeDeleted = false) {
  return getCrud(procurementCrudResources[key], id, tenantId, includeDeleted);
}

export async function createProcurementResource(
  key: ProcurementCrudResourceKey,
  input: { tenantId?: string | null; actor: JwtPayload; payload: Record<string, unknown> },
) {
  return createCrud(procurementCrudResources[key], input);
}

export async function updateProcurementResource(
  key: ProcurementCrudResourceKey,
  input: { id: string; tenantId?: string | null; actor: JwtPayload; payload: Record<string, unknown> },
) {
  return updateCrud(procurementCrudResources[key], input);
}

export async function archiveProcurementResource(
  key: ProcurementCrudResourceKey,
  input: { id: string; tenantId?: string | null; actor: JwtPayload },
) {
  return archiveCrud(procurementCrudResources[key], input);
}

export async function restoreProcurementResource(
  key: ProcurementCrudResourceKey,
  input: { id: string; tenantId?: string | null; actor: JwtPayload },
) {
  return restoreCrud(procurementCrudResources[key], input);
}

export async function listProcurementResourceAudit(key: ProcurementCrudResourceKey, input: { id: string; tenantId?: string | null }) {
  return listCrudAudit(procurementCrudResources[key], input);
}

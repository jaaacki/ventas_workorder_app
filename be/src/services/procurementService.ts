import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CollectionUnitSelect;

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
    prisma.supplyEntity.count({ where: { tenantId: scopedTenantId } }),
    prisma.collectionPoint.count({ where: { tenantId: scopedTenantId } }),
    prisma.collectionUnit.count({ where: { tenantId: scopedTenantId, deleted: false } }),
    prisma.collectionUnit.count({ where: { tenantId: scopedTenantId, deleted: false, hiddenFromOperations: false } }),
    prisma.collectionUnit.count({ where: { tenantId: scopedTenantId, hiddenFromOperations: true } }),
    prisma.issuanceOrder.count({ where: { tenantId: scopedTenantId } }),
    prisma.collectionOrder.count({ where: { tenantId: scopedTenantId } }),
    prisma.collectionReceipt.count({ where: { tenantId: scopedTenantId } }),
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
  return prisma.supplyEntity.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

export async function listCollectionPoints(tenantId?: string | null, supplyEntityId?: string) {
  return prisma.collectionPoint.findMany({
    where: {
      tenantId: tenantIdOrDefault(tenantId),
      ...(supplyEntityId ? { supplyEntityId } : {}),
    },
    orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
  });
}

export async function listCollectionUnits(options: {
  tenantId?: string | null;
  includeHidden?: boolean;
  status?: string;
  q?: string;
  take?: number;
}) {
  const q = options.q?.trim();
  return prisma.collectionUnit.findMany({
    where: {
      tenantId: tenantIdOrDefault(options.tenantId),
      deleted: false,
      ...(options.includeHidden ? {} : { hiddenFromOperations: false }),
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

export async function getCollectionUnit(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const unit = await prisma.collectionUnit.findFirst({
    where: { id, tenantId: scopedTenantId },
    select: {
      ...unitSelect,
      legacyRaw: true,
    },
  });
  if (!unit) return null;

  const [issuanceLines, fulfilments, receiptLines, hets] = await Promise.all([
    prisma.issuanceOrderLine.findMany({ where: { tenantId: scopedTenantId, collectionUnitId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.collectionUnitFulfilment.findMany({ where: { tenantId: scopedTenantId, collectionUnitId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.collectionReceiptLine.findMany({ where: { tenantId: scopedTenantId, collectionUnitId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.het.findMany({
      where: { tenantId: scopedTenantId, collectionUnitId: id },
      select: { id: true, hetNumber: true, clinicName: true, usedById: true, finishedById: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  return { ...unit, issuanceLines, fulfilments, receiptLines, hets };
}

export async function listIssuanceOrders(tenantId?: string | null) {
  return prisma.issuanceOrder.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function listCollectionOrders(tenantId?: string | null) {
  return prisma.collectionOrder.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function listCollectionReceipts(tenantId?: string | null) {
  return prisma.collectionReceipt.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function listImportReports(tenantId?: string | null) {
  return prisma.procurementImportReport.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
}

import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

type TraceSubjectType = 'workOrder' | 'collectionUnit' | 'het';

interface TraceSubject {
  type: TraceSubjectType;
  id: string;
  label?: string | null;
}

async function buildTrace(
  tenantId: string,
  subject: TraceSubject,
  lotWhere: object,
  options: {
    workOrderIds?: string[];
    collectionUnitId?: string;
    hetIds?: string[];
  } = {},
) {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      tenantId,
      ...lotWhere,
    },
    include: { inventorySku: true, currentLocation: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });

  const lotIds = lots.map((lot) => lot.id);
  const workOrderIds = Array.from(
    new Set([
      ...(options.workOrderIds ?? []),
      ...lots.map((lot) => lot.workOrderId).filter(Boolean),
    ] as string[]),
  );
  const hetIds = Array.from(new Set([...(options.hetIds ?? []), ...lots.map((lot) => lot.hetId).filter(Boolean)] as string[]));

  const transactionWhere = [
    ...(lotIds.length ? [{ inventoryLotId: { in: lotIds } }] : []),
    ...(workOrderIds.length ? [{ workOrderId: { in: workOrderIds } }] : []),
  ];
  const hetWhere = [
    ...(hetIds.length ? [{ id: { in: hetIds } }] : []),
    ...(options.collectionUnitId ? [{ collectionUnitId: options.collectionUnitId }] : []),
    ...(workOrderIds.length ? [{ usedById: { in: workOrderIds } }, { finishedById: { in: workOrderIds } }] : []),
  ];

  const [transactions, consumptions, genealogy, hets, workOrders] = await Promise.all([
    transactionWhere.length
      ? prisma.inventoryTransaction.findMany({
          where: { tenantId, OR: transactionWhere },
          include: { inventorySku: true, inventoryLot: true, fromLocation: true, toLocation: true },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        })
      : Promise.resolve([]),
    transactionWhere.length
      ? prisma.workOrderInventoryConsumption.findMany({
          where: { tenantId, OR: transactionWhere },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        })
      : Promise.resolve([]),
    lotIds.length
      ? prisma.inventoryGenealogy.findMany({
          where: {
            tenantId,
            OR: [{ parentInventoryLotId: { in: lotIds } }, { childInventoryLotId: { in: lotIds } }],
          },
          include: {
            parentInventoryLot: { include: { inventorySku: true } },
            childInventoryLot: { include: { inventorySku: true } },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        })
      : Promise.resolve([]),
    hetWhere.length
      ? prisma.het.findMany({
          where: { tenantId, deleted: false, OR: hetWhere },
          select: { id: true, hetNumber: true, collectionUnitId: true, usedById: true, finishedById: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        })
      : Promise.resolve([]),
    prisma.workOrder.findMany({
      where: {
        tenantId,
        deleted: false,
        id: { in: workOrderIds },
      },
      select: { id: true, woNumber: true, hetId: true, phaseOrder: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    }),
  ]);

  return { subject, lots, transactions, consumptions, genealogy, hets, workOrders };
}

export async function getWorkOrderInventoryTrace(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, tenantId: scopedTenantId, deleted: false },
    select: { id: true, woNumber: true, hetId: true },
  });
  if (!workOrder) return null;

  return buildTrace(
    scopedTenantId,
    { type: 'workOrder', id: workOrder.id, label: workOrder.woNumber },
    {
      OR: [
        { workOrderId: workOrder.id },
        ...(workOrder.hetId ? [{ hetId: workOrder.hetId }, { legacyHetId: workOrder.hetId }] : []),
      ],
    },
    { workOrderIds: [workOrder.id], hetIds: workOrder.hetId ? [workOrder.hetId] : [] },
  );
}

export async function getCollectionUnitInventoryTrace(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const unit = await prisma.collectionUnit.findFirst({
    where: { id, tenantId: scopedTenantId, deleted: false },
    select: { id: true, unitNumber: true, legacyHetId: true, legacyUsedByWorkOrderId: true },
  });
  if (!unit) return null;

  const hets = await prisma.het.findMany({
    where: { tenantId: scopedTenantId, deleted: false, collectionUnitId: id },
    select: { id: true, usedById: true, finishedById: true },
  });
  const hetIds = hets.map((het) => het.id);
  const workOrderIds = Array.from(
    new Set([
      unit.legacyUsedByWorkOrderId,
      ...hets.flatMap((het) => [het.usedById, het.finishedById]),
    ].filter(Boolean) as string[]),
  );

  return buildTrace(
    scopedTenantId,
    { type: 'collectionUnit', id: unit.id, label: unit.unitNumber },
    {
      OR: [
        { collectionUnitId: unit.id },
        ...(hetIds.length ? [{ hetId: { in: hetIds } }] : []),
        ...(unit.legacyHetId ? [{ legacyHetId: unit.legacyHetId }] : []),
        ...(workOrderIds.length ? [{ workOrderId: { in: workOrderIds } }] : []),
      ],
    },
    { collectionUnitId: unit.id, hetIds, workOrderIds },
  );
}

export async function getHetInventoryTrace(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const het = await prisma.het.findFirst({
    where: { id, tenantId: scopedTenantId, deleted: false },
    select: { id: true, hetNumber: true, collectionUnitId: true, usedById: true, finishedById: true },
  });
  if (!het) return null;

  const workOrderIds = Array.from(new Set([het.usedById, het.finishedById].filter(Boolean) as string[]));

  return buildTrace(
    scopedTenantId,
    { type: 'het', id: het.id, label: het.hetNumber },
    {
      OR: [
        { hetId: het.id },
        { legacyHetId: het.id },
        ...(het.hetNumber ? [{ legacyHetId: het.hetNumber }] : []),
        ...(het.collectionUnitId ? [{ collectionUnitId: het.collectionUnitId }] : []),
        ...(workOrderIds.length ? [{ workOrderId: { in: workOrderIds } }] : []),
      ],
    },
    { collectionUnitId: het.collectionUnitId ?? undefined, hetIds: [het.id], workOrderIds },
  );
}

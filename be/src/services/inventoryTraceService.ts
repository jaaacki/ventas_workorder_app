import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

type TraceSubjectType = 'workOrder' | 'collectionUnit' | 'het' | 'lot';

// Upstream collection origin of a HET: clinic (SupplyEntity/CollectionPoint) →
// CollectionUnit → IssuanceOrder → CollectionOrder/Receipt/ReceiptLine → minted
// Het. These are scalar-linked (no Prisma relations between them), so the leg is
// walked with explicit tenant-scoped findMany hops, empty-safe at each step.
async function buildCollectionLeg(
  tenantId: string,
  seed: { hetReceiptLineIds: string[]; collectionUnitIds: string[] },
) {
  const unitIds = new Set(seed.collectionUnitIds);
  const lineOr = [
    ...(seed.hetReceiptLineIds.length ? [{ id: { in: seed.hetReceiptLineIds } }] : []),
    ...(unitIds.size ? [{ collectionUnitId: { in: [...unitIds] } }] : []),
  ];

  const collectionReceiptLines = lineOr.length
    ? await prisma.collectionReceiptLine.findMany({
        where: { tenantId, deleted: false, OR: lineOr },
        select: {
          id: true,
          collectionReceiptId: true,
          collectionUnitId: true,
          itemCode: true,
          quantity: true,
          uom: true,
          conditionStatus: true,
          acceptanceStatus: true,
          resultingHetId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      })
    : [];
  for (const line of collectionReceiptLines) if (line.collectionUnitId) unitIds.add(line.collectionUnitId);

  const receiptIds = [...new Set(collectionReceiptLines.map((line) => line.collectionReceiptId).filter(Boolean))];
  const collectionReceipts = receiptIds.length
    ? await prisma.collectionReceipt.findMany({
        where: { tenantId, deleted: false, id: { in: receiptIds } },
        select: {
          id: true,
          collectionOrderId: true,
          issuanceOrderId: true,
          receivedAt: true,
          receivedBy: true,
          signaturePath: true,
          acceptanceState: true,
          createdAt: true,
        },
        orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
      })
    : [];

  const orderIds = [...new Set(collectionReceipts.map((receipt) => receipt.collectionOrderId).filter(Boolean) as string[])];
  const issuanceIds = [...new Set(collectionReceipts.map((receipt) => receipt.issuanceOrderId).filter(Boolean) as string[])];

  const [collectionOrders, issuanceOrders, collectionUnits] = await Promise.all([
    orderIds.length
      ? prisma.collectionOrder.findMany({
          where: { tenantId, deleted: false, id: { in: orderIds } },
          select: { id: true, supplyEntityId: true, collectionPointId: true, requestedAt: true, status: true, createdAt: true },
        })
      : Promise.resolve([]),
    issuanceIds.length
      ? prisma.issuanceOrder.findMany({
          where: { tenantId, deleted: false, id: { in: issuanceIds } },
          select: { id: true, supplyEntityId: true, collectionPointId: true, issuedAt: true, issuedBy: true, createdAt: true },
        })
      : Promise.resolve([]),
    unitIds.size
      ? prisma.collectionUnit.findMany({
          where: { tenantId, deleted: false, id: { in: [...unitIds] } },
          select: { id: true, unitNumber: true, status: true, supplyEntityId: true, collectionPointId: true, parcelTrackingNumber: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const pointIds = new Set<string>();
  const supplyIds = new Set<string>();
  for (const row of [...collectionOrders, ...issuanceOrders, ...collectionUnits]) {
    if (row.collectionPointId) pointIds.add(row.collectionPointId);
    if (row.supplyEntityId) supplyIds.add(row.supplyEntityId);
  }

  const collectionPoints = pointIds.size
    ? await prisma.collectionPoint.findMany({
        where: { tenantId, deleted: false, id: { in: [...pointIds] } },
        select: { id: true, supplyEntityId: true, displayName: true, hciCode: true, address: true, createdAt: true },
      })
    : [];
  for (const point of collectionPoints) if (point.supplyEntityId) supplyIds.add(point.supplyEntityId);

  const supplyEntities = supplyIds.size
    ? await prisma.supplyEntity.findMany({
        where: { tenantId, deleted: false, id: { in: [...supplyIds] } },
        select: { id: true, name: true, legalName: true, externalCode: true, createdAt: true },
      })
    : [];

  return { supplyEntities, collectionPoints, collectionUnits, issuanceOrders, collectionOrders, collectionReceipts, collectionReceiptLines };
}

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
      // Archived/voided lots must not leak into the trace (and expand the
      // downstream fan-out); every other query in this file filters them (F3).
      deleted: false,
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
          select: { id: true, hetNumber: true, collectionUnitId: true, collectionReceiptLineId: true, usedById: true, finishedById: true },
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

  const collection = await buildCollectionLeg(tenantId, {
    hetReceiptLineIds: hets.map((het) => het.collectionReceiptLineId).filter(Boolean) as string[],
    collectionUnitIds: Array.from(
      new Set(
        [
          ...(options.collectionUnitId ? [options.collectionUnitId] : []),
          ...hets.map((het) => het.collectionUnitId),
        ].filter(Boolean) as string[],
      ),
    ),
  });

  return { subject, lots, transactions, consumptions, genealogy, hets, workOrders, collection };
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

  // The HET carries through the workflow as a chain of per-phase work orders:
  // pick up every work order that carries this HET (directly or as a batch
  // HET), not just the first/last chain ends on usedById/finishedById.
  const chainWorkOrders = await prisma.workOrder.findMany({
    where: {
      tenantId: scopedTenantId,
      deleted: false,
      OR: [{ hetId: het.id }, { batchHets: { some: { hetId: het.id } } }],
    },
    select: { id: true },
  });
  const workOrderIds = Array.from(
    new Set([het.usedById, het.finishedById, ...chainWorkOrders.map((workOrder) => workOrder.id)].filter(Boolean) as string[]),
  );

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

// Finished-goods (or any) LOT entry point: traces a lot back to its collection
// origin. The lot carries workOrderId + hetId, so the fan-out reaches the run
// chain, sibling lots, and — via the HET — the upstream clinic collection leg,
// giving the full clinic → LOT chain from a single lot id.
export async function getLotInventoryTrace(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const lot = await prisma.inventoryLot.findFirst({
    where: { id, tenantId: scopedTenantId, deleted: false },
    select: { id: true, lotNumber: true, workOrderId: true, hetId: true },
  });
  if (!lot) return null;

  return buildTrace(
    scopedTenantId,
    { type: 'lot', id: lot.id, label: lot.lotNumber },
    {
      OR: [
        { id: lot.id },
        ...(lot.workOrderId ? [{ workOrderId: lot.workOrderId }] : []),
        ...(lot.hetId ? [{ hetId: lot.hetId }, { legacyHetId: lot.hetId }] : []),
      ],
    },
    { workOrderIds: lot.workOrderId ? [lot.workOrderId] : [], hetIds: lot.hetId ? [lot.hetId] : [] },
  );
}

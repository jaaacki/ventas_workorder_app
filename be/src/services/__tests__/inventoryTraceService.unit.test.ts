import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workOrder: { findFirst: vi.fn(), findMany: vi.fn() },
  collectionUnit: { findFirst: vi.fn(), findMany: vi.fn() },
  het: { findFirst: vi.fn(), findMany: vi.fn() },
  inventoryLot: { findFirst: vi.fn(), findMany: vi.fn() },
  inventoryTransaction: { findMany: vi.fn() },
  workOrderInventoryConsumption: { findMany: vi.fn() },
  inventoryGenealogy: { findMany: vi.fn() },
  collectionReceiptLine: { findMany: vi.fn() },
  collectionReceipt: { findMany: vi.fn() },
  collectionOrder: { findMany: vi.fn() },
  issuanceOrder: { findMany: vi.fn() },
  collectionPoint: { findMany: vi.fn() },
  supplyEntity: { findMany: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: mocks,
}));

import {
  getCollectionUnitInventoryTrace,
  getHetInventoryTrace,
  getLotInventoryTrace,
  getWorkOrderInventoryTrace,
} from '../inventoryTraceService.js';

const tenantId = 'tenant-a';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inventoryLot.findMany.mockResolvedValue([]);
  mocks.inventoryTransaction.findMany.mockResolvedValue([]);
  mocks.workOrderInventoryConsumption.findMany.mockResolvedValue([]);
  mocks.inventoryGenealogy.findMany.mockResolvedValue([]);
  mocks.het.findMany.mockResolvedValue([]);
  mocks.workOrder.findMany.mockResolvedValue([]);
  mocks.collectionReceiptLine.findMany.mockResolvedValue([]);
  mocks.collectionReceipt.findMany.mockResolvedValue([]);
  mocks.collectionOrder.findMany.mockResolvedValue([]);
  mocks.issuanceOrder.findMany.mockResolvedValue([]);
  mocks.collectionUnit.findMany.mockResolvedValue([]);
  mocks.collectionPoint.findMany.mockResolvedValue([]);
  mocks.supplyEntity.findMany.mockResolvedValue([]);
});

describe('inventoryTraceService', () => {
  it('returns null when the traced work order is outside the caller tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValue(null);

    const result = await getWorkOrderInventoryTrace('wo-1', tenantId);

    expect(result).toBeNull();
    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-1', tenantId, deleted: false } }),
    );
    expect(mocks.inventoryLot.findMany).not.toHaveBeenCalled();
  });

  it('scopes work-order trace lots, movements, consumptions, genealogy, and HET links to the caller tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', woNumber: 'WO-1', hetId: 'het-1' });
    mocks.inventoryLot.findMany.mockResolvedValue([{ id: 'lot-1', workOrderId: 'wo-1', hetId: 'het-1' }]);

    const result = await getWorkOrderInventoryTrace('wo-1', tenantId);

    expect(result?.subject).toEqual({ type: 'workOrder', id: 'wo-1', label: 'WO-1' });
    expect(mocks.inventoryLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          OR: expect.arrayContaining([{ workOrderId: 'wo-1' }, { hetId: 'het-1' }]),
        }),
      }),
    );
    expect(mocks.inventoryTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          OR: expect.arrayContaining([{ inventoryLotId: { in: ['lot-1'] } }, { workOrderId: { in: ['wo-1'] } }]),
        }),
      }),
    );
    expect(mocks.workOrderInventoryConsumption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
    expect(mocks.inventoryGenealogy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
    expect(mocks.het.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId, deleted: false }) }),
    );
  });

  it('scopes collection-unit trace through collection-unit, HET, and legacy work-order links', async () => {
    mocks.collectionUnit.findFirst.mockResolvedValue({
      id: 'unit-1',
      unitNumber: 'CU-1',
      legacyHetId: 'legacy-het-1',
      legacyUsedByWorkOrderId: 'wo-legacy',
    });
    mocks.het.findMany.mockResolvedValueOnce([
      { id: 'het-1', usedById: 'wo-use', finishedById: 'wo-finish' },
    ]);

    await getCollectionUnitInventoryTrace('unit-1', tenantId);

    expect(mocks.collectionUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'unit-1', tenantId, deleted: false } }),
    );
    expect(mocks.inventoryLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          OR: expect.arrayContaining([
            { collectionUnitId: 'unit-1' },
            { hetId: { in: ['het-1'] } },
            { legacyHetId: 'legacy-het-1' },
            { workOrderId: { in: ['wo-legacy', 'wo-use', 'wo-finish'] } },
          ]),
        }),
      }),
    );
  });

  it('scopes HET trace through HET, collection-unit, and linked work-order references', async () => {
    mocks.het.findFirst.mockResolvedValue({
      id: 'het-1',
      hetNumber: 'HET-0001',
      collectionUnitId: 'unit-1',
      usedById: 'wo-use',
      finishedById: 'wo-finish',
    });
    // The per-phase work-order chain carrying this HET (middle steps are not
    // referenced by usedById/finishedById and must still be traced).
    mocks.workOrder.findMany.mockResolvedValueOnce([{ id: 'wo-use' }, { id: 'wo-middle' }, { id: 'wo-finish' }]);

    await getHetInventoryTrace('het-1', tenantId);

    expect(mocks.het.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'het-1', tenantId, deleted: false } }),
    );
    expect(mocks.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          deleted: false,
          OR: [{ hetId: 'het-1' }, { batchHets: { some: { hetId: 'het-1' } } }],
        }),
      }),
    );
    expect(mocks.inventoryLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          OR: expect.arrayContaining([
            { hetId: 'het-1' },
            { legacyHetId: 'het-1' },
            { legacyHetId: 'HET-0001' },
            { collectionUnitId: 'unit-1' },
            { workOrderId: { in: ['wo-use', 'wo-finish', 'wo-middle'] } },
          ]),
        }),
      }),
    );
  });

  it('walks the upstream collection leg from a HET receipt line and unit up to the clinic', async () => {
    mocks.het.findFirst.mockResolvedValue({
      id: 'het-1',
      hetNumber: 'HET-0001',
      collectionUnitId: 'unit-1',
      usedById: null,
      finishedById: null,
    });
    // The fan-out HET carries the receipt line that ties it to a collection receipt.
    mocks.het.findMany.mockResolvedValue([
      { id: 'het-1', hetNumber: 'HET-0001', collectionUnitId: 'unit-1', collectionReceiptLineId: 'line-1', usedById: null, finishedById: null },
    ]);
    mocks.collectionReceiptLine.findMany.mockResolvedValue([
      { id: 'line-1', collectionReceiptId: 'rcp-1', collectionUnitId: 'unit-1', resultingHetId: 'het-1' },
    ]);
    mocks.collectionReceipt.findMany.mockResolvedValue([
      { id: 'rcp-1', collectionOrderId: 'ord-1', issuanceOrderId: 'iss-1' },
    ]);
    mocks.collectionOrder.findMany.mockResolvedValue([{ id: 'ord-1', supplyEntityId: 'sup-1', collectionPointId: 'pt-1' }]);
    mocks.issuanceOrder.findMany.mockResolvedValue([{ id: 'iss-1', supplyEntityId: 'sup-1', collectionPointId: 'pt-1' }]);
    mocks.collectionUnit.findMany.mockResolvedValue([{ id: 'unit-1', supplyEntityId: 'sup-1', collectionPointId: 'pt-1' }]);
    mocks.collectionPoint.findMany.mockResolvedValue([{ id: 'pt-1', supplyEntityId: 'sup-1' }]);
    mocks.supplyEntity.findMany.mockResolvedValue([{ id: 'sup-1', name: 'Integration Clinic Group' }]);

    const result = await getHetInventoryTrace('het-1', tenantId);

    // Receipt lines are found from BOTH the HET's receipt line id and the unit id.
    expect(mocks.collectionReceiptLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          deleted: false,
          OR: expect.arrayContaining([{ id: { in: ['line-1'] } }, { collectionUnitId: { in: ['unit-1'] } }]),
        }),
      }),
    );
    expect(mocks.collectionReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId, id: { in: ['rcp-1'] } }) }),
    );
    expect(mocks.supplyEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId, id: { in: ['sup-1'] } }) }),
    );
    expect(result?.collection.supplyEntities).toEqual([{ id: 'sup-1', name: 'Integration Clinic Group' }]);
    expect(result?.collection.collectionReceipts).toHaveLength(1);
    expect(result?.collection.collectionPoints).toEqual([{ id: 'pt-1', supplyEntityId: 'sup-1' }]);
  });

  it('returns null when the traced lot is outside the caller tenant', async () => {
    mocks.inventoryLot.findFirst.mockResolvedValue(null);

    const result = await getLotInventoryTrace('lot-1', tenantId);

    expect(result).toBeNull();
    expect(mocks.inventoryLot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lot-1', tenantId, deleted: false } }),
    );
    expect(mocks.inventoryLot.findMany).not.toHaveBeenCalled();
  });

  it('fans a lot trace out over its own lot, work order, and HET links', async () => {
    mocks.inventoryLot.findFirst.mockResolvedValue({ id: 'lot-1', lotNumber: 'LOT-1', workOrderId: 'wo-1', hetId: 'het-1' });

    const result = await getLotInventoryTrace('lot-1', tenantId);

    expect(result?.subject).toEqual({ type: 'lot', id: 'lot-1', label: 'LOT-1' });
    expect(mocks.inventoryLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          OR: expect.arrayContaining([
            { id: 'lot-1' },
            { workOrderId: 'wo-1' },
            { hetId: 'het-1' },
            { legacyHetId: 'het-1' },
          ]),
        }),
      }),
    );
  });
});

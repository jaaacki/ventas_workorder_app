import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workOrder: { findFirst: vi.fn(), findMany: vi.fn() },
  collectionUnit: { findFirst: vi.fn() },
  het: { findFirst: vi.fn(), findMany: vi.fn() },
  inventoryLot: { findMany: vi.fn() },
  inventoryTransaction: { findMany: vi.fn() },
  workOrderInventoryConsumption: { findMany: vi.fn() },
  inventoryGenealogy: { findMany: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: mocks,
}));

import {
  getCollectionUnitInventoryTrace,
  getHetInventoryTrace,
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

    await getHetInventoryTrace('het-1', tenantId);

    expect(mocks.het.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'het-1', tenantId, deleted: false } }),
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
            { workOrderId: { in: ['wo-use', 'wo-finish'] } },
          ]),
        }),
      }),
    );
  });
});

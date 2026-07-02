import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supplyEntity: { count: vi.fn(), findMany: vi.fn() },
  collectionPoint: { count: vi.fn(), findMany: vi.fn() },
  collectionUnit: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  issuanceOrder: { count: vi.fn(), findMany: vi.fn() },
  issuanceOrderLine: { findMany: vi.fn() },
  collectionUnitFulfilment: { findMany: vi.fn() },
  collectionOrder: { count: vi.fn(), findMany: vi.fn() },
  collectionReceipt: { count: vi.fn(), findMany: vi.fn() },
  collectionReceiptLine: { findMany: vi.fn() },
  het: { count: vi.fn(), findMany: vi.fn() },
  procurementImportReport: { findMany: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: mocks,
}));

import * as procurementService from '../procurementService.js';

const tenantId = 'tenant-a';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('procurementService tenant scoping', () => {
  it('scopes overview counts to the caller tenant', async () => {
    for (const count of [
      mocks.supplyEntity.count,
      mocks.collectionPoint.count,
      mocks.collectionUnit.count,
      mocks.issuanceOrder.count,
      mocks.collectionOrder.count,
      mocks.collectionReceipt.count,
      mocks.het.count,
    ]) {
      count.mockResolvedValue(1);
    }

    await procurementService.getProcurementOverview(tenantId);

    expect(mocks.supplyEntity.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.collectionPoint.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.collectionUnit.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.collectionUnit.count).toHaveBeenCalledWith({
      where: { tenantId, deleted: false, hiddenFromOperations: false },
    });
    expect(mocks.collectionUnit.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false, hiddenFromOperations: true } });
    expect(mocks.issuanceOrder.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.collectionOrder.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.collectionReceipt.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.het.count).toHaveBeenCalledWith({ where: { tenantId, collectionUnitId: { not: null } } });
  });

  it('scopes procurement list read models to the caller tenant', async () => {
    mocks.supplyEntity.findMany.mockResolvedValue([]);
    mocks.collectionPoint.findMany.mockResolvedValue([]);
    mocks.collectionUnit.findMany.mockResolvedValue([]);
    mocks.issuanceOrder.findMany.mockResolvedValue([]);
    mocks.collectionOrder.findMany.mockResolvedValue([]);
    mocks.collectionReceipt.findMany.mockResolvedValue([]);
    mocks.procurementImportReport.findMany.mockResolvedValue([]);

    await procurementService.listSupplyEntities(tenantId);
    await procurementService.listCollectionPoints(tenantId, 'supply-1');
    await procurementService.listCollectionUnits({ tenantId, status: 'received', q: 'HET', take: 25 });
    await procurementService.listIssuanceOrders(tenantId);
    await procurementService.listCollectionOrders(tenantId);
    await procurementService.listCollectionReceipts(tenantId);
    await procurementService.listImportReports({ tenantId });

    expect(mocks.supplyEntity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId, deleted: false } }));
    expect(mocks.collectionPoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, deleted: false, supplyEntityId: 'supply-1' } }),
    );
    expect(mocks.collectionUnit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          deleted: false,
          hiddenFromOperations: false,
          status: 'received',
        }),
        take: 25,
      }),
    );
    expect(mocks.issuanceOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId, deleted: false } }));
    expect(mocks.collectionOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId, deleted: false } }));
    expect(mocks.collectionReceipt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId, deleted: false } }));
    expect(mocks.procurementImportReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, deleted: false } }),
    );
  });

  it('scopes collection unit detail and trace joins to the caller tenant', async () => {
    mocks.collectionUnit.findFirst.mockResolvedValue({ id: 'unit-1' });
    mocks.issuanceOrderLine.findMany.mockResolvedValue([]);
    mocks.collectionUnitFulfilment.findMany.mockResolvedValue([]);
    mocks.collectionReceiptLine.findMany.mockResolvedValue([]);
    mocks.het.findMany.mockResolvedValue([]);

    await procurementService.getCollectionUnit('unit-1', tenantId);

    expect(mocks.collectionUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'unit-1', tenantId, deleted: false } }),
    );
    expect(mocks.issuanceOrderLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, collectionUnitId: 'unit-1', deleted: false } }),
    );
    expect(mocks.collectionUnitFulfilment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, collectionUnitId: 'unit-1', deleted: false } }),
    );
    expect(mocks.collectionReceiptLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, collectionUnitId: 'unit-1', deleted: false } }),
    );
    expect(mocks.het.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, collectionUnitId: 'unit-1' } }),
    );
  });
});

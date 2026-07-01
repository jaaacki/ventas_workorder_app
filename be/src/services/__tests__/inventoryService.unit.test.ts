import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inventorySku: { count: vi.fn(), findMany: vi.fn() },
  inventoryLot: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  inventoryTransaction: { count: vi.fn(), findMany: vi.fn() },
  inventoryLocation: { count: vi.fn(), findMany: vi.fn() },
  inventoryBalance: { count: vi.fn() },
  inventoryImportReport: { count: vi.fn(), findMany: vi.fn() },
  inventoryGenealogy: { findMany: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: mocks,
}));

import * as inventoryService from '../inventoryService.js';

const tenantId = 'tenant-a';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('inventoryService tenant scoping', () => {
  it('scopes overview counts to the caller tenant', async () => {
    for (const count of [
      mocks.inventorySku.count,
      mocks.inventoryLot.count,
      mocks.inventoryTransaction.count,
      mocks.inventoryLocation.count,
      mocks.inventoryBalance.count,
      mocks.inventoryImportReport.count,
    ]) {
      count.mockResolvedValue(1);
    }

    await inventoryService.getInventoryOverview(tenantId);

    expect(mocks.inventorySku.count).toHaveBeenCalledWith({ where: { tenantId } });
    expect(mocks.inventoryLot.count).toHaveBeenCalledWith({ where: { tenantId } });
    expect(mocks.inventoryTransaction.count).toHaveBeenCalledWith({ where: { tenantId } });
    expect(mocks.inventoryLocation.count).toHaveBeenCalledWith({ where: { tenantId } });
    expect(mocks.inventoryBalance.count).toHaveBeenCalledWith({ where: { tenantId } });
    expect(mocks.inventoryImportReport.count).toHaveBeenCalledWith({ where: { tenantId } });
    expect(mocks.inventoryLot.count).toHaveBeenCalledWith({ where: { tenantId, inventoryType: 'HET' } });
    expect(mocks.inventoryLot.count).toHaveBeenCalledWith({
      where: { tenantId, inventoryType: 'FINISHED_GOOD' },
    });
  });

  it('scopes inventory list read models to the caller tenant', async () => {
    mocks.inventorySku.findMany.mockResolvedValue([]);
    mocks.inventoryLot.findMany.mockResolvedValue([]);
    mocks.inventoryTransaction.findMany.mockResolvedValue([]);
    mocks.inventoryLocation.findMany.mockResolvedValue([]);
    mocks.inventoryImportReport.findMany.mockResolvedValue([]);

    await inventoryService.listSkus({ tenantId, q: 'graft', take: 25 });
    await inventoryService.listLots({ tenantId, q: 'lot', inventoryType: 'HET', status: 'available', take: 50 });
    await inventoryService.listTransactions({ tenantId, q: 'WO-1', take: 75 });
    await inventoryService.listLocations(tenantId);
    await inventoryService.listImportReports(tenantId);

    expect(mocks.inventorySku.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }), take: 25 }),
    );
    expect(mocks.inventoryLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId, inventoryType: 'HET', status: 'available' }),
        take: 50,
      }),
    );
    expect(mocks.inventoryTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }), take: 75 }),
    );
    expect(mocks.inventoryLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
    expect(mocks.inventoryImportReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });

  it('scopes genealogy lookup and parent/child joins to the caller tenant', async () => {
    mocks.inventoryLot.findFirst.mockResolvedValue({ id: 'lot-1' });
    mocks.inventoryGenealogy.findMany.mockResolvedValue([]);

    await inventoryService.getGenealogy('lot-1', tenantId);

    expect(mocks.inventoryLot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lot-1', tenantId } }),
    );
    expect(mocks.inventoryGenealogy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, childInventoryLotId: 'lot-1' } }),
    );
    expect(mocks.inventoryGenealogy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, parentInventoryLotId: 'lot-1' } }),
    );
  });
});

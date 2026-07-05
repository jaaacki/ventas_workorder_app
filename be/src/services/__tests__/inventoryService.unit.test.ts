import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
  inventorySku: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  inventoryLot: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  inventoryTransaction: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  inventoryLocation: { count: vi.fn(), findMany: vi.fn() },
  inventoryBalance: { count: vi.fn() },
  inventoryImportReport: { count: vi.fn(), findMany: vi.fn() },
  inventoryGenealogy: { findMany: vi.fn() },
}));

vi.mock('../auditLogService.js', () => ({
  writeAuditLog: mocks.writeAuditLog,
  listAuditLogs: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: mocks,
}));

import * as inventoryService from '../inventoryService.js';

const tenantId = 'tenant-a';
const actor = { id: 'staff-1', role: 'admin', email: 'staff@example.test', tenantId };

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

    expect(mocks.inventorySku.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.inventoryLot.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.inventoryTransaction.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.inventoryLocation.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.inventoryBalance.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.inventoryImportReport.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false } });
    expect(mocks.inventoryLot.count).toHaveBeenCalledWith({ where: { tenantId, deleted: false, inventoryType: 'HET' } });
    expect(mocks.inventoryLot.count).toHaveBeenCalledWith({
      where: { tenantId, deleted: false, inventoryType: 'FINISHED_GOOD' },
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
    await inventoryService.getLot('lot-1', tenantId);
    await inventoryService.listTransactions({ tenantId, q: 'WO-1', take: 75 });
    await inventoryService.listLocations({ tenantId });
    await inventoryService.listImportReports({ tenantId });

    expect(mocks.inventorySku.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }), take: 25 }),
    );
    expect(mocks.inventoryLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId, inventoryType: 'HET', status: 'available' }),
        take: 50,
      }),
    );
    expect(mocks.inventoryLot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lot-1', tenantId, deleted: false } }),
    );
    expect(mocks.inventoryTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }), take: 75 }),
    );
    expect(mocks.inventoryLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, deleted: false } }),
    );
    expect(mocks.inventoryImportReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, deleted: false } }),
    );
  });

  it('scopes genealogy lookup and parent/child joins to the caller tenant', async () => {
    mocks.inventoryLot.findFirst.mockResolvedValue({ id: 'lot-1' });
    mocks.inventoryGenealogy.findMany.mockResolvedValue([]);

    await inventoryService.getGenealogy('lot-1', tenantId);

    expect(mocks.inventoryLot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lot-1', tenantId, deleted: false } }),
    );
    expect(mocks.inventoryGenealogy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, childInventoryLotId: 'lot-1', deleted: false } }),
    );
    expect(mocks.inventoryGenealogy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, parentInventoryLotId: 'lot-1', deleted: false } }),
    );
  });
});

describe('inventoryService live CRUD validation', () => {
  it('rejects inventory lots without SKU, identity, and quantity context', async () => {
    await expect(
      inventoryService.createInventoryResource('lots', {
        tenantId,
        actor,
        payload: { inventorySkuId: 'sku-1', inventoryType: 'HET', status: 'available' },
      }),
    ).rejects.toThrow('Inventory lot requires a lot number, HET, or collection unit');

    expect(mocks.inventoryLot.create).not.toHaveBeenCalled();
  });

  it('rejects inventory lot statuses outside the live write vocabulary', async () => {
    await expect(
      inventoryService.createInventoryResource('lots', {
        tenantId,
        actor,
        payload: {
          inventorySkuId: 'sku-1',
          lotNumber: 'LOT-1',
          inventoryType: 'HET',
          status: 'legacy_available',
          quantityInitial: '1',
        },
      }),
    ).rejects.toThrow('status must be one of: available, reserved, consumed, quarantined, released, scrapped');

    expect(mocks.inventoryLot.create).not.toHaveBeenCalled();
  });

  it('derives hidden transaction actor and timestamp fields on create', async () => {
    const created = { id: 'txn-1', tenantId, actor: actor.id };
    mocks.inventoryTransaction.create.mockResolvedValue(created);

    await inventoryService.createInventoryResource('transactions', {
      tenantId,
      actor,
      payload: { transactionType: 'ADJUST', reason: 'Cycle count' },
    });

    expect(mocks.inventoryTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          occurredAt: expect.any(Date),
          actor: actor.id,
          transactionType: 'ADJUST',
          reason: 'Cycle count',
        }),
      }),
    );
  });

  it('rejects client-supplied provenance fields for server-owned inventory transactions', async () => {
    await expect(
      inventoryService.createInventoryResource('transactions', {
        tenantId,
        actor,
        payload: { transactionType: 'ADJUST', actor: 'someone-else' },
      }),
    ).rejects.toThrow('Server-managed field cannot be supplied: actor');

    await expect(
      inventoryService.updateInventoryResource('transactions', {
        id: 'txn-1',
        tenantId,
        actor,
        payload: { occurredAt: '2026-01-01T00:00:00.000Z' },
      }),
    ).rejects.toThrow('Server-managed field cannot be supplied: occurredAt');

    expect(mocks.inventoryTransaction.create).not.toHaveBeenCalled();
  });
});

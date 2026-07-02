import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
  listAuditLogs: vi.fn(),
  supplyEntity: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  collectionPoint: {
    findFirst: vi.fn(),
  },
  inventoryLocation: {
    findFirst: vi.fn(),
  },
  inventoryLot: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../auditLogService.js', () => ({
  writeAuditLog: mocks.writeAuditLog,
  listAuditLogs: mocks.listAuditLogs,
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    supplyEntity: mocks.supplyEntity,
    collectionPoint: mocks.collectionPoint,
    inventoryLocation: mocks.inventoryLocation,
    inventoryLot: mocks.inventoryLot,
  },
}));

import {
  archiveCrud,
  createCrud,
  listCrud,
  requireSameTenant,
  restoreCrud,
  updateCrud,
  type CrudResourceConfig,
} from '../auditedCrudService.js';
import { inventoryCrudResources } from '../inventoryService.js';

const actor = {
  id: 'staff-1',
  role: 'admin',
  email: 'admin@example.test',
  tenantId: 'tenant-a',
};

const supplyConfig: CrudResourceConfig = {
  resource: 'procurement.supplyEntity',
  entityType: 'SupplyEntity',
  delegate: 'supplyEntity',
  mutableFields: ['name', 'externalCode'],
  createRequiredFields: ['name'],
  searchableFields: ['name'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('audited CRUD service', () => {
  it('creates tenant-scoped rows with generated IDs, actor metadata, and audit log entries', async () => {
    const created = {
      id: 'generated-id',
      tenantId: 'tenant-a',
      name: 'Clinic A',
      createdById: actor.id,
      updatedById: actor.id,
      deleted: false,
    };
    mocks.supplyEntity.create.mockResolvedValue(created);

    const result = await createCrud(supplyConfig, {
      tenantId: 'tenant-a',
      actor,
      payload: { name: 'Clinic A', externalCode: 'CL-A' },
    });

    expect(result).toBe(created);
    expect(mocks.supplyEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: expect.any(String),
          tenantId: 'tenant-a',
          name: 'Clinic A',
          externalCode: 'CL-A',
          createdById: actor.id,
          updatedById: actor.id,
        }),
      }),
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        actor,
        entityType: 'SupplyEntity',
        entityId: 'generated-id',
        action: 'create',
        after: created,
      }),
    );
  });

  it('rejects missing required create fields before writing', async () => {
    await expect(
      createCrud(supplyConfig, {
        tenantId: 'tenant-a',
        actor,
        payload: { externalCode: 'CL-A' },
      }),
    ).rejects.toThrow('Missing required field: name');

    expect(mocks.supplyEntity.create).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it('rejects unsupported create and update fields instead of silently dropping them', async () => {
    await expect(
      createCrud(supplyConfig, {
        tenantId: 'tenant-a',
        actor,
        payload: { name: 'Clinic A', tenantId: 'tenant-b' },
      }),
    ).rejects.toThrow('Unsupported field: tenantId');

    mocks.supplyEntity.findFirst.mockResolvedValue({ id: 'supply-1', tenantId: 'tenant-a', deleted: false });

    await expect(
      updateCrud(supplyConfig, {
        id: 'supply-1',
        tenantId: 'tenant-a',
        actor,
        payload: { deleted: true },
      }),
    ).rejects.toThrow('Unsupported field: deleted');
  });

  it('archives and restores rows with actor metadata and append-only audit entries', async () => {
    const existing = { id: 'supply-1', tenantId: 'tenant-a', name: 'Clinic A', deleted: false };
    const archived = { ...existing, deleted: true, deletedById: actor.id };
    const restored = { ...existing, deleted: false, deletedById: null };

    mocks.supplyEntity.findFirst.mockResolvedValueOnce(existing);
    mocks.supplyEntity.update.mockResolvedValueOnce(archived);

    await expect(archiveCrud(supplyConfig, { id: 'supply-1', tenantId: 'tenant-a', actor })).resolves.toBe(archived);
    expect(mocks.supplyEntity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'supply-1' },
        data: expect.objectContaining({
          deleted: true,
          deletedAt: expect.any(Date),
          deletedById: actor.id,
          updatedById: actor.id,
        }),
      }),
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', before: existing, after: archived }));

    mocks.supplyEntity.findFirst.mockResolvedValueOnce(archived);
    mocks.supplyEntity.update.mockResolvedValueOnce(restored);

    await expect(restoreCrud(supplyConfig, { id: 'supply-1', tenantId: 'tenant-a', actor })).resolves.toBe(restored);
    expect(mocks.supplyEntity.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'supply-1' },
        data: expect.objectContaining({
          deleted: false,
          deletedAt: null,
          deletedById: null,
          updatedById: actor.id,
        }),
      }),
    );
    expect(mocks.writeAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'restore', before: archived, after: restored }));
  });

  it('lists active rows by default and includes archived rows only when requested by the route layer', async () => {
    mocks.supplyEntity.findMany.mockResolvedValue([]);

    await listCrud(supplyConfig, { tenantId: 'tenant-a' });
    expect(mocks.supplyEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', deleted: false }) }),
    );

    await listCrud(supplyConfig, { tenantId: 'tenant-a', includeDeleted: true });
    expect(mocks.supplyEntity.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ deleted: false }) }),
    );
  });

  it('validates same-tenant references before mutation', async () => {
    mocks.collectionPoint.findFirst.mockResolvedValue(null);

    await expect(requireSameTenant('collectionPoint', 'point-b', 'tenant-a', 'Collection point')).rejects.toThrow(
      'Collection point must exist in the same tenant',
    );
    expect(mocks.collectionPoint.findFirst).toHaveBeenCalledWith({
      where: { id: 'point-b', tenantId: 'tenant-a', deleted: false },
      select: { id: true },
    });
  });

  it('rejects inventory location parent cycles through resource validators', async () => {
    mocks.inventoryLocation.findFirst
      .mockResolvedValueOnce({ id: 'loc-current', tenantId: 'tenant-a', deleted: false })
      .mockResolvedValueOnce({ id: 'loc-parent' })
      .mockResolvedValueOnce({ parentLocationId: 'loc-child' })
      .mockResolvedValueOnce({ parentLocationId: 'loc-current' });

    await expect(
      updateCrud(inventoryCrudResources.locations, {
        id: 'loc-current',
        tenantId: 'tenant-a',
        actor,
        payload: { parentLocationId: 'loc-parent' },
      }),
    ).rejects.toThrow('Location parent cycle is not allowed');
  });

  it('rejects genealogy self-links through resource validators', async () => {
    await expect(
      createCrud(inventoryCrudResources.genealogy, {
        tenantId: 'tenant-a',
        actor,
        payload: {
          parentInventoryLotId: 'lot-1',
          childInventoryLotId: 'lot-1',
          relationshipType: 'consumed_into',
        },
      }),
    ).rejects.toThrow('Genealogy parent and child lots must be different');
  });

  it('requires a reason or remarks for inventory transaction movement corrections', async () => {
    const existing = {
      id: 'txn-1',
      tenantId: 'tenant-a',
      transactionType: 'ADJUST',
      quantity: '1.0000',
      deleted: false,
    };
    const config: CrudResourceConfig = {
      ...inventoryCrudResources.transactions,
      delegate: 'supplyEntity',
    };
    mocks.supplyEntity.findFirst.mockResolvedValue(existing);

    await expect(
      updateCrud(config, {
        id: 'txn-1',
        tenantId: 'tenant-a',
        actor,
        payload: { quantity: '2.0000' },
      }),
    ).rejects.toThrow('Inventory transaction corrections require a reason or remarks');
  });
});

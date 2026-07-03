import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bom: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  bomLine: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  phaseEquip: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    bom: mocks.bom,
    bomLine: mocks.bomLine,
    phaseEquip: mocks.phaseEquip,
    auditLog: mocks.auditLog,
  },
}));

import {
  createBom,
  createBomLine,
  createPhaseEquipment,
  deleteBomLine,
  deletePhaseEquipment,
  listBomLines,
  updateBomLine,
  updatePhaseEquipment,
} from '../masterDataService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('masterDataService', () => {
  it('creates BOM and phase-equipment records with tenant and audit actor', async () => {
    mocks.bom.create.mockResolvedValue({ id: 'bom-1' });
    mocks.phaseEquip.create.mockResolvedValue({ id: 'equip-1' });

    await createBom({ bomName: 'Intake BOM' }, 'actor1', 'tenant-a');
    await createPhaseEquipment({ equipId: 'EQ-1', name: 'Heat sealer' }, 'actor1', 'tenant-a');

    // Every create writes an audit-log entry attributed to the actor.
    expect(mocks.auditLog.create).toHaveBeenCalledTimes(2);

    expect(mocks.bom.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', bomName: 'Intake BOM', createdById: 'actor1', updatedById: 'actor1' }),
    }));
    expect(mocks.phaseEquip.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', equipId: 'EQ-1', name: 'Heat sealer', createdById: 'actor1', updatedById: 'actor1' }),
    }));
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', actorId: 'actor1', entityType: 'PhaseEquip', entityId: 'equip-1', action: 'create' }),
    }));
  });

  it('updates phase equipment only after tenant ownership preflight', async () => {
    mocks.phaseEquip.updateMany.mockResolvedValue({ count: 1 });
    mocks.phaseEquip.findFirstOrThrow.mockResolvedValue({ id: 'equip-1' });

    await updatePhaseEquipment('equip-1', { description: 'Updated' }, 'actor1', 'tenant-a');

    expect(mocks.phaseEquip.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'equip-1', tenantId: 'tenant-a' },
      data: expect.objectContaining({ description: 'Updated', updatedById: 'actor1' }),
    }));
    expect(mocks.phaseEquip.findFirstOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'equip-1', tenantId: 'tenant-a' },
    }));
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'PhaseEquip', entityId: 'equip-1', action: 'update', actorId: 'actor1' }),
    }));
  });

  it('rejects updates when a record is outside the caller tenant', async () => {
    mocks.phaseEquip.updateMany.mockResolvedValue({ count: 0 });

    await expect(updatePhaseEquipment('equip-1', { description: 'Updated' }, 'actor1', 'tenant-a')).rejects.toMatchObject({
      code: 'P2025',
    });

    expect(mocks.phaseEquip.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('lists BOM lines scoped to a tenant-owned BOM and hides deleted lines by default', async () => {
    mocks.bom.findFirst.mockResolvedValue({ id: 'bom-1', bomName: 'Intake BOM' });
    mocks.bomLine.findMany.mockResolvedValue([]);

    await listBomLines({ tenantId: 'tenant-a', bomId: 'bom-1' });

    expect(mocks.bom.findFirst).toHaveBeenCalledWith({
      where: { id: 'bom-1', tenantId: 'tenant-a' },
      select: { id: true, bomName: true },
    });
    expect(mocks.bomLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', bomId: 'bom-1', deleted: false },
    }));
  });

  it('creates and updates BOM lines only under tenant-owned BOMs', async () => {
    mocks.bom.findFirst.mockResolvedValue({ id: 'bom-1', bomName: 'Intake BOM' });
    mocks.bomLine.create.mockResolvedValue({ id: 'bom-line-1' });
    mocks.bomLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.bomLine.findFirstOrThrow.mockResolvedValue({ id: 'bom-line-1' });

    await createBomLine({ bomId: 'bom-1', description: 'Membrane', quantity: '1.0000', hasSerial: true }, 'actor1', 'tenant-a');
    await updateBomLine('bom-line-1', { bomId: 'bom-1', quantity: '2.0000' }, 'actor1', 'tenant-a');

    expect(mocks.bomLine.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        bomId: 'bom-1',
        bomName: 'Intake BOM',
        description: 'Membrane',
        hasSerial: true,
        createdById: 'actor1',
        updatedById: 'actor1',
      }),
    }));
    expect(mocks.bomLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bom-line-1', tenantId: 'tenant-a', deleted: false },
      data: expect.objectContaining({ bomId: 'bom-1', updatedById: 'actor1' }),
    }));
  });

  it('soft-deletes BOM lines to preserve serial evidence references', async () => {
    mocks.bomLine.updateMany.mockResolvedValue({ count: 1 });

    await expect(deleteBomLine('bom-line-1', 'actor1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.bomLine.updateMany).toHaveBeenCalledWith({
      where: { id: 'bom-line-1', tenantId: 'tenant-a', deleted: false },
      data: { deleted: true, updatedById: 'actor1' },
    });
  });

  it('deletes phase equipment only after tenant ownership preflight', async () => {
    mocks.phaseEquip.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deletePhaseEquipment('equip-1', 'actor1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.phaseEquip.deleteMany).toHaveBeenCalledWith({ where: { id: 'equip-1', tenantId: 'tenant-a' } });
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'PhaseEquip', entityId: 'equip-1', action: 'delete', actorId: 'actor1' }),
    }));
  });
});

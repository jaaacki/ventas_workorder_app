import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  procedure: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
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
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    procedure: mocks.procedure,
    bom: mocks.bom,
    bomLine: mocks.bomLine,
    phaseEquip: mocks.phaseEquip,
  },
}));

import {
  createBom,
  createBomLine,
  createPhaseEquipment,
  createProcedure,
  deleteBomLine,
  deletePhaseEquipment,
  deleteProcedure,
  listBomLines,
  updateBomLine,
  updateProcedure,
} from '../masterDataService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('masterDataService', () => {
  it('creates procedure, BOM, and phase-equipment records with tenant and audit actor', async () => {
    mocks.procedure.create.mockResolvedValue({ id: 'procedure-1' });
    mocks.bom.create.mockResolvedValue({ id: 'bom-1' });
    mocks.phaseEquip.create.mockResolvedValue({ id: 'equip-1' });

    await createProcedure({ procedureName: 'Intake checklist' }, 'actor1', 'tenant-a');
    await createBom({ bomName: 'Intake BOM' }, 'actor1', 'tenant-a');
    await createPhaseEquipment({ equipId: 'EQ-1', name: 'Heat sealer' }, 'actor1', 'tenant-a');

    expect(mocks.procedure.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', procedureName: 'Intake checklist', createdById: 'actor1', updatedById: 'actor1' }),
    }));
    expect(mocks.bom.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', bomName: 'Intake BOM', createdById: 'actor1', updatedById: 'actor1' }),
    }));
    expect(mocks.phaseEquip.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', equipId: 'EQ-1', name: 'Heat sealer', createdById: 'actor1', updatedById: 'actor1' }),
    }));
  });

  it('updates and deletes procedures only after tenant ownership preflight', async () => {
    mocks.procedure.updateMany.mockResolvedValue({ count: 1 });
    mocks.procedure.findFirstOrThrow.mockResolvedValue({ id: 'procedure-1' });
    mocks.procedure.deleteMany.mockResolvedValue({ count: 1 });

    await updateProcedure('procedure-1', { procedureDesc: 'Updated' }, 'actor1', 'tenant-a');
    await deleteProcedure('procedure-1', 'tenant-a');

    expect(mocks.procedure.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'procedure-1', tenantId: 'tenant-a' },
      data: expect.objectContaining({ procedureDesc: 'Updated', updatedById: 'actor1' }),
    }));
    expect(mocks.procedure.findFirstOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'procedure-1', tenantId: 'tenant-a' },
    }));
    expect(mocks.procedure.deleteMany).toHaveBeenCalledWith({ where: { id: 'procedure-1', tenantId: 'tenant-a' } });
  });

  it('rejects updates when a record is outside the caller tenant', async () => {
    mocks.procedure.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateProcedure('procedure-1', { procedureDesc: 'Updated' }, 'actor1', 'tenant-a')).rejects.toMatchObject({
      code: 'P2025',
    });

    expect(mocks.procedure.findFirstOrThrow).not.toHaveBeenCalled();
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

    await expect(deletePhaseEquipment('equip-1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.phaseEquip.deleteMany).toHaveBeenCalledWith({ where: { id: 'equip-1', tenantId: 'tenant-a' } });
  });
});

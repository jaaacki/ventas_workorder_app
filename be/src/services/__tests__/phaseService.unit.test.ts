import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  phase: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  procedure: {
    findFirst: vi.fn(),
  },
  phaseProcedure: {
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  phaseEquip: {
    findFirst: vi.fn(),
  },
  phasePhaseEquip: {
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    phase: mocks.phase,
    procedure: mocks.procedure,
    phaseProcedure: mocks.phaseProcedure,
    phaseEquip: mocks.phaseEquip,
    phasePhaseEquip: mocks.phasePhaseEquip,
  },
}));

import {
  addPhaseEquipment,
  addPhaseProcedure,
  createPhase,
  deletePhase,
  deletePhaseEquipment,
  deletePhaseProcedure,
  getPhase,
  listPhaseEquipmentBindings,
  listPhaseProcedures,
  listPhases,
  updatePhase,
} from '../phaseService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('phaseService', () => {
  it('lists the tenant phase catalog ordered for workflow binding', async () => {
    mocks.phase.findMany.mockResolvedValue([]);

    await listPhases('tenant-a');

    expect(mocks.phase.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: {
        id: true,
        tenantId: true,
        phaseName: true,
        phaseShort: true,
        phaseOrder: true,
        description: true,
        bomId: true,
        keyText: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { phaseOrder: 'asc' },
        { phaseName: 'asc' },
        { id: 'asc' },
      ],
    });
  });

  it('gets a single phase by tenant', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });

    await getPhase('phase-1', 'tenant-a');

    expect(mocks.phase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'phase-1', tenantId: 'tenant-a' } }),
    );
  });

  it('creates a phase with tenant and audit actor', async () => {
    mocks.phase.create.mockResolvedValue({ id: 'phase-1' });

    await createPhase({ phaseName: 'Intake', phaseShort: 'INT', phaseOrder: 10 }, 'actor1', 'tenant-a');

    expect(mocks.phase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: expect.any(String),
          tenantId: 'tenant-a',
          phaseName: 'Intake',
          phaseShort: 'INT',
          phaseOrder: 10,
          createdById: 'actor1',
          updatedById: 'actor1',
        }),
      }),
    );
  });

  it('updates a tenant phase after ownership preflight', async () => {
    mocks.phase.updateMany.mockResolvedValue({ count: 1 });
    mocks.phase.findFirstOrThrow.mockResolvedValue({ id: 'phase-1', description: 'Updated' });

    await updatePhase('phase-1', { description: 'Updated' }, 'actor1', 'tenant-a');

    expect(mocks.phase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'phase-1', tenantId: 'tenant-a' },
        data: expect.objectContaining({ description: 'Updated', updatedById: 'actor1' }),
      }),
    );
  });

  it('rejects update when the phase is outside the caller tenant', async () => {
    mocks.phase.updateMany.mockResolvedValue({ count: 0 });

    await expect(updatePhase('phase-1', { description: 'Updated' }, 'actor1', 'tenant-a')).rejects.toMatchObject({
      code: 'P2025',
    });

    expect(mocks.phase.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('deletes an unused phase after ownership preflight', async () => {
    mocks.phase.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deletePhase('phase-1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.phase.deleteMany).toHaveBeenCalledWith({ where: { id: 'phase-1', tenantId: 'tenant-a' } });
  });

  it('rejects delete when the phase is outside the caller tenant', async () => {
    mocks.phase.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deletePhase('phase-1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });

    expect(mocks.phase.deleteMany).toHaveBeenCalledWith({ where: { id: 'phase-1', tenantId: 'tenant-a' } });
  });

  it('lists procedure and equipment bindings after tenant phase preflight', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.phaseProcedure.findMany.mockResolvedValue([]);
    mocks.phasePhaseEquip.findMany.mockResolvedValue([]);

    await listPhaseProcedures('phase-1', 'tenant-a');
    await listPhaseEquipmentBindings('phase-1', 'tenant-a');

    expect(mocks.phase.findFirst).toHaveBeenCalledWith({
      where: { id: 'phase-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(mocks.phaseProcedure.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { phaseId: 'phase-1' },
    }));
    expect(mocks.phasePhaseEquip.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { phaseId: 'phase-1' },
    }));
  });

  it('adds procedure bindings only when both sides belong to the caller tenant', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.procedure.findFirst.mockResolvedValue({ id: 'procedure-1' });
    mocks.phaseProcedure.upsert.mockResolvedValue({ phaseId: 'phase-1', procedureId: 'procedure-1' });

    await addPhaseProcedure('phase-1', 'procedure-1', 'tenant-a');

    expect(mocks.procedure.findFirst).toHaveBeenCalledWith({
      where: { id: 'procedure-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(mocks.phaseProcedure.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { phaseId_procedureId: { phaseId: 'phase-1', procedureId: 'procedure-1' } },
      create: { phaseId: 'phase-1', procedureId: 'procedure-1' },
      update: {},
    }));
  });

  it('rejects procedure binding when procedure is outside the caller tenant', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.procedure.findFirst.mockResolvedValue(null);

    await expect(addPhaseProcedure('phase-1', 'procedure-1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });

    expect(mocks.phaseProcedure.upsert).not.toHaveBeenCalled();
  });

  it('removes procedure bindings after phase tenant preflight', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.phaseProcedure.findUnique.mockResolvedValue({ phaseId: 'phase-1' });
    mocks.phaseProcedure.delete.mockResolvedValue({ phaseId: 'phase-1', procedureId: 'procedure-1' });

    await expect(deletePhaseProcedure('phase-1', 'procedure-1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.phaseProcedure.delete).toHaveBeenCalledWith({
      where: { phaseId_procedureId: { phaseId: 'phase-1', procedureId: 'procedure-1' } },
    });
  });

  it('adds equipment bindings only when both sides belong to the caller tenant', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.phaseEquip.findFirst.mockResolvedValue({ id: 'equip-1' });
    mocks.phasePhaseEquip.upsert.mockResolvedValue({ phaseId: 'phase-1', phaseEquipId: 'equip-1' });

    await addPhaseEquipment('phase-1', 'equip-1', 'tenant-a');

    expect(mocks.phaseEquip.findFirst).toHaveBeenCalledWith({
      where: { id: 'equip-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(mocks.phasePhaseEquip.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { phaseId_phaseEquipId: { phaseId: 'phase-1', phaseEquipId: 'equip-1' } },
      create: { phaseId: 'phase-1', phaseEquipId: 'equip-1' },
      update: {},
    }));
  });

  it('removes equipment bindings after phase tenant preflight', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.phasePhaseEquip.findUnique.mockResolvedValue({ phaseId: 'phase-1' });
    mocks.phasePhaseEquip.delete.mockResolvedValue({ phaseId: 'phase-1', phaseEquipId: 'equip-1' });

    await expect(deletePhaseEquipment('phase-1', 'equip-1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.phasePhaseEquip.delete).toHaveBeenCalledWith({
      where: { phaseId_phaseEquipId: { phaseId: 'phase-1', phaseEquipId: 'equip-1' } },
    });
  });
});

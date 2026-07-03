import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  phase: {
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    updateMany: vi.fn(),
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
  auditLog: { create: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    phase: mocks.phase,
    phaseEquip: mocks.phaseEquip,
    phasePhaseEquip: mocks.phasePhaseEquip,
    auditLog: mocks.auditLog,
  },
}));

import {
  addPhaseEquipment,
  deletePhase,
  deletePhaseEquipment,
  listPhaseEquipmentBindings,
  updatePhase,
} from '../phaseService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('phaseService', () => {
  it('updates a tenant phase (label + gate/combine flags) after ownership preflight', async () => {
    mocks.phase.updateMany.mockResolvedValue({ count: 1 });
    mocks.phase.findFirstOrThrow.mockResolvedValue({ id: 'phase-1', isGate: true });

    await updatePhase('phase-1', { description: 'Updated', isGate: true, blocksCombine: false }, 'actor1', 'tenant-a');

    expect(mocks.phase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'phase-1', tenantId: 'tenant-a' },
        data: expect.objectContaining({ description: 'Updated', isGate: true, blocksCombine: false, updatedById: 'actor1' }),
      }),
    );
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'Phase', entityId: 'phase-1', action: 'update', actorId: 'actor1' }),
    }));
  });

  it('rejects update when the phase is outside the caller tenant', async () => {
    mocks.phase.updateMany.mockResolvedValue({ count: 0 });

    await expect(updatePhase('phase-1', { description: 'Updated' }, 'actor1', 'tenant-a')).rejects.toMatchObject({
      code: 'P2025',
    });

    expect(mocks.phase.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('deletes a phase after ownership preflight (its steps fall back to the pool)', async () => {
    mocks.phase.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deletePhase('phase-1', 'actor1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.phase.deleteMany).toHaveBeenCalledWith({ where: { id: 'phase-1', tenantId: 'tenant-a' } });
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'Phase', entityId: 'phase-1', action: 'delete', actorId: 'actor1' }),
    }));
  });

  it('rejects delete when the phase is outside the caller tenant', async () => {
    mocks.phase.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deletePhase('phase-1', 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });

    expect(mocks.phase.deleteMany).toHaveBeenCalledWith({ where: { id: 'phase-1', tenantId: 'tenant-a' } });
  });

  it('lists equipment bindings after tenant phase preflight', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.phasePhaseEquip.findMany.mockResolvedValue([]);

    await listPhaseEquipmentBindings('phase-1', 'tenant-a');

    expect(mocks.phase.findFirst).toHaveBeenCalledWith({
      where: { id: 'phase-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(mocks.phasePhaseEquip.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { phaseId: 'phase-1' },
    }));
  });

  it('adds equipment bindings only when both sides belong to the caller tenant', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.phaseEquip.findFirst.mockResolvedValue({ id: 'equip-1' });
    mocks.phasePhaseEquip.upsert.mockResolvedValue({ phaseId: 'phase-1', phaseEquipId: 'equip-1' });

    await addPhaseEquipment('phase-1', 'equip-1', 'actor1', 'tenant-a');

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

    await expect(deletePhaseEquipment('phase-1', 'equip-1', 'actor1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.phasePhaseEquip.delete).toHaveBeenCalledWith({
      where: { phaseId_phaseEquipId: { phaseId: 'phase-1', phaseEquipId: 'equip-1' } },
    });
  });
});

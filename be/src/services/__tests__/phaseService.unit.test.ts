import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  phase: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    phase: mocks.phase,
  },
}));

import { createPhase, deletePhase, getPhase, listPhases, updatePhase } from '../phaseService.js';

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
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.phase.update.mockResolvedValue({ id: 'phase-1', description: 'Updated' });

    await updatePhase('phase-1', { description: 'Updated' }, 'actor1', 'tenant-a');

    expect(mocks.phase.findFirst).toHaveBeenCalledWith({
      where: { id: 'phase-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(mocks.phase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'phase-1' },
        data: expect.objectContaining({ description: 'Updated', updatedById: 'actor1' }),
      }),
    );
  });

  it('rejects update when the phase is outside the caller tenant', async () => {
    mocks.phase.findFirst.mockResolvedValue(null);

    await expect(updatePhase('phase-1', { description: 'Updated' }, 'actor1', 'tenant-a')).rejects.toMatchObject({
      code: 'P2025',
    });

    expect(mocks.phase.update).not.toHaveBeenCalled();
  });

  it('deletes an unused phase after ownership preflight', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'phase-1' });
    mocks.phase.delete.mockResolvedValue({ id: 'phase-1' });

    await expect(deletePhase('phase-1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.phase.findFirst).toHaveBeenCalledWith({
      where: { id: 'phase-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(mocks.phase.delete).toHaveBeenCalledWith({ where: { id: 'phase-1' } });
  });

  it('rejects delete when the phase is outside the caller tenant', async () => {
    mocks.phase.findFirst.mockResolvedValue(null);

    await expect(deletePhase('phase-1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });

    expect(mocks.phase.delete).not.toHaveBeenCalled();
  });
});

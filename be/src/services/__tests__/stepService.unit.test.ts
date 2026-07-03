import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflow: { findFirst: vi.fn() },
  phase: { findFirst: vi.fn() },
  step: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    workflow: mocks.workflow,
    phase: mocks.phase,
    step: mocks.step,
    auditLog: mocks.auditLog,
    $transaction: mocks.$transaction.mockImplementation(async (ops: unknown) => Promise.all(ops as Promise<unknown>[])),
  },
}));

import * as stepService from '../stepService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('stepService', () => {
  it('createStep appends to the unplaced pool when no phaseId is given', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.step.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
    mocks.step.create.mockResolvedValue({ id: 's1' });

    await stepService.createStep('w1', { code: 'X1', name: 'Spare' }, 'actor1', 'tenant-a');

    expect(mocks.step.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { workflowId: 'w1', phaseId: null } }));
    expect(mocks.step.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-a', workflowId: 'w1', phaseId: null, sortOrder: 3, code: 'X1', name: 'Spare' }),
      }),
    );
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'Step', entityId: 's1', action: 'create', actorId: 'actor1' }),
    }));
  });

  it('createStep validates the phase belongs to the same workflow when placing', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.phase.findFirst.mockResolvedValue(null);
    await expect(stepService.createStep('w1', { phaseId: 'other' }, 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });
    expect(mocks.step.create).not.toHaveBeenCalled();
  });

  it('placeStep appends to the target phase and validates same-workflow ownership', async () => {
    mocks.step.findFirst.mockResolvedValue({ id: 's1', workflowId: 'w1', phaseId: null });
    mocks.phase.findFirst.mockResolvedValue({ id: 'p1' });
    mocks.step.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
    mocks.step.findFirstOrThrow.mockResolvedValue({ id: 's1', phaseId: 'p1', sortOrder: 1 });

    await stepService.placeStep('s1', { phaseId: 'p1' }, 'actor1', 'tenant-a');

    expect(mocks.phase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', workflowId: 'w1', tenantId: 'tenant-a' } }));
    expect(mocks.step.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 's1' },
      data: expect.objectContaining({ phaseId: 'p1', sortOrder: 1, updatedById: 'actor1' }),
    }));
  });

  it('placeStep honours an explicit sortOrder', async () => {
    mocks.step.findFirst.mockResolvedValue({ id: 's1', workflowId: 'w1', phaseId: null });
    mocks.phase.findFirst.mockResolvedValue({ id: 'p1' });
    mocks.step.findFirstOrThrow.mockResolvedValue({ id: 's1' });

    await stepService.placeStep('s1', { phaseId: 'p1', sortOrder: 2 }, 'actor1', 'tenant-a');

    expect(mocks.step.aggregate).not.toHaveBeenCalled();
    expect(mocks.step.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phaseId: 'p1', sortOrder: 2 }),
    }));
  });

  it('unplaceStep moves the step back to the pool (phaseId null)', async () => {
    mocks.step.findFirst.mockResolvedValue({ id: 's1', workflowId: 'w1', phaseId: 'p1' });
    mocks.step.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mocks.step.findFirstOrThrow.mockResolvedValue({ id: 's1', phaseId: null, sortOrder: 0 });

    await stepService.unplaceStep('s1', 'actor1', 'tenant-a');

    expect(mocks.step.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { workflowId: 'w1', phaseId: null } }));
    expect(mocks.step.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phaseId: null, sortOrder: 0, updatedById: 'actor1' }),
    }));
  });

  it('reorderPhaseSteps sets each step sortOrder to its index within the phase', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'p1' });
    mocks.step.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    mocks.step.updateMany.mockResolvedValue({ count: 1 });

    await expect(stepService.reorderPhaseSteps('p1', ['s2', 's1'], 'actor1', 'tenant-a')).resolves.toEqual({ success: true });

    expect(mocks.step.updateMany).toHaveBeenCalledWith({
      where: { id: 's2', phaseId: 'p1', tenantId: 'tenant-a' },
      data: { sortOrder: 0, updatedById: 'actor1' },
    });
    expect(mocks.step.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', phaseId: 'p1', tenantId: 'tenant-a' },
      data: { sortOrder: 1, updatedById: 'actor1' },
    });
  });

  it('reorderPhaseSteps throws P2025 when the id list is not exactly the phase step set', async () => {
    mocks.phase.findFirst.mockResolvedValue({ id: 'p1' });
    mocks.step.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    // Wrong id (s3 is not a step of this phase) must be rejected, not silently no-op.
    await expect(stepService.reorderPhaseSteps('p1', ['s1', 's3'], 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });
    expect(mocks.step.updateMany).not.toHaveBeenCalled();
  });

  it('updateStep throws P2025 when the step is outside the caller tenant', async () => {
    mocks.step.updateMany.mockResolvedValue({ count: 0 });
    await expect(stepService.updateStep('s1', { name: 'x' }, 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });
  });
});

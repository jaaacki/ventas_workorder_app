import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflow: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  phase: {
    aggregate: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  workOrder: { count: vi.fn() },
  bom: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    workflow: mocks.workflow,
    phase: mocks.phase,
    workOrder: mocks.workOrder,
    bom: mocks.bom,
    auditLog: mocks.auditLog,
    $transaction: mocks.$transaction.mockImplementation(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => Promise<unknown>)({ workflow: mocks.workflow, phase: mocks.phase }),
    ),
  },
}));

import * as workflowService from '../workflowService.js';

const detail = {
  id: 'w1',
  name: 'AmGraft',
  code: 'AMG',
  description: null,
  active: true,
  phases: [{ id: 'p1', phaseShort: 'A', phaseName: 'Material Acquisition', description: null, sortOrder: 0, isGate: false, blocksCombine: true, bomId: null, steps: [] }],
  steps: [{ id: 's-pool', code: 'X1', name: 'Spare', description: null, sortOrder: 0 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workflowService', () => {
  it('listWorkflows filters by active and maps phase/step counts', async () => {
    mocks.workflow.findMany.mockResolvedValue([
      { id: 'w1', name: 'AmGraft', code: 'AMG', description: null, active: true, _count: { phases: 8, steps: 28 } },
    ]);
    const result = await workflowService.listWorkflows({ activeOnly: true });
    expect(mocks.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true, tenantId: 'ventas' } }),
    );
    expect(result).toEqual([
      { id: 'w1', name: 'AmGraft', code: 'AMG', description: null, active: true, phaseCount: 8, stepCount: 28 },
    ]);
  });

  it('listWorkflows applies no active filter by default', async () => {
    mocks.workflow.findMany.mockResolvedValue([]);
    await workflowService.listWorkflows();
    expect(mocks.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'ventas' } }),
    );
  });

  it('getWorkflow returns phases and remaps the unplaced step pool', async () => {
    mocks.workflow.findFirst.mockResolvedValue(detail);
    const result = await workflowService.getWorkflow('w1');
    expect(mocks.workflow.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'w1', tenantId: 'ventas' } }));
    expect(result).toMatchObject({ id: 'w1', phases: detail.phases, unplacedSteps: detail.steps });
    expect((result as Record<string, unknown>).steps).toBeUndefined();
  });

  it('createWorkflow creates with tenant + audit actor and returns the detail shape', async () => {
    mocks.workflow.create.mockResolvedValue({ id: 'w1' });
    mocks.workflow.findFirst.mockResolvedValue(detail);
    const result = await workflowService.createWorkflow({ name: 'AmGraft', code: 'AMG', description: null }, 'actor1', 'tenant-a');
    expect(mocks.workflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-a', name: 'AmGraft', code: 'AMG', createdById: 'actor1', updatedById: 'actor1' }),
        select: { id: true },
      }),
    );
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'Workflow', entityId: 'w1', action: 'create', actorId: 'actor1' }),
    }));
    expect(result).toMatchObject({ id: 'w1', phases: detail.phases, unplacedSteps: detail.steps });
    expect((result as Record<string, unknown>).steps).toBeUndefined();
  });

  it('updateWorkflow patches metadata and audits before/after', async () => {
    mocks.workflow.findFirst.mockResolvedValue(detail);
    mocks.workflow.updateMany.mockResolvedValue({ count: 1 });
    await workflowService.updateWorkflow('w1', { name: 'AmGraft v2', code: 'AMG2', active: false }, 'actor1', 'tenant-a');
    expect(mocks.workflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w1', tenantId: 'tenant-a' },
        data: expect.objectContaining({ name: 'AmGraft v2', code: 'AMG2', active: false, updatedById: 'actor1' }),
      }),
    );
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'Workflow', entityId: 'w1', action: 'update', actorId: 'actor1' }),
    }));
  });

  it('updateWorkflow throws P2025 when the workflow is outside the caller tenant', async () => {
    mocks.workflow.findFirst.mockResolvedValue(null);
    mocks.workflow.updateMany.mockResolvedValue({ count: 0 });
    await expect(workflowService.updateWorkflow('w1', { active: false }, 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });
  });

  it('deleteWorkflow deletes and audits, cascading owned phases/steps', async () => {
    mocks.workflow.findFirst.mockResolvedValue(detail);
    mocks.workOrder.count.mockResolvedValue(0);
    mocks.workflow.deleteMany.mockResolvedValue({ count: 1 });
    await expect(workflowService.deleteWorkflow('w1', 'actor1', 'tenant-a')).resolves.toEqual({ success: true });
    expect(mocks.workflow.deleteMany).toHaveBeenCalledWith({ where: { id: 'w1', tenantId: 'tenant-a' } });
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'Workflow', entityId: 'w1', action: 'delete', actorId: 'actor1' }),
    }));
  });

  it('deleteWorkflow throws P2003 when live work orders still reference it', async () => {
    mocks.workflow.findFirst.mockResolvedValue(detail);
    mocks.workOrder.count.mockResolvedValue(3);
    await expect(workflowService.deleteWorkflow('w1', 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2003' });
    expect(mocks.workflow.deleteMany).not.toHaveBeenCalled();
  });

  it('deleteWorkflow throws P2025 when nothing was deleted', async () => {
    mocks.workflow.findFirst.mockResolvedValue(null);
    mocks.workOrder.count.mockResolvedValue(0);
    mocks.workflow.deleteMany.mockResolvedValue({ count: 0 });
    await expect(workflowService.deleteWorkflow('w1', 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });
  });

  it('addPhase appends after the current max sortOrder within the tenant workflow', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.phase.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
    mocks.phase.create.mockResolvedValue({ id: 'p9' });
    await workflowService.addPhase('w1', { phaseShort: 'B', phaseName: 'Cleaning', blocksCombine: true }, 'actor1', 'tenant-a');
    expect(mocks.phase.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { workflowId: 'w1' } }));
    expect(mocks.phase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-a', workflowId: 'w1', sortOrder: 5, phaseShort: 'B', phaseName: 'Cleaning', blocksCombine: true, isGate: false }),
      }),
    );
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'Phase', entityId: 'p9', action: 'create', actorId: 'actor1' }),
    }));
  });

  it('addPhase starts at sortOrder 0 for the first phase', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.phase.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mocks.phase.create.mockResolvedValue({ id: 'p1' });
    await workflowService.addPhase('w1', {}, 'actor1', 'tenant-a');
    expect(mocks.phase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) }),
    );
  });

  it('addPhase throws P2025 when the workflow is outside the caller tenant', async () => {
    mocks.workflow.findFirst.mockResolvedValue(null);
    await expect(workflowService.addPhase('w1', {}, 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });
    expect(mocks.phase.create).not.toHaveBeenCalled();
  });

  it('addPhase rejects a bomId that belongs to another tenant (P2003)', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.phase.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
    mocks.bom.findFirst.mockResolvedValue(null);
    await expect(workflowService.addPhase('w1', { bomId: 'bom-other' }, 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2003' });
    expect(mocks.bom.findFirst).toHaveBeenCalledWith({ where: { id: 'bom-other', tenantId: 'tenant-a' }, select: { id: true } });
    expect(mocks.phase.create).not.toHaveBeenCalled();
  });

  it('reorderPhases sets each phase sortOrder to its index within the tenant workflow', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.phase.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    mocks.phase.updateMany.mockResolvedValue({ count: 1 });
    await expect(workflowService.reorderPhases('w1', ['p2', 'p1'], 'actor1', 'tenant-a')).resolves.toEqual({ success: true });
    expect(mocks.phase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p2', workflowId: 'w1', tenantId: 'tenant-a' },
      data: { sortOrder: 0, updatedById: 'actor1' },
    });
    expect(mocks.phase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', workflowId: 'w1', tenantId: 'tenant-a' },
      data: { sortOrder: 1, updatedById: 'actor1' },
    });
  });

  it('reorderPhases throws P2025 when the id list is not exactly the current phase set', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.phase.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    // Short list (missing p2) must be rejected rather than silently no-op.
    await expect(workflowService.reorderPhases('w1', ['p1'], 'actor1', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });
    expect(mocks.phase.updateMany).not.toHaveBeenCalled();
  });
});

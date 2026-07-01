import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflow: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  workflowPhase: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    workflow: mocks.workflow,
    workflowPhase: mocks.workflowPhase,
    $transaction: mocks.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ workflow: mocks.workflow, workflowPhase: mocks.workflowPhase }),
    ),
  },
}));

import * as workflowService from '../workflowService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workflowService', () => {
  it('listWorkflows filters by active when requested', async () => {
    mocks.workflow.findMany.mockResolvedValue([]);
    await workflowService.listWorkflows({ activeOnly: true });
    expect(mocks.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true, tenantId: 'ventas' } }),
    );
  });

  it('listWorkflows applies no filter by default', async () => {
    mocks.workflow.findMany.mockResolvedValue([]);
    await workflowService.listWorkflows();
    expect(mocks.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'ventas' } }),
    );
  });

  it('getWorkflow queries by id', async () => {
    const wf = { id: 'w1', phases: [] };
    mocks.workflow.findFirst.mockResolvedValue(wf);
    const result = await workflowService.getWorkflow('w1');
    expect(mocks.workflow.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'w1', tenantId: 'ventas' } }));
    expect(result).toBe(wf);
  });

  it('createWorkflow creates a workflow with phase bindings and audit actor', async () => {
    mocks.workflow.create.mockResolvedValue({ id: 'w1' });
    await workflowService.createWorkflow(
      { name: 'AmGraft', code: 'AMG', phases: [{ phaseId: 'p1', sortOrder: 0 }] },
      'actor1',
    );
    expect(mocks.workflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'AmGraft',
          code: 'AMG',
          createdById: 'actor1',
          updatedById: 'actor1',
          phases: { create: [{ phaseId: 'p1', sortOrder: 0 }] },
        }),
      }),
    );
  });

  it('createWorkflow uses the caller tenant instead of the default tenant', async () => {
    mocks.workflow.create.mockResolvedValue({ id: 'w1' });
    await workflowService.createWorkflow({ name: 'AmGraft', code: 'AMG' }, 'actor1', 'tenant-a');
    expect(mocks.workflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
        }),
      }),
    );
  });

  it('createWorkflow omits the phases relation when none are supplied', async () => {
    mocks.workflow.create.mockResolvedValue({ id: 'w1' });
    await workflowService.createWorkflow({ name: 'AmGraft', code: 'AMG' }, 'actor1');
    const call = mocks.workflow.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.phases).toBeUndefined();
  });

  it('updateWorkflow replaces phase bindings atomically', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.workflowPhase.deleteMany.mockResolvedValue({ count: 2 });
    mocks.workflow.update.mockResolvedValue({ id: 'w1', phases: [] });
    await workflowService.updateWorkflow(
      'w1',
      { phases: [{ phaseId: 'p2', sortOrder: 0 }] },
      'actor1',
    );
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.workflowPhase.deleteMany).toHaveBeenCalledWith({ where: { workflowId: 'w1' } });
    expect(mocks.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w1' },
        data: expect.objectContaining({
          updatedById: 'actor1',
          phases: { create: [{ phaseId: 'p2', sortOrder: 0 }] },
        }),
      }),
    );
  });

  it('updateWorkflow leaves phase bindings untouched when phases not provided', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.workflow.update.mockResolvedValue({ id: 'w1' });
    await workflowService.updateWorkflow('w1', { active: false }, 'actor1');
    expect(mocks.workflowPhase.deleteMany).not.toHaveBeenCalled();
    const call = mocks.workflow.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.phases).toBeUndefined();
    expect(call.data.active).toBe(false);
  });

  it('updateWorkflow scopes the preflight lookup to the caller tenant', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1' });
    mocks.workflow.update.mockResolvedValue({ id: 'w1' });
    await workflowService.updateWorkflow('w1', { active: false }, 'actor1', 'tenant-a');
    expect(mocks.workflow.findFirst).toHaveBeenCalledWith({
      where: { id: 'w1', tenantId: 'tenant-a' },
      select: { id: true },
    });
  });
});

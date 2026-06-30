import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflow: {
    findUnique: vi.fn(),
  },
  workOrder: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    workflow: mocks.workflow,
    workOrder: mocks.workOrder,
  },
}));

import {
  createWorkOrder,
  listWorkOrders,
  getWorkOrder,
  advanceWorkOrder,
} from '../workOrderService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workOrderService', () => {
  it('listWorkOrders returns work orders ordered by newest first', async () => {
    mocks.workOrder.findMany.mockResolvedValue([{ id: 'wo-1' }]);
    const result = await listWorkOrders();
    expect(result[0]).toMatchObject({
      id: 'wo-1',
      operationalStatus: 'Blocked',
      readinessBlockers: ['HET not assigned', 'Phase not started', 'Phase not finished'],
      counts: { serials: 0, equipment: 0, sterilisationRecords: 0 },
    });
    const call = mocks.workOrder.findMany.mock.calls[0][0] as { include: unknown; orderBy: { createdAt: string } };
    expect(call.include).toBeDefined();
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('getWorkOrder queries by id with workflow + phase includes', async () => {
    mocks.workOrder.findUnique.mockResolvedValue({ id: 'wo-1' });
    const result = await getWorkOrder('wo-1');
    expect(result).toMatchObject({
      id: 'wo-1',
      operationalStatus: 'Blocked',
      currentPhaseLabel: 'Phase -',
    });
    const call = mocks.workOrder.findUnique.mock.calls[0][0] as { where: { id: string } };
    expect(call.where).toEqual({ id: 'wo-1' });
  });

  it('createWorkOrder sets the first phase and generates a woNumber starting with WO-', async () => {
    mocks.workflow.findUnique.mockResolvedValue({
      id: 'w1',
      phases: [
        { phaseId: 'p1', sortOrder: 0, phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 } },
        { phaseId: 'p2', sortOrder: 1, phase: { id: 'p2', phaseName: 'Pour', phaseShort: 'PR', phaseOrder: 1 } },
      ],
    });
    const created = {
      id: 'wo-created',
      woNumber: 'WO-CREATED',
      phaseId: 'p1',
      phaseOrder: 0,
    };
    mocks.workOrder.create.mockResolvedValue(created);

    const result = await createWorkOrder({ workflowId: 'w1', hetId: 'h1' }, 'actor1');

    const createCall = mocks.workOrder.create.mock.calls[0][0] as {
      data: { phaseId: string; phaseOrder: number; woNumber: string; workflowId: string; hetId: string; createdById: string; updatedById: string };
    };
    expect(createCall.data.phaseId).toBe('p1');
    expect(createCall.data.phaseOrder).toBe(0);
    expect(createCall.data.workflowId).toBe('w1');
    expect(createCall.data.hetId).toBe('h1');
    expect(createCall.data.createdById).toBe('actor1');
    expect(createCall.data.updatedById).toBe('actor1');
    expect(createCall.data.woNumber.startsWith('WO-')).toBe(true);
    expect(result).toBe(created);
  });

  it('createWorkOrder throws "workflow has no phases configured" when the workflow has none', async () => {
    mocks.workflow.findUnique.mockResolvedValue({ id: 'w1', phases: [] });
    await expect(createWorkOrder({ workflowId: 'w1' }, 'actor1')).rejects.toThrow(
      'workflow has no phases configured',
    );
    expect(mocks.workOrder.create).not.toHaveBeenCalled();
  });

  it('advanceWorkOrder moves the work order to the next phase', async () => {
    mocks.workOrder.findUnique
      // first call: load WO with its workflow's ordered phases
      .mockResolvedValueOnce({
        id: 'wo-1',
        phaseId: 'p1',
        workflow: {
          phases: [
            { phaseId: 'p1', sortOrder: 0 },
            { phaseId: 'p2', sortOrder: 1 },
          ],
        },
      });

    mocks.workOrder.update.mockResolvedValue({ id: 'wo-1' });
    // advanceWorkOrder returns the refreshed detail via findUniqueOrThrow
    mocks.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 'wo-1', phaseId: 'p2', phaseOrder: 1 });

    const result = await advanceWorkOrder('wo-1', 'actor1');

    const updateCall = mocks.workOrder.update.mock.calls[0][0] as {
      where: { id: string };
      data: { phaseId: string; phaseOrder: number; updatedById: string };
    };
    expect(updateCall.where).toEqual({ id: 'wo-1' });
    expect(updateCall.data.phaseId).toBe('p2');
    expect(updateCall.data.phaseOrder).toBe(1);
    expect(updateCall.data.updatedById).toBe('actor1');
    expect(result).toEqual({ id: 'wo-1', phaseId: 'p2', phaseOrder: 1 });
  });

  it('advanceWorkOrder throws "work order is at its final phase" at the last phase', async () => {
    mocks.workOrder.findUnique.mockResolvedValueOnce({
      id: 'wo-1',
      phaseId: 'p2',
      workflow: {
        phases: [
          { phaseId: 'p1', sortOrder: 0 },
          { phaseId: 'p2', sortOrder: 1 },
        ],
      },
    });

    await expect(advanceWorkOrder('wo-1', 'actor1')).rejects.toThrow(
      'work order is at its final phase',
    );
    expect(mocks.workOrder.update).not.toHaveBeenCalled();
  });
});

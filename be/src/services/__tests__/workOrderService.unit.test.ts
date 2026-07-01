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
  sterilise: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    workflow: mocks.workflow,
    workOrder: mocks.workOrder,
    sterilise: mocks.sterilise,
  },
}));

import {
  createWorkOrder,
  listWorkOrders,
  getWorkOrder,
  startWorkOrderPhase,
  finishWorkOrderPhase,
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
      lifecycleState: 'NotStarted',
      readinessBlockers: ['HET not assigned'],
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
      lifecycleState: 'NotStarted',
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
    mocks.workOrder.findUniqueOrThrow.mockResolvedValue({
      ...created,
      hetId: 'h1',
      workflow: {
        phases: [
          { sortOrder: 0, phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 } },
          { sortOrder: 1, phase: { id: 'p2', phaseName: 'Pour', phaseShort: 'PR', phaseOrder: 1 } },
        ],
      },
      phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
    });

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
    expect(result).toMatchObject({
      id: created.id,
      lifecycleState: 'NotStarted',
      operationalStatus: 'NotStarted',
    });
  });

  it('createWorkOrder throws "workflow has no phases configured" when the workflow has none', async () => {
    mocks.workflow.findUnique.mockResolvedValue({ id: 'w1', phases: [] });
    await expect(createWorkOrder({ workflowId: 'w1' }, 'actor1')).rejects.toThrow(
      'workflow has no phases configured',
    );
    expect(mocks.workOrder.create).not.toHaveBeenCalled();
  });

  it('startWorkOrderPhase records start timestamp and signer', async () => {
    mocks.workOrder.findUnique.mockResolvedValueOnce({
      id: 'wo-1',
      hetId: 'h1',
      prodStart: null,
    });
    mocks.workOrder.update.mockResolvedValue({ id: 'wo-1' });
    mocks.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'wo-1',
      hetId: 'h1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: null,
      workflow: { phases: [] },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
    });

    const result = await startWorkOrderPhase('wo-1', 'actor1');

    const updateCall = mocks.workOrder.update.mock.calls[0][0] as {
      where: { id: string };
      data: { prodStart: Date; startSignById: string; updatedById: string };
    };
    expect(updateCall.where).toEqual({ id: 'wo-1' });
    expect(updateCall.data.prodStart).toBeInstanceOf(Date);
    expect(updateCall.data.startSignById).toBe('actor1');
    expect(updateCall.data.updatedById).toBe('actor1');
    expect(result).toMatchObject({ lifecycleState: 'InProgress' });
  });

  it('startWorkOrderPhase blocks work without HET', async () => {
    mocks.workOrder.findUnique.mockResolvedValueOnce({
      id: 'wo-1',
      hetId: null,
      prodStart: null,
    });

    await expect(startWorkOrderPhase('wo-1', 'actor1')).rejects.toThrow(
      'cannot start: HET not assigned',
    );
    expect(mocks.workOrder.update).not.toHaveBeenCalled();
  });

  it('finishWorkOrderPhase records finish timestamp and signer', async () => {
    mocks.workOrder.findUnique.mockResolvedValueOnce({
      id: 'wo-1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: null,
    });
    mocks.workOrder.update.mockResolvedValue({ id: 'wo-1' });
    mocks.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'wo-1',
      hetId: 'h1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: new Date('2026-06-30T09:00:00Z'),
      workflow: { phases: [] },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
    });

    const result = await finishWorkOrderPhase('wo-1', 'actor1');

    const updateCall = mocks.workOrder.update.mock.calls[0][0] as {
      where: { id: string };
      data: { prodEnd: Date; endSignById: string; updatedById: string };
    };
    expect(updateCall.where).toEqual({ id: 'wo-1' });
    expect(updateCall.data.prodEnd).toBeInstanceOf(Date);
    expect(updateCall.data.endSignById).toBe('actor1');
    expect(updateCall.data.updatedById).toBe('actor1');
    expect(result).toMatchObject({ lifecycleState: 'ReadyToAdvance' });
  });

  it('finishWorkOrderPhase blocks phases that have not started', async () => {
    mocks.workOrder.findUnique.mockResolvedValueOnce({
      id: 'wo-1',
      prodStart: null,
      prodEnd: null,
    });

    await expect(finishWorkOrderPhase('wo-1', 'actor1')).rejects.toThrow(
      'cannot finish: phase not started',
    );
    expect(mocks.workOrder.update).not.toHaveBeenCalled();
  });

  it('advanceWorkOrder moves the work order to the next phase', async () => {
    mocks.workOrder.findUnique
      // first call: load WO with its workflow's ordered phases
      .mockResolvedValueOnce({
        id: 'wo-1',
        phaseId: 'p1',
        hetId: 'h1',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        workflow: {
          phases: [
            { phaseId: 'p1', sortOrder: 0, phase: { phaseName: 'Mix' } },
            { phaseId: 'p2', sortOrder: 1, phase: { phaseName: 'Pour' } },
          ],
        },
      });

    mocks.workOrder.update.mockResolvedValue({ id: 'wo-1' });
    mocks.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'wo-1',
      phaseId: 'p2',
      phaseOrder: 1,
      hetId: 'h1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: new Date('2026-06-30T09:00:00Z'),
      workflow: {
        phases: [
          { sortOrder: 0, phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 } },
          { sortOrder: 1, phase: { id: 'p2', phaseName: 'Pour', phaseShort: 'PR', phaseOrder: 1 } },
        ],
      },
      phase: { id: 'p2', phaseName: 'Pour', phaseShort: 'PR', phaseOrder: 1 },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
    });

    const result = await advanceWorkOrder('wo-1', 'actor1');

    const updateCall = mocks.workOrder.update.mock.calls[0][0] as {
      where: { id: string };
      data: { phaseId: string; phaseOrder: number; updatedById: string };
    };
    expect(updateCall.where).toEqual({ id: 'wo-1' });
    expect(updateCall.data.phaseId).toBe('p2');
    expect(updateCall.data.phaseOrder).toBe(1);
    expect(updateCall.data.updatedById).toBe('actor1');
    expect(result).toMatchObject({ id: 'wo-1', phaseId: 'p2', phaseOrder: 1 });
  });

  it('advanceWorkOrder blocks missing HET before changing phase', async () => {
    mocks.workOrder.findUnique.mockResolvedValueOnce({
      id: 'wo-1',
      phaseId: 'p1',
      hetId: null,
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: new Date('2026-06-30T09:00:00Z'),
      workflow: {
        phases: [
          { phaseId: 'p1', sortOrder: 0, phase: { phaseName: 'Mix' } },
          { phaseId: 'p2', sortOrder: 1, phase: { phaseName: 'Pour' } },
        ],
      },
    });

    await expect(advanceWorkOrder('wo-1', 'actor1')).rejects.toThrow(
      'cannot advance: HET not assigned',
    );
    expect(mocks.workOrder.update).not.toHaveBeenCalled();
  });

  it('advanceWorkOrder blocks unfinished phases before changing phase', async () => {
    mocks.workOrder.findUnique.mockResolvedValueOnce({
      id: 'wo-1',
      phaseId: 'p1',
      hetId: 'h1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: null,
      workflow: {
        phases: [
          { phaseId: 'p1', sortOrder: 0, phase: { phaseName: 'Mix' } },
          { phaseId: 'p2', sortOrder: 1, phase: { phaseName: 'Pour' } },
        ],
      },
    });

    await expect(advanceWorkOrder('wo-1', 'actor1')).rejects.toThrow(
      'cannot advance: phase not finished',
    );
    expect(mocks.workOrder.update).not.toHaveBeenCalled();
  });

  it('listWorkOrders does not mark normal in-progress work as blocked', async () => {
    mocks.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-1',
        hetId: 'h1',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: null,
        workflow: { phases: [] },
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
      },
    ]);

    const result = await listWorkOrders();
    expect(result[0]).toMatchObject({
      lifecycleState: 'InProgress',
      operationalStatus: 'InProgress',
      readinessBlockers: [],
    });
  });

  it('final-phase work orders keep blockers instead of being masked as release', async () => {
    mocks.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-1',
        phaseId: 'p2',
        hetId: null,
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: null,
        workflow: {
          phases: [
            { sortOrder: 0, phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 } },
            { sortOrder: 1, phase: { id: 'p2', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 1 } },
          ],
        },
        phase: { id: 'p2', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 1 },
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
      },
    ]);

    const result = await listWorkOrders();
    expect(result[0]).toMatchObject({
      lifecycleState: 'InProgress',
      operationalStatus: 'Blocked',
      readinessBlockers: ['HET not assigned', 'Release phase not finished'],
    });
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

  it('derives legacy AppSheet buckets from HET phase progress', async () => {
    mocks.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-progress',
        hetId: 'h1',
        phaseOrder: 1,
        phaseShort: 'P1',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: null,
        workflow: { phases: [] },
        phase: { phaseShort: 'P1' },
        steralisationCurrent: null,
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
      },
      {
        id: 'wo-next',
        hetId: 'h2',
        phaseOrder: 2,
        phaseShort: 'P2',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        workflow: { phases: [] },
        phase: { phaseShort: 'P2', bom: { lines: [] } },
        nextPhase: { phaseShort: 'P3' },
        steralisationCurrent: null,
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
      },
      {
        id: 'wo-quarantine',
        hetId: 'h3',
        phaseOrder: 3,
        phaseShort: 'P3',
        prodStart: null,
        prodEnd: null,
        workflow: { phases: [] },
        phase: { phaseShort: 'P3' },
        steralisationCurrent: { id: 's1', result: false, createdAt: new Date('2026-06-30T09:00:00Z') },
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
      },
      {
        id: 'wo-finished',
        hetId: 'h4',
        phaseOrder: 16,
        phaseShort: 'P16',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        workflow: { phases: [] },
        phase: { phaseShort: 'P16' },
        steralisationCurrent: null,
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
      },
      {
        id: 'wo-completed',
        hetId: 'h5',
        phaseOrder: 4,
        phaseShort: 'P4',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        workflow: { phases: [] },
        phase: { phaseShort: 'P4' },
        steralisationCurrent: null,
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
      },
      {
        id: 'wo-leading',
        hetId: 'h5',
        phaseOrder: 5,
        phaseShort: 'P5',
        prodStart: null,
        prodEnd: null,
        workflow: { phases: [] },
        phase: { phaseShort: 'P5' },
        steralisationCurrent: null,
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
      },
    ]);

    const result = await listWorkOrders();

    expect(result.map((workOrder) => [workOrder.id, workOrder.legacyStateBucket])).toEqual([
      ['wo-progress', '1. In Progress'],
      ['wo-next', '2. Next Phase'],
      ['wo-quarantine', '3. In Quarantine'],
      ['wo-finished', '4. Finished Goods'],
      ['wo-completed', '5. WO Completed'],
      ['wo-leading', '1. In Progress'],
    ]);
    expect(result.find((workOrder) => workOrder.id === 'wo-completed')).toMatchObject({
      phaseOrderCurrent: 5,
      legacyProductionState: '5. WO Completed',
    });
  });

  it('does not mark next-phase rows advanceable when AppSheet image parity is unavailable', async () => {
    mocks.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-next',
        hetId: 'h1',
        phaseOrder: 6,
        phaseShort: 'P6',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        workflow: { phases: [] },
        phase: { phaseShort: 'P6', bom: { lines: [{ id: 'bom-1' }] } },
        nextPhase: { phaseShort: 'P7' },
        steralisationCurrent: null,
        sterilises: [],
        woSerials: [{ id: 'serial-1' }],
        phaseEquips: [],
        batchHets: [],
      },
    ]);

    const [result] = await listWorkOrders();

    expect(result).toMatchObject({
      legacyStateBucket: '2. Next Phase',
      serialCheckDone: true,
      canAdvanceLegacy: false,
      missingAdvanceRequirements: ['Work-order image captured'],
      parityGaps: ['workOrder.image is not present in the imported schema; AppSheet image gating cannot be satisfied yet'],
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflow: {
    findFirst: vi.fn(),
  },
  workOrder: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  workOrderAuditEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  workOrderPhaseEquip: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  woSerial: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  sterilise: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    workflow: mocks.workflow,
    workOrder: mocks.workOrder,
    workOrderAuditEvent: mocks.workOrderAuditEvent,
    workOrderPhaseEquip: mocks.workOrderPhaseEquip,
    woSerial: mocks.woSerial,
    sterilise: mocks.sterilise,
    $transaction: vi.fn((callback) => callback({
      workOrder: mocks.workOrder,
      workOrderPhaseEquip: mocks.workOrderPhaseEquip,
      woSerial: mocks.woSerial,
    })),
  },
}));

import {
  createWorkOrder,
  listQaWorkOrderQueue,
  listWorkOrders,
  listWorkOrderAuditEvents,
  getWorkOrder,
  recordWorkOrderEquipment,
  recordWorkOrderOutputQuantity,
  recordWorkOrderPhotoEvidence,
  recordWorkOrderRelease,
  recordWorkOrderSerial,
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
      readinessBlockers: ['HET not assigned', 'Work-order image captured', 'Output quantity recorded'],
      counts: { serials: 0, equipment: 0, sterilisationRecords: 0 },
    });
    const call = mocks.workOrder.findMany.mock.calls[0][0] as { include: unknown; orderBy: { createdAt: string } };
    expect(call.include).toBeDefined();
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('getWorkOrder queries by id with workflow + phase includes', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1' });
    const result = await getWorkOrder('wo-1');
    expect(result).toMatchObject({
      id: 'wo-1',
      operationalStatus: 'Blocked',
      lifecycleState: 'NotStarted',
      currentPhaseLabel: 'Phase -',
    });
    const call = mocks.workOrder.findFirst.mock.calls[0][0] as { where: { id: string; tenantId: string } };
    expect(call.where).toEqual({ id: 'wo-1', tenantId: 'ventas' });
  });

  it('listWorkOrders scopes reads to the caller tenant', async () => {
    mocks.workOrder.findMany.mockResolvedValue([]);
    await listWorkOrders('tenant-a');
    expect(mocks.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted: false, tenantId: 'tenant-a' } }),
    );
  });

  it('listQaWorkOrderQueue groups sterilisation, quarantine, and release work', async () => {
    const startedAt = new Date('2026-07-01T09:00:00Z');
    const finishedAt = new Date('2026-07-01T11:00:00Z');
    mocks.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-ster',
        tenantId: 'tenant-a',
        hetId: 'het-1',
        phaseId: 'phase-ster',
        phaseOrder: 20,
        prodStart: null,
        prodEnd: null,
        workflow: {
          phases: [
            { sortOrder: 10, phase: { id: 'phase-prep', phaseName: 'Preparation', phaseShort: 'PREP', phaseOrder: 10 } },
            { sortOrder: 20, phase: { id: 'phase-ster', phaseName: 'Sterilisation', phaseShort: 'STER', phaseOrder: 20 } },
            { sortOrder: 30, phase: { id: 'phase-release', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 30 } },
          ],
        },
        phase: { id: 'phase-ster', phaseName: 'Sterilisation', phaseShort: 'STER', phaseOrder: 20, bom: { lines: [] }, phaseEquips: [] },
        sterilises: [],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
      },
      {
        id: 'wo-quarantine',
        tenantId: 'tenant-a',
        hetId: 'het-2',
        phaseId: 'phase-review',
        phaseOrder: 20,
        prodStart: null,
        prodEnd: null,
        steralisationCurrent: { id: 'ster-fail', result: false, createdAt: startedAt },
        workflow: {
          phases: [
            { sortOrder: 20, phase: { id: 'phase-review', phaseName: 'Inspection', phaseShort: 'INSP', phaseOrder: 20 } },
          ],
        },
        phase: { id: 'phase-review', phaseName: 'Inspection', phaseShort: 'INSP', phaseOrder: 20, bom: { lines: [] }, phaseEquips: [] },
        sterilises: [{ id: 'ster-fail', result: false }],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
      },
      {
        id: 'wo-release',
        tenantId: 'tenant-a',
        hetId: 'het-3',
        phaseId: 'phase-release',
        phaseOrder: 30,
        prodStart: startedAt,
        prodEnd: finishedAt,
        outputQuantity: { toString: () => '1.0000' },
        workflow: {
          phases: [
            { sortOrder: 30, phase: { id: 'phase-release', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 30 } },
          ],
        },
        phase: { id: 'phase-release', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 30, bom: { lines: [] }, phaseEquips: [] },
        sterilises: [{ id: 'ster-pass', result: true }],
        woSerials: [],
        phaseEquips: [],
        batchHets: [],
        imagePath: 'data:image/png;base64,AAAA',
      },
    ]);

    const result = await listQaWorkOrderQueue('tenant-a');

    expect(mocks.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted: false, tenantId: 'tenant-a' } }),
    );
    expect(result.counts).toEqual({ sterilisation: 1, quarantine: 1, release: 1 });
    expect(result.sterilisation.map((workOrder) => workOrder.id)).toEqual(['wo-ster']);
    expect(result.quarantine.map((workOrder) => workOrder.id)).toEqual(['wo-quarantine']);
    expect(result.release.map((workOrder) => workOrder.id)).toEqual(['wo-release']);
  });

  it('getWorkOrder scopes detail and peer-context reads to the caller tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({
      id: 'wo-1',
      hetId: 'h1',
      batchHets: [],
      workflow: { phases: [] },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
    });
    mocks.workOrder.findMany.mockResolvedValue([]);

    await getWorkOrder('wo-1', 'tenant-a');

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-1', tenantId: 'tenant-a' } }),
    );
    expect(mocks.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deleted: false,
          tenantId: 'tenant-a',
        }),
      }),
    );
  });

  it('listWorkOrderAuditEvents verifies tenant ownership before reading audit rows', async () => {
    const createdAt = new Date('2026-07-01T09:00:00Z');
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1' });
    mocks.workOrderAuditEvent.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        tenantId: 'tenant-a',
        workOrderId: 'wo-1',
        action: 'work_order.phase_started',
        actorId: 'actor1',
        source: 'workOrderService.startWorkOrderPhase',
        previousState: null,
        newState: { id: 'wo-1' },
        createdAt,
      },
    ]);

    const result = await listWorkOrderAuditEvents('wo-1', 'tenant-a');

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'wo-1', tenantId: 'tenant-a', deleted: false },
      select: { id: true },
    });
    expect(mocks.workOrderAuditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 'wo-1', tenantId: 'tenant-a' },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: 'audit-1', action: 'work_order.phase_started' }),
    ]);
  });

  it('listWorkOrderAuditEvents returns null without reading audit rows when work order is outside the tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValue(null);

    await expect(listWorkOrderAuditEvents('wo-1', 'tenant-a')).resolves.toBeNull();

    expect(mocks.workOrderAuditEvent.findMany).not.toHaveBeenCalled();
  });

  it('recordWorkOrderSerial upserts a serial for a current-phase required BOM line', async () => {
    const workOrder = {
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-1',
      phaseOrder: 10,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      releaseStatus: null,
      phase: { bom: { lines: [{ id: 'bom-line-1', hasSerial: true }] } },
      woSerials: [],
    };
    mocks.workOrder.findFirst.mockResolvedValue(workOrder);
    mocks.woSerial.upsert.mockResolvedValue({
      id: 'wo-1:bom-line-1',
      serialNumber: 'SER-001',
    });
    mocks.workOrder.findFirstOrThrow.mockResolvedValue({
      ...workOrder,
      workflow: { phases: [] },
      phase: { phaseShort: 'P1', bom: { lines: [{ id: 'bom-line-1', hasSerial: true }] } },
      sterilises: [],
      woSerials: [{ id: 'wo-1:bom-line-1' }],
      phaseEquips: [],
      batchHets: [],
    });

    const result = await recordWorkOrderSerial(
      'wo-1',
      { bomRefId: 'bom-line-1', serialNumber: 'SER-001' },
      'actor1',
      'tenant-a',
    );

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-1', tenantId: 'tenant-a' } }),
    );
    expect(mocks.woSerial.upsert).toHaveBeenCalledWith({
      where: { id: 'wo-1:bom-line-1' },
      create: expect.objectContaining({
        id: 'wo-1:bom-line-1',
        tenantId: 'tenant-a',
        workOrderId: 'wo-1',
        bomRefId: 'bom-line-1',
        serialNumber: 'SER-001',
        createdById: 'actor1',
        updatedById: 'actor1',
      }),
      update: { serialNumber: 'SER-001', updatedById: 'actor1' },
    });
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          workOrderId: 'wo-1',
          action: 'work_order.serial_recorded',
          source: 'workOrderService.recordWorkOrderSerial',
          previousState: expect.objectContaining({ serialCount: 0 }),
          newState: expect.objectContaining({ serialCount: 1 }),
        }),
      }),
    );
    expect(result).toMatchObject({ id: 'wo-1', counts: { serials: 1 } });
  });

  it('recordWorkOrderOutputQuantity stores positive output evidence and writes an audit event', async () => {
    const workOrder = {
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-1',
      phaseOrder: 10,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      releaseStatus: null,
    };
    const updated = {
      ...workOrder,
      outputQuantity: { toString: () => '2.5000' },
    };
    mocks.workOrder.findFirst.mockResolvedValue(workOrder);
    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
    mocks.workOrder.findFirstOrThrow.mockResolvedValue({
      ...updated,
      workflow: { phases: [] },
      phase: { phaseShort: 'P1', bom: { lines: [] } },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
    });

    const result = await recordWorkOrderOutputQuantity(
      'wo-1',
      { outputQuantity: '2.5000' },
      'actor1',
      'tenant-a',
    );

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-1', tenantId: 'tenant-a' } }),
    );
    expect(mocks.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', tenantId: 'tenant-a' },
      data: {
        outputQuantity: expect.objectContaining({ toString: expect.any(Function) }),
        updatedById: 'actor1',
      },
    });
    expect(mocks.workOrder.updateMany.mock.calls[0][0].data.outputQuantity.toString()).toBe('2.5');
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          workOrderId: 'wo-1',
          action: 'work_order.output_quantity_recorded',
          source: 'workOrderService.recordWorkOrderOutputQuantity',
          previousState: expect.objectContaining({ outputQuantity: null }),
          newState: expect.objectContaining({ outputQuantity: '2.5000' }),
        }),
      }),
    );
    expect(result).toMatchObject({ id: 'wo-1', outputQuantity: updated.outputQuantity });
  });

  it('recordWorkOrderOutputQuantity rejects zero or negative quantities', async () => {
    await expect(
      recordWorkOrderOutputQuantity('wo-1', { outputQuantity: '0' }, 'actor1', 'tenant-a'),
    ).rejects.toThrow('cannot record output quantity: quantity must be greater than zero');

    expect(mocks.workOrder.findFirst).not.toHaveBeenCalled();
    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
    expect(mocks.workOrderAuditEvent.create).not.toHaveBeenCalled();
  });

  it('recordWorkOrderPhotoEvidence stores image evidence and writes an audit event', async () => {
    const workOrder = {
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-1',
      phaseOrder: 10,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: null,
      prodDuration: null,
      outputQuantity: { toString: () => '1.0000', gt: () => true },
      imagePath: null,
      releaseStatus: null,
    };
    const updated = {
      ...workOrder,
      imagePath: 'data:image/png;base64,AAAA',
    };
    mocks.workOrder.findFirst.mockResolvedValue(workOrder);
    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
    mocks.workOrder.findFirstOrThrow.mockResolvedValue({
      ...updated,
      workflow: { phases: [] },
      phase: { phaseShort: 'P1', bom: { lines: [] } },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
    });

    const result = await recordWorkOrderPhotoEvidence(
      'wo-1',
      { imageDataUrl: 'data:image/png;base64,AAAA' },
      'actor1',
      'tenant-a',
    );

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-1', tenantId: 'tenant-a' } }),
    );
    expect(mocks.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', tenantId: 'tenant-a' },
      data: {
        imagePath: 'data:image/png;base64,AAAA',
        updatedById: 'actor1',
      },
    });
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          workOrderId: 'wo-1',
          action: 'work_order.photo_evidence_recorded',
          source: 'workOrderService.recordWorkOrderPhotoEvidence',
          previousState: expect.objectContaining({ imageCaptured: false }),
          newState: expect.objectContaining({ imageCaptured: true }),
        }),
      }),
    );
    expect(result).toMatchObject({ id: 'wo-1', imagePath: updated.imagePath });
  });

  it('recordWorkOrderPhotoEvidence rejects non-image data URLs before writing', async () => {
    await expect(
      recordWorkOrderPhotoEvidence('wo-1', { imageDataUrl: 'data:text/plain;base64,AAAA' }, 'actor1', 'tenant-a'),
    ).rejects.toThrow('cannot record photo evidence: image data must be a png, jpeg, or webp base64 data URL');

    expect(mocks.workOrder.findFirst).not.toHaveBeenCalled();
    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
    expect(mocks.workOrderAuditEvent.create).not.toHaveBeenCalled();
  });

  it('recordWorkOrderRelease records final release disposition and writes an audit event', async () => {
    const startedAt = new Date('2026-07-01T09:00:00Z');
    const finishedAt = new Date('2026-07-01T11:00:00Z');
    const workOrder = {
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-release',
      phaseOrder: 30,
      hetId: 'het-1',
      prodStart: startedAt,
      prodEnd: finishedAt,
      prodDuration: null,
      outputQuantity: { toString: () => '1.0000', gt: () => true },
      releaseStatus: null,
      releaseDecisionAt: null,
      workflow: {
        phases: [
          { sortOrder: 30, phase: { id: 'phase-release', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 30 } },
        ],
      },
      phase: { id: 'phase-release', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 30, bom: { lines: [] }, phaseEquips: [] },
      sterilises: [{ id: 'ster-pass', result: true }],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
      imagePath: 'data:image/png;base64,AAAA',
    };
    const updated = {
      ...workOrder,
      releaseStatus: 'released',
      releaseDecisionAt: new Date('2026-07-01T12:00:00Z'),
      releaseDecisionById: 'actor1',
      releaseRemarks: 'Approved for finished goods.',
    };
    mocks.workOrder.findFirst.mockResolvedValue(workOrder);
    mocks.workOrder.findMany.mockResolvedValue([]);
    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
    mocks.workOrder.findFirstOrThrow.mockResolvedValue(updated);

    const result = await recordWorkOrderRelease(
      'wo-1',
      { releaseStatus: 'released', remarks: 'Approved for finished goods.' },
      'actor1',
      'tenant-a',
    );

    expect(mocks.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', tenantId: 'tenant-a' },
      data: expect.objectContaining({
        releaseStatus: 'released',
        releaseDecisionById: 'actor1',
        releaseRemarks: 'Approved for finished goods.',
        updatedById: 'actor1',
      }),
    });
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          workOrderId: 'wo-1',
          action: 'work_order.release_recorded',
          source: 'workOrderService.recordWorkOrderRelease',
          previousState: expect.objectContaining({ releaseStatus: null }),
          newState: expect.objectContaining({ releaseStatus: 'released' }),
        }),
      }),
    );
    expect(result).toMatchObject({ id: 'wo-1', releaseStatus: 'released', lifecycleState: 'Released' });
  });

  it('recordWorkOrderRelease rejects work orders that are not release-ready', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-work',
      phaseOrder: 10,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      releaseStatus: null,
      releaseDecisionAt: null,
      workflow: {
        phases: [
          { sortOrder: 10, phase: { id: 'phase-work', phaseName: 'Production', phaseShort: 'PROD', phaseOrder: 10 } },
          { sortOrder: 20, phase: { id: 'phase-release', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 20 } },
        ],
      },
      phase: { id: 'phase-work', phaseName: 'Production', phaseShort: 'PROD', phaseOrder: 10, bom: { lines: [] }, phaseEquips: [] },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
    });
    mocks.workOrder.findMany.mockResolvedValue([]);

    await expect(
      recordWorkOrderRelease('wo-1', { releaseStatus: 'released' }, 'actor1', 'tenant-a'),
    ).rejects.toThrow('cannot release: work order is not ready for final release');

    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
    expect(mocks.workOrderAuditEvent.create).not.toHaveBeenCalled();
  });

  it('recordWorkOrderRelease rejects work orders that already have a disposition', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-release',
      phaseOrder: 30,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: new Date('2026-07-01T11:00:00Z'),
      prodDuration: null,
      outputQuantity: null,
      releaseStatus: 'quarantined',
      releaseDecisionAt: new Date('2026-07-01T12:00:00Z'),
      workflow: {
        phases: [
          { sortOrder: 30, phase: { id: 'phase-release', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 30 } },
        ],
      },
      phase: { id: 'phase-release', phaseName: 'Release', phaseShort: 'REL', phaseOrder: 30, bom: { lines: [] }, phaseEquips: [] },
      sterilises: [{ id: 'ster-pass', result: true }],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
      imagePath: 'data:image/png;base64,AAAA',
    });
    mocks.workOrder.findMany.mockResolvedValue([]);

    await expect(
      recordWorkOrderRelease('wo-1', { releaseStatus: 'released' }, 'actor1', 'tenant-a'),
    ).rejects.toThrow('cannot release: work order already has a release disposition');

    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
    expect(mocks.workOrderAuditEvent.create).not.toHaveBeenCalled();
  });

  it('recordWorkOrderEquipment records allowed current-phase equipment and writes an audit event', async () => {
    const workOrder = {
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-1',
      phaseOrder: 10,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      releaseStatus: null,
      phase: { phaseEquips: [{ phaseEquipId: 'equip-1' }] },
      phaseEquips: [],
    };
    mocks.workOrder.findFirst.mockResolvedValue(workOrder);
    mocks.workOrderPhaseEquip.create.mockResolvedValue({ workOrderId: 'wo-1', phaseEquipId: 'equip-1' });
    mocks.workOrder.findFirstOrThrow.mockResolvedValue({
      ...workOrder,
      workflow: { phases: [] },
      phase: {
        phaseShort: 'P1',
        bom: { lines: [] },
        phaseEquips: [{ phaseEquip: { id: 'equip-1', equipId: 'EQ-1', name: 'Sealer', description: 'Heat sealer' } }],
      },
      sterilises: [],
      woSerials: [],
      phaseEquips: [{ phaseEquip: { id: 'equip-1', equipId: 'EQ-1', name: 'Sealer' } }],
      batchHets: [],
    });

    const result = await recordWorkOrderEquipment('wo-1', { phaseEquipId: 'equip-1' }, 'actor1', 'tenant-a');

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-1', tenantId: 'tenant-a' } }),
    );
    expect(mocks.workOrderPhaseEquip.create).toHaveBeenCalledWith({
      data: { workOrderId: 'wo-1', phaseEquipId: 'equip-1' },
    });
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          workOrderId: 'wo-1',
          action: 'work_order.equipment_recorded',
          source: 'workOrderService.recordWorkOrderEquipment',
          previousState: expect.objectContaining({ equipmentCount: 0 }),
          newState: expect.objectContaining({ equipmentCount: 1 }),
        }),
      }),
    );
    expect(result).toMatchObject({
      id: 'wo-1',
      counts: { equipment: 1 },
      allowedEquipment: [expect.objectContaining({ phaseEquipId: 'equip-1', recorded: true })],
    });
  });

  it('recordWorkOrderEquipment rejects equipment not allowed by the current phase', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-1',
      phaseOrder: 10,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      releaseStatus: null,
      phase: { phaseEquips: [{ phaseEquipId: 'equip-other' }] },
      phaseEquips: [],
    });

    await expect(
      recordWorkOrderEquipment('wo-1', { phaseEquipId: 'equip-1' }, 'actor1', 'tenant-a'),
    ).rejects.toThrow('cannot record equipment: equipment is not allowed for the current phase');

    expect(mocks.workOrderPhaseEquip.create).not.toHaveBeenCalled();
    expect(mocks.workOrderAuditEvent.create).not.toHaveBeenCalled();
  });

  it('recordWorkOrderEquipment is idempotent for already recorded equipment', async () => {
    const workOrder = {
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-1',
      phaseOrder: 10,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      releaseStatus: null,
      phase: { phaseEquips: [{ phaseEquipId: 'equip-1' }] },
      phaseEquips: [{ phaseEquipId: 'equip-1' }],
    };
    mocks.workOrder.findFirst.mockResolvedValue(workOrder);
    mocks.workOrder.findFirstOrThrow.mockResolvedValue({
      ...workOrder,
      workflow: { phases: [] },
      phase: {
        phaseShort: 'P1',
        bom: { lines: [] },
        phaseEquips: [{ phaseEquip: { id: 'equip-1', equipId: 'EQ-1', name: 'Sealer', description: null } }],
      },
      sterilises: [],
      woSerials: [],
      phaseEquips: [{ phaseEquip: { id: 'equip-1', equipId: 'EQ-1', name: 'Sealer' } }],
      batchHets: [],
    });

    const result = await recordWorkOrderEquipment('wo-1', { phaseEquipId: 'equip-1' }, 'actor1', 'tenant-a');

    expect(mocks.workOrderPhaseEquip.create).not.toHaveBeenCalled();
    expect(mocks.workOrderAuditEvent.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'wo-1',
      counts: { equipment: 1 },
      allowedEquipment: [expect.objectContaining({ phaseEquipId: 'equip-1', recorded: true })],
    });
  });

  it('recordWorkOrderSerial rejects BOM lines not required by the current phase', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      phaseId: 'phase-1',
      phaseOrder: 10,
      hetId: 'het-1',
      prodStart: new Date('2026-07-01T09:00:00Z'),
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      releaseStatus: null,
      phase: { bom: { lines: [{ id: 'other-line', hasSerial: true }] } },
      woSerials: [],
    });

    await expect(
      recordWorkOrderSerial('wo-1', { bomRefId: 'bom-line-1', serialNumber: 'SER-001' }, 'actor1', 'tenant-a'),
    ).rejects.toThrow('cannot record serial: BOM line is not serial-required for the current phase');

    expect(mocks.woSerial.upsert).not.toHaveBeenCalled();
    expect(mocks.workOrderAuditEvent.create).not.toHaveBeenCalled();
  });

  it('createWorkOrder sets the first phase and generates a woNumber starting with WO-', async () => {
    mocks.workflow.findFirst.mockResolvedValue({
      id: 'w1',
      phases: [
        { phaseId: 'p1', sortOrder: 0, phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 } },
        { phaseId: 'p2', sortOrder: 1, phase: { id: 'p2', phaseName: 'Pour', phaseShort: 'PR', phaseOrder: 1 } },
      ],
    });
    const created = {
      id: 'wo-created',
      tenantId: 'ventas',
      woNumber: 'WO-CREATED',
      workflowId: 'w1',
      hetId: 'h1',
      phaseId: 'p1',
      phaseOrder: 0,
      prodStart: null,
      prodEnd: null,
    };
    mocks.workOrder.create.mockResolvedValue(created);
    mocks.workOrder.findFirstOrThrow.mockResolvedValue({
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
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'ventas',
          workOrderId: 'wo-created',
          action: 'work_order.created',
          actorId: 'actor1',
          source: 'workOrderService.createWorkOrder',
          newState: expect.objectContaining({ phaseId: 'p1', phaseOrder: 0 }),
        }),
      }),
    );
  });

  it('createWorkOrder scopes workflow lookup, creation, and decorated reload to the caller tenant', async () => {
    mocks.workflow.findFirst.mockResolvedValue({
      id: 'w1',
      phases: [{ phaseId: 'p1', sortOrder: 0, phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 } }],
    });
    mocks.workOrder.create.mockResolvedValue({
      id: 'wo-created',
      tenantId: 'tenant-a',
      workflowId: 'w1',
      phaseId: 'p1',
      phaseOrder: 0,
      hetId: null,
      prodStart: null,
      prodEnd: null,
    });
    mocks.workOrder.findFirstOrThrow.mockResolvedValue({
      id: 'wo-created',
      hetId: null,
      workflow: { phases: [] },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
    });

    await createWorkOrder({ workflowId: 'w1' }, 'actor1', 'tenant-a');

    expect(mocks.workflow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1', tenantId: 'tenant-a' } }),
    );
    expect(mocks.workOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-a' }),
      }),
    );
    expect(mocks.workOrder.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-created', tenantId: 'tenant-a' } }),
    );
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-a', workOrderId: 'wo-created' }),
      }),
    );
  });

  it('createWorkOrder throws "workflow has no phases configured" when the workflow has none', async () => {
    mocks.workflow.findFirst.mockResolvedValue({ id: 'w1', phases: [] });
    await expect(createWorkOrder({ workflowId: 'w1' }, 'actor1')).rejects.toThrow(
      'workflow has no phases configured',
    );
    expect(mocks.workOrder.create).not.toHaveBeenCalled();
  });

  it('startWorkOrderPhase records start timestamp and signer', async () => {
    mocks.workOrder.findFirst.mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'ventas',
      workflowId: 'w1',
      phaseId: 'p1',
      phaseOrder: 0,
      hetId: 'h1',
      prodStart: null,
      prodEnd: null,
    });
    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
    mocks.workOrder.findFirstOrThrow.mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'ventas',
      workflowId: 'w1',
      phaseId: 'p1',
      phaseOrder: 0,
      hetId: 'h1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: null,
    }).mockResolvedValue({
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

    const updateCall = mocks.workOrder.updateMany.mock.calls[0][0] as {
      where: { id: string; tenantId: string };
      data: { prodStart: Date; startSignById: string; updatedById: string };
    };
    expect(updateCall.where).toEqual({ id: 'wo-1', tenantId: 'ventas' });
    expect(updateCall.data.prodStart).toBeInstanceOf(Date);
    expect(updateCall.data.startSignById).toBe('actor1');
    expect(updateCall.data.updatedById).toBe('actor1');
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'work_order.phase_started',
          actorId: 'actor1',
          previousState: expect.objectContaining({ prodStart: null }),
          newState: expect.objectContaining({ prodStart: '2026-06-30T08:00:00.000Z' }),
        }),
      }),
    );
    expect(result).toMatchObject({ lifecycleState: 'InProgress' });
  });

  it('startWorkOrderPhase scopes the preflight lookup and decorated reload to the caller tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'w1',
      phaseId: 'p1',
      phaseOrder: 0,
      hetId: 'h1',
      prodStart: null,
      prodEnd: null,
    });
    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
    mocks.workOrder.findFirstOrThrow.mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'tenant-a',
      workflowId: 'w1',
      phaseId: 'p1',
      phaseOrder: 0,
      hetId: 'h1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: null,
    }).mockResolvedValue({
      id: 'wo-1',
      hetId: 'h1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      workflow: { phases: [] },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
    });
    mocks.workOrder.findMany.mockResolvedValue([]);

    await startWorkOrderPhase('wo-1', 'actor1', undefined, 'tenant-a');

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'wo-1', tenantId: 'tenant-a' },
      select: {
        id: true,
        tenantId: true,
        workflowId: true,
        phaseId: true,
        phaseOrder: true,
        hetId: true,
        prodStart: true,
        prodEnd: true,
        prodDuration: true,
        outputQuantity: true,
        releaseStatus: true,
      },
    });
    expect(mocks.workOrder.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-1', tenantId: 'tenant-a' } }),
    );
    expect(mocks.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a' }) }),
    );
  });

  it('startWorkOrderPhase blocks work without HET', async () => {
    mocks.workOrder.findFirst.mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'ventas',
      workflowId: 'w1',
      phaseId: 'p1',
      phaseOrder: 0,
      hetId: null,
      prodStart: null,
      prodEnd: null,
    });

    await expect(startWorkOrderPhase('wo-1', 'actor1')).rejects.toThrow(
      'cannot start: HET not assigned',
    );
    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
  });

  it('finishWorkOrderPhase records finish timestamp and signer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T09:00:00Z'));
    try {
      mocks.workOrder.findFirst.mockResolvedValueOnce({
        id: 'wo-1',
        tenantId: 'ventas',
        workflowId: 'w1',
        phaseId: 'p1',
        phaseOrder: 0,
        hetId: 'h1',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: null,
        prodDuration: null,
      });
      mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
      mocks.workOrder.findFirstOrThrow.mockResolvedValueOnce({
        id: 'wo-1',
        tenantId: 'ventas',
        workflowId: 'w1',
        phaseId: 'p1',
        phaseOrder: 0,
        hetId: 'h1',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        prodDuration: { toString: () => '60.0000' },
      }).mockResolvedValue({
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

      const updateCall = mocks.workOrder.updateMany.mock.calls[0][0] as {
        where: { id: string; tenantId: string };
        data: { prodEnd: Date; prodDuration: { toString: () => string }; endSignById: string; updatedById: string };
      };
      expect(updateCall.where).toEqual({ id: 'wo-1', tenantId: 'ventas' });
      expect(updateCall.data.prodEnd).toBeInstanceOf(Date);
      expect(updateCall.data.prodEnd.toISOString()).toBe('2026-06-30T09:00:00.000Z');
      expect(updateCall.data.prodDuration.toString()).toBe('60');
      expect(updateCall.data.endSignById).toBe('actor1');
      expect(updateCall.data.updatedById).toBe('actor1');
      expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'work_order.phase_finished',
            previousState: expect.objectContaining({ prodEnd: null, prodDurationMinutes: null }),
            newState: expect.objectContaining({ prodEnd: '2026-06-30T09:00:00.000Z', prodDurationMinutes: '60.0000' }),
          }),
        }),
      );
      expect(result).toMatchObject({ lifecycleState: 'ReadyToAdvance' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('finishWorkOrderPhase blocks phases that have not started', async () => {
    mocks.workOrder.findFirst.mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'ventas',
      workflowId: 'w1',
      phaseId: 'p1',
      phaseOrder: 0,
      hetId: 'h1',
      prodStart: null,
      prodEnd: null,
    });

    await expect(finishWorkOrderPhase('wo-1', 'actor1')).rejects.toThrow(
      'cannot finish: phase not started',
    );
    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
  });

  it('advanceWorkOrder moves the work order to the next phase', async () => {
    mocks.workOrder.findFirst
      // first call: load WO with its workflow's ordered phases
      .mockResolvedValueOnce({
        id: 'wo-1',
        tenantId: 'ventas',
        workflowId: 'w1',
        phaseId: 'p1',
        phaseOrder: 0,
        hetId: 'h1',
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        outputQuantity: { toString: () => '1.0000', gt: () => true },
        imagePath: 'data:image/png;base64,AAAA',
        releaseStatus: null,
        workflow: {
          phases: [
            { phaseId: 'p1', sortOrder: 0, phase: { phaseName: 'Mix' } },
            { phaseId: 'p2', sortOrder: 1, phase: { phaseName: 'Pour' } },
          ],
        },
      });

    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
    mocks.workOrder.findMany.mockResolvedValue([]);
    mocks.workOrder.findFirstOrThrow.mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'ventas',
      workflowId: 'w1',
      phaseId: 'p1',
      phaseOrder: 0,
      hetId: 'h1',
      prodStart: new Date('2026-06-30T08:00:00Z'),
      prodEnd: new Date('2026-06-30T09:00:00Z'),
      prodDuration: null,
      outputQuantity: { toString: () => '1.0000', gt: () => true },
      imagePath: 'data:image/png;base64,AAAA',
      releaseStatus: null,
      workflow: {
        phases: [
          { sortOrder: 0, phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 } },
          { sortOrder: 1, phase: { id: 'p2', phaseName: 'Pour', phaseShort: 'PR', phaseOrder: 1 } },
        ],
      },
      phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0, bom: { lines: [] }, phaseEquips: [] },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
    }).mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'ventas',
      workflowId: 'w1',
      phaseId: 'p2',
      phaseOrder: 1,
      hetId: 'h1',
      prodStart: null,
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      imagePath: null,
      releaseStatus: null,
    }).mockResolvedValueOnce({
      id: 'wo-1',
      tenantId: 'ventas',
      workflowId: 'w1',
      phaseId: 'p2',
      phaseOrder: 1,
      hetId: 'h1',
      prodStart: null,
      prodEnd: null,
      prodDuration: null,
      outputQuantity: null,
      imagePath: null,
      releaseStatus: null,
      workflow: {
        phases: [
          { sortOrder: 0, phase: { id: 'p1', phaseName: 'Mix', phaseShort: 'MX', phaseOrder: 0 } },
          { sortOrder: 1, phase: { id: 'p2', phaseName: 'Pour', phaseShort: 'PR', phaseOrder: 1 } },
        ],
      },
      phase: { id: 'p2', phaseName: 'Pour', phaseShort: 'PR', phaseOrder: 1, bom: { lines: [] }, phaseEquips: [] },
      sterilises: [],
      woSerials: [],
      phaseEquips: [],
      batchHets: [],
    });

    const result = await advanceWorkOrder('wo-1', 'actor1');

    const updateCall = mocks.workOrder.updateMany.mock.calls[0][0] as {
      where: { id: string; tenantId: string };
      data: { phaseId: string; phaseOrder: number; updatedById: string; prodStart: null; prodEnd: null; outputQuantity: null; imagePath: null };
    };
    expect(updateCall.where).toEqual({ id: 'wo-1', tenantId: 'ventas' });
    expect(updateCall.data.phaseId).toBe('p2');
    expect(updateCall.data.phaseOrder).toBe(1);
    expect(updateCall.data.prodStart).toBeNull();
    expect(updateCall.data.prodEnd).toBeNull();
    expect(updateCall.data.outputQuantity).toBeNull();
    expect(updateCall.data.imagePath).toBeNull();
    expect(updateCall.data.updatedById).toBe('actor1');
    expect(mocks.woSerial.deleteMany).toHaveBeenCalledWith({ where: { workOrderId: 'wo-1', tenantId: 'ventas' } });
    expect(mocks.workOrderPhaseEquip.deleteMany).toHaveBeenCalledWith({ where: { workOrderId: 'wo-1' } });
    expect(mocks.workOrderAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'work_order.phase_advanced',
          previousState: expect.objectContaining({ phaseId: 'p1', phaseOrder: 0 }),
          newState: expect.objectContaining({ phaseId: 'p2', phaseOrder: 1 }),
        }),
      }),
    );
    expect(result).toMatchObject({ id: 'wo-1', phaseId: 'p2', phaseOrder: 1 });
  });

  it('advanceWorkOrder blocks missing HET before changing phase', async () => {
    mocks.workOrder.findFirst.mockResolvedValueOnce({
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
    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
  });

  it('advanceWorkOrder blocks unfinished phases before changing phase', async () => {
    mocks.workOrder.findFirst.mockResolvedValueOnce({
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
    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
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
      readinessBlockers: ['Work-order image captured', 'Output quantity recorded'],
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
      readinessBlockers: ['HET not assigned', 'Release phase not finished', 'Work-order image captured', 'Output quantity recorded'],
    });
  });

  it('advanceWorkOrder throws "work order is at its final phase" at the last phase', async () => {
    mocks.workOrder.findFirst.mockResolvedValueOnce({
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
    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
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

  it('requires work-order photo evidence before next-phase advancement is ready', async () => {
    mocks.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-next',
        hetId: 'h1',
        phaseOrder: 6,
        phaseShort: 'P6',
        imagePath: null,
        outputQuantity: null,
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        workflow: { phases: [] },
        phase: { phaseShort: 'P6', bom: { lines: [{ id: 'bom-1', hasSerial: true }] } },
        nextPhase: { phaseShort: 'P7' },
        steralisationCurrent: null,
        sterilises: [],
        woSerials: [{ id: 'serial-1', bomRef: { id: 'bom-1' } }],
        phaseEquips: [],
        batchHets: [],
      },
    ]);

    const [result] = await listWorkOrders();

    expect(result).toMatchObject({
      legacyStateBucket: '2. Next Phase',
      serialCheckDone: true,
      canAdvanceLegacy: false,
      missingAdvanceRequirements: ['Work-order image captured', 'Output quantity recorded'],
      parityGaps: [],
    });
  });

  it('marks next-phase rows advanceable when required evidence is captured', async () => {
    mocks.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-next',
        hetId: 'h1',
        phaseOrder: 6,
        phaseShort: 'P6',
        imagePath: 'data:image/png;base64,AAAA',
        outputQuantity: { toString: () => '1.0000', gt: () => true },
        prodStart: new Date('2026-06-30T08:00:00Z'),
        prodEnd: new Date('2026-06-30T09:00:00Z'),
        workflow: { phases: [] },
        phase: { phaseShort: 'P6', bom: { lines: [{ id: 'bom-1', hasSerial: true }] } },
        nextPhase: { phaseShort: 'P7' },
        steralisationCurrent: null,
        sterilises: [],
        woSerials: [{ id: 'serial-1', bomRef: { id: 'bom-1' } }],
        phaseEquips: [],
        batchHets: [],
      },
    ]);

    const [result] = await listWorkOrders();

    expect(result).toMatchObject({
      legacyStateBucket: '2. Next Phase',
      serialCheckDone: true,
      canAdvanceLegacy: true,
      missingAdvanceRequirements: [],
      parityGaps: [],
    });
  });
});

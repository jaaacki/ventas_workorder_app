import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inventoryLot: { findFirst: vi.fn() },
  workOrder: { findFirst: vi.fn(), findMany: vi.fn() },
  het: { findFirst: vi.fn() },
  inventoryGenealogy: { findMany: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    inventoryLot: mocks.inventoryLot,
    workOrder: mocks.workOrder,
    het: mocks.het,
    inventoryGenealogy: mocks.inventoryGenealogy,
  },
}));

import { getBatchRecord } from '../batchRecordService.js';

// Minimal work-order shape the assembly reads. Only the fields getBatchRecord
// touches are populated.
function makeWorkOrder(overrides: Record<string, unknown>) {
  return {
    id: '',
    woNumber: null,
    previousWoId: null,
    hetId: 'het-1',
    phaseOrder: 0,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    prodStart: null,
    prodEnd: null,
    prodDuration: null,
    outputQuantity: null,
    imagePath: null,
    startSignPath: null,
    endSignPath: null,
    releaseStatus: null,
    releaseDecisionAt: null,
    releaseRemarks: null,
    phase: null,
    manufacturer: null,
    startSignBy: null,
    endSignBy: null,
    releaseDecisionBy: null,
    woSerials: [],
    phaseEquips: [],
    sterilises: [],
    ...overrides,
  };
}

describe('batchRecordService.getBatchRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the lot, walks the run chain backward, and maps evidence in phase order', async () => {
    mocks.inventoryLot.findFirst.mockResolvedValue({
      id: 'lot-fg',
      lotNumber: 'MANU-1',
      inventoryType: 'FINISHED_GOOD',
      status: 'available',
      quantityInitial: { toString: () => '1.0000' },
      quantityCurrent: { toString: () => '1.0000' },
      uom: 'ea',
      createdAt: new Date('2026-07-02T00:00:00Z'),
      workOrderId: 'wo-release',
      hetId: null,
    });

    const prep = makeWorkOrder({
      id: 'wo-prep',
      woNumber: 'WO-PREP',
      previousWoId: null,
      phaseOrder: 0,
      phase: { id: 'p0', phaseName: 'Preparation', phaseShort: 'PREP', sortOrder: 0, isGate: false },
      manufacturer: { id: 'm1', manuNumber: 'MANU-1', manuName: 'AmGraft' },
      prodStart: new Date('2026-07-01T09:00:00Z'),
      startSignPath: 'data:image/png;base64,START',
      startSignBy: { id: 's1', name: 'Alice', email: 'alice@test' },
      woSerials: [
        { id: 'wos1', serialNumber: 'SN-1', bomRef: { id: 'bl1', description: 'Graft', quantity: null, uom: 'ea', hasSerial: true, inventorySku: { id: 'sku1', sku: 'GRAFT-1', description: 'Graft' } } },
      ],
    });
    const release = makeWorkOrder({
      id: 'wo-release',
      woNumber: 'WO-REL',
      previousWoId: 'wo-prep',
      phaseOrder: 1,
      phase: { id: 'p1', phaseName: 'Release', phaseShort: 'REL', sortOrder: 1, isGate: false },
      releaseStatus: 'released',
      releaseDecisionAt: new Date('2026-07-02T00:00:00Z'),
      releaseDecisionBy: { id: 's2', name: 'Bob', email: 'bob@test' },
      sterilises: [
        { id: 'st1', direction: 'IN', result: true, betReading: { toString: () => '0.1' }, quantity: 1, signOn: new Date('2026-07-01T12:00:00Z'), signaturePath: 'data:image/png;base64,STER', signBy: { id: 's3', name: 'Cara', email: 'cara@test' } },
      ],
    });

    // Chain walk: findFirst by cursor id. release -> prep -> null.
    mocks.workOrder.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'wo-release' ? release : where.id === 'wo-prep' ? prep : null),
    );
    // Peer supplement by hetId returns the same two, already in the map.
    mocks.workOrder.findMany.mockResolvedValue([release, prep]);
    mocks.het.findFirst.mockResolvedValue({ id: 'het-1', hetNumber: 'HET-1', clinicName: 'Clinic A', HCICode: 'HCI-9', clinicId: 'c1' });
    mocks.inventoryGenealogy.findMany.mockResolvedValue([
      { relationshipType: 'CONVERSION', parentInventoryLot: { id: 'lot-het', lotNumber: 'HET-1', inventoryType: 'HET', hetId: 'het-1' } },
    ]);

    const record = await getBatchRecord('MANU-1', 'tenant-a');

    // Ordered first phase -> release.
    expect(record.phases.map((p) => p.phase?.phaseName)).toEqual(['Preparation', 'Release']);
    expect(record.manufacturer).toEqual({ manuNumber: 'MANU-1', manuName: 'AmGraft' });
    expect(record.release).toMatchObject({ status: 'released', decidedBy: 'Bob' });
    expect(record.hetOrigin).toMatchObject({ hetNumber: 'HET-1', clinicName: 'Clinic A', HCICode: 'HCI-9' });
    expect(record.genealogyParents).toEqual([
      { id: 'lot-het', lotNumber: 'HET-1', inventoryType: 'HET', hetId: 'het-1', relationshipType: 'CONVERSION' },
    ]);

    const prepPhase = record.phases[0];
    expect(prepPhase.startSignature).toMatchObject({ dataUrl: 'data:image/png;base64,START', signer: 'Alice' });
    expect(prepPhase.serials[0]).toMatchObject({ serialNumber: 'SN-1' });
    expect(prepPhase.serials[0].bomLine?.inventorySku).toMatchObject({ sku: 'GRAFT-1' });

    const releasePhase = record.phases[1];
    expect(releasePhase.sterilisations[0]).toMatchObject({ direction: 'IN', result: true, signer: 'Cara' });
  });

  it('includes a combined-HET leg reachable only via the batchHets-aware peer lookup', async () => {
    mocks.inventoryLot.findFirst.mockResolvedValue({
      id: 'lot-fg',
      lotNumber: 'MANU-2',
      inventoryType: 'FINISHED_GOOD',
      status: 'available',
      quantityInitial: { toString: () => '1.0000' },
      quantityCurrent: { toString: () => '1.0000' },
      uom: 'ea',
      createdAt: new Date('2026-07-02T00:00:00Z'),
      workOrderId: 'wo-release',
      hetId: null,
    });

    const release = makeWorkOrder({
      id: 'wo-release',
      woNumber: 'WO-REL',
      previousWoId: null,
      phaseOrder: 2,
      hetId: 'het-primary',
      // A HET combined into this run; its own leg lives on a separate work order.
      batchHets: [{ hetId: 'het-combined' }],
      phase: { id: 'p2', phaseName: 'Release', phaseShort: 'REL', sortOrder: 2, isGate: false },
      releaseStatus: 'released',
      releaseDecisionAt: new Date('2026-07-02T00:00:00Z'),
      releaseDecisionBy: { id: 's1', name: 'Bob', email: 'bob@test' },
    });
    // The combined HET's own collection work order — NOT in the previousWoId chain,
    // reachable only by the HET-key peer lookup (its hetId is the combined HET).
    const combinedLeg = makeWorkOrder({
      id: 'wo-combined-collect',
      woNumber: 'WO-COMB',
      previousWoId: null,
      phaseOrder: 0,
      hetId: 'het-combined',
      phase: { id: 'p0', phaseName: 'Combined Collection', phaseShort: 'COLL', sortOrder: 0, isGate: false },
    });

    mocks.workOrder.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'wo-release' ? release : null),
    );
    mocks.workOrder.findMany.mockImplementation(({ where }: { where: { id?: { in: string[] } } }) => {
      if (where.id?.in) {
        // Heavy fetch over the collected id set.
        return Promise.resolve([release, combinedLeg].filter((wo) => where.id!.in.includes(wo.id)));
      }
      // Peer-by-HET lookup: matches the run's primary + combined HET keys.
      return Promise.resolve([{ id: 'wo-release' }, { id: 'wo-combined-collect' }]);
    });
    mocks.het.findFirst.mockResolvedValue({ id: 'het-primary', hetNumber: 'HET-P', clinicName: 'Clinic', HCICode: 'HCI', clinicId: 'c1' });
    mocks.inventoryGenealogy.findMany.mockResolvedValue([]);

    const record = await getBatchRecord('MANU-2', 'tenant-a');

    // The combined leg's phase is assembled into the record, ordered ahead of release.
    expect(record.phases.map((p) => p.phase?.phaseName)).toEqual(['Combined Collection', 'Release']);
    expect(record.phases.map((p) => p.workOrderId)).toContain('wo-combined-collect');
  });

  it('throws a P2025-shaped error when the finished-goods lot is missing', async () => {
    mocks.inventoryLot.findFirst.mockResolvedValue(null);
    await expect(getBatchRecord('NOPE', 'tenant-a')).rejects.toMatchObject({ code: 'P2025' });
  });
});

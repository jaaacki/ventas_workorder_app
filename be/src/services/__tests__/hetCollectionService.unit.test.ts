import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workOrder: {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    updateMany: vi.fn(),
  },
  collectionPoint: {
    findFirst: vi.fn(),
  },
  collectionUnit: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  collectionOrder: { create: vi.fn() },
  collectionReceipt: { create: vi.fn() },
  collectionReceiptLine: { create: vi.fn() },
  het: { create: vi.fn() },
  issuanceOrder: { create: vi.fn() },
  issuanceOrderLine: { create: vi.fn(), findFirst: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    workOrder: mocks.workOrder,
    collectionPoint: mocks.collectionPoint,
    collectionUnit: mocks.collectionUnit,
    issuanceOrderLine: mocks.issuanceOrderLine,
    $transaction: vi.fn((callback) => callback({
      collectionOrder: mocks.collectionOrder,
      collectionReceipt: mocks.collectionReceipt,
      collectionReceiptLine: mocks.collectionReceiptLine,
      het: mocks.het,
      collectionUnit: mocks.collectionUnit,
      issuanceOrder: mocks.issuanceOrder,
      issuanceOrderLine: mocks.issuanceOrderLine,
      workOrder: mocks.workOrder,
    })),
  },
}));

const workOrderServiceMocks = vi.hoisted(() => ({
  auditState: vi.fn((wo: { id: string }) => ({ id: wo.id })),
  recordWorkOrderAuditEvent: vi.fn(),
  getDecoratedWorkOrderOrThrow: vi.fn(),
}));

vi.mock('../workOrderService.js', () => workOrderServiceMocks);

const auditLogMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn() }));
vi.mock('../auditLogService.js', () => auditLogMocks);

import { collectionUnitStatusSchema } from '@workorder/shared';
import { recordHetCollection, deliverEmptyContainer } from '../hetCollectionService.js';

const collectionPoint = { id: 'point-1', supplyEntityId: 'supply-1', displayName: 'Clinic A', hciCode: 'HCI-001' };

function primeHappyPath() {
  mocks.workOrder.findFirst.mockResolvedValue({
    id: 'wo-collect',
    tenantId: 'ventas',
    phaseId: 'p1',
    hetId: null,
    collectionReceiptId: null,
    issuanceOrderId: null,
    releaseStatus: null,
    phase: { processType: 'COLLECTION' },
  });
  mocks.collectionPoint.findFirst.mockResolvedValue(collectionPoint);
  mocks.collectionOrder.create.mockImplementation(({ data }) => Promise.resolve({ id: data.id }));
  mocks.collectionReceipt.create.mockImplementation(({ data }) => Promise.resolve({ id: data.id }));
  mocks.collectionReceiptLine.create.mockResolvedValue({ id: 'line-1' });
  mocks.het.create.mockImplementation(({ data }) => Promise.resolve({ id: data.id }));
  mocks.collectionUnit.update.mockResolvedValue({ id: 'unit-received' });
  mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
  mocks.workOrder.findFirstOrThrow.mockResolvedValue({ id: 'wo-collect' });
  workOrderServiceMocks.getDecoratedWorkOrderOrThrow.mockResolvedValue({ id: 'wo-collect', hetId: 'minted' });
}

function primeDeliverHappyPath() {
  mocks.workOrder.findFirst.mockResolvedValue({
    id: 'wo-collect',
    tenantId: 'ventas',
    phaseId: 'p1',
    hetId: null,
    collectionReceiptId: null,
    issuanceOrderId: null,
    releaseStatus: null,
    phase: { processType: 'COLLECTION' },
  });
  mocks.collectionPoint.findFirst.mockResolvedValue(collectionPoint);
  mocks.collectionUnit.findFirst.mockResolvedValue({ id: 'unit-1' });
  mocks.issuanceOrder.create.mockImplementation(({ data }) => Promise.resolve({ id: data.id }));
  mocks.issuanceOrderLine.create.mockResolvedValue({ id: 'iline-1' });
  mocks.collectionUnit.update.mockResolvedValue({ id: 'unit-1' });
  mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
  mocks.workOrder.findFirstOrThrow.mockResolvedValue({ id: 'wo-collect' });
  workOrderServiceMocks.getDecoratedWorkOrderOrThrow.mockResolvedValue({ id: 'wo-collect', issuanceOrderId: 'issued' });
}

beforeEach(() => {
  vi.clearAllMocks();
  workOrderServiceMocks.auditState.mockImplementation((wo: { id: string }) => ({ id: wo.id }));
});

describe('hetCollectionService.recordHetCollection', () => {
  it('throws P2025 when the work order does not exist', async () => {
    mocks.workOrder.findFirst.mockResolvedValue(null);
    await expect(recordHetCollection('missing', { collectionPointId: 'point-1' }, 'actor1')).rejects.toMatchObject({ code: 'P2025' });
    expect(mocks.het.create).not.toHaveBeenCalled();
  });

  it('rejects a work order that is not at a collection phase', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', phaseId: 'p1', hetId: null, collectionReceiptId: null, releaseStatus: null, phase: { processType: null } });
    await expect(recordHetCollection('wo-1', { collectionPointId: 'point-1' }, 'actor1')).rejects.toThrow(
      'cannot collect: work order is not at a collection phase',
    );
  });

  it('rejects a work order that already has a collected HET', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', phaseId: 'p1', hetId: 'het-existing', collectionReceiptId: null, releaseStatus: null, phase: { processType: 'COLLECTION' } });
    await expect(recordHetCollection('wo-1', { collectionPointId: 'point-1' }, 'actor1')).rejects.toThrow(
      'cannot collect: work order already has a collected HET',
    );
  });

  it('rejects a released work order', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', phaseId: 'p1', hetId: null, collectionReceiptId: null, releaseStatus: 'released', phase: { processType: 'COLLECTION' } });
    await expect(recordHetCollection('wo-1', { collectionPointId: 'point-1' }, 'actor1')).rejects.toThrow(
      'cannot collect: work order already has a release disposition',
    );
  });

  it('rejects an unknown collection point', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', phaseId: 'p1', hetId: null, collectionReceiptId: null, releaseStatus: null, phase: { processType: 'COLLECTION' } });
    mocks.collectionPoint.findFirst.mockResolvedValue(null);
    await expect(recordHetCollection('wo-1', { collectionPointId: 'nope' }, 'actor1')).rejects.toThrow(
      'cannot collect: collection point not found',
    );
    expect(mocks.het.create).not.toHaveBeenCalled();
  });

  it('rejects a collection unit that does not belong to the caller tenant', async () => {
    // Het.collectionUnitId is a global FK; a cross-tenant unit fails the
    // tenant-scoped lookup (findFirst returns null) and must be rejected before
    // any HET is minted with it.
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', phaseId: 'p1', hetId: null, collectionReceiptId: null, releaseStatus: null, phase: { processType: 'COLLECTION' } });
    mocks.collectionPoint.findFirst.mockResolvedValue(collectionPoint);
    mocks.collectionUnit.findFirst.mockResolvedValue(null);
    await expect(
      recordHetCollection('wo-1', { collectionPointId: 'point-1', collectionUnitId: 'unit-other-tenant' }, 'actor1'),
    ).rejects.toThrow('cannot collect: collection unit not found');
    expect(mocks.het.create).not.toHaveBeenCalled();
  });

  it('accepts a same-tenant collection unit and mints the HET', async () => {
    primeHappyPath();
    mocks.collectionUnit.findFirst.mockResolvedValue({ id: 'unit-1' });
    await recordHetCollection('wo-collect', { collectionPointId: 'point-1', collectionUnitId: 'unit-1' }, 'actor1');
    expect(mocks.collectionUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'unit-1', tenantId: 'ventas' }) }),
    );
    expect(mocks.het.create.mock.calls[0][0].data.collectionUnitId).toBe('unit-1');
  });

  it('mints a HET with COLL-/HET- ids and wires every custody link', async () => {
    primeHappyPath();

    await recordHetCollection(
      'wo-collect',
      { collectionPointId: 'point-1', quantity: 2, lotNumber: 'LOT-01', parcelTrackingNumber: 'TRACK-9', signatureDataUrl: 'data:image/png;base64,AAAA' },
      'actor1',
    );

    const orderData = mocks.collectionOrder.create.mock.calls[0][0].data;
    const receiptData = mocks.collectionReceipt.create.mock.calls[0][0].data;
    const lineData = mocks.collectionReceiptLine.create.mock.calls[0][0].data;
    const hetData = mocks.het.create.mock.calls[0][0].data;
    const woUpdate = mocks.workOrder.updateMany.mock.calls[0][0];

    // Distinct records under one COLL- collection, a HET- minted HET.
    expect(orderData.id).toMatch(/^COLL-.*-ORD$/);
    expect(receiptData.id).toMatch(/^COLL-.*-RCP$/);
    expect(hetData.id).toMatch(/^HET-/);

    // Custody signature lands on the receipt.
    expect(receiptData.signaturePath).toBe('data:image/png;base64,AAAA');

    // Real FK links both ways: line -> het (resultingHetId) and het -> line.
    expect(lineData.resultingHetId).toBe(hetData.id);
    expect(hetData.collectionReceiptLineId).toBe('line-1');

    // Lot number recorded as the HET number; clinic copied from the point.
    expect(hetData.hetNumber).toBe('LOT-01');
    expect(hetData.clinicName).toBe('Clinic A');
    expect(hetData.HCICode).toBe('HCI-001');
    expect(hetData.quantity).toBe(2);
    expect(hetData.usedById).toBe('wo-collect');

    // Work order gets the minted HET + its receipt, guarded on both being null.
    expect(woUpdate.where).toMatchObject({ id: 'wo-collect', hetId: null, collectionReceiptId: null });
    expect(woUpdate.data.hetId).toBe(hetData.id);
    expect(woUpdate.data.collectionReceiptId).toBe(receiptData.id);

    // Lifecycle audit event + generic receipt audit log written after the tx.
    expect(workOrderServiceMocks.recordWorkOrderAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'work_order.het_collected', workOrderId: 'wo-collect' }),
    );
    expect(auditLogMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'CollectionReceipt', action: 'create' }),
    );
  });

  it('falls back to the HET id as hetNumber when no lot number is provided', async () => {
    primeHappyPath();
    await recordHetCollection('wo-collect', { collectionPointId: 'point-1' }, 'actor1');
    const hetData = mocks.het.create.mock.calls[0][0].data;
    expect(hetData.hetNumber).toBe(hetData.id);
    expect(hetData.quantity).toBeNull();
  });

  it('aborts when a concurrent collection already attached a HET (updateMany count 0)', async () => {
    primeHappyPath();
    mocks.workOrder.updateMany.mockResolvedValue({ count: 0 });
    await expect(recordHetCollection('wo-collect', { collectionPointId: 'point-1' }, 'actor1')).rejects.toThrow(
      'cannot collect: work order already has a collected HET',
    );
  });

  it('closes the prior deliver issuance and receives the same container (continuity)', async () => {
    primeHappyPath();
    // The run already delivered an empty container; the collect leg must close it.
    mocks.workOrder.findFirst.mockResolvedValue({
      id: 'wo-collect', tenantId: 'ventas', phaseId: 'p1', hetId: null,
      collectionReceiptId: null, issuanceOrderId: 'iss-1', releaseStatus: null,
      phase: { processType: 'COLLECTION' },
    });
    mocks.issuanceOrderLine.findFirst.mockResolvedValue({ collectionUnitId: 'unit-delivered' });

    await recordHetCollection('wo-collect', { collectionPointId: 'point-1', quantity: 1 }, 'actor1');

    const receiptData = mocks.collectionReceipt.create.mock.calls[0][0].data;
    const lineData = mocks.collectionReceiptLine.create.mock.calls[0][0].data;
    const hetData = mocks.het.create.mock.calls[0][0].data;

    // Receipt links back to the deliver issuance; the delivered container round-trips.
    expect(receiptData.issuanceOrderId).toBe('iss-1');
    expect(lineData.collectionUnitId).toBe('unit-delivered');
    expect(hetData.collectionUnitId).toBe('unit-delivered');

    // The container is now RECEIVED.
    expect(mocks.collectionUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'unit-delivered' }, data: expect.objectContaining({ status: 'RECEIVED' }) }),
    );
  });

  it('does not touch CollectionUnit.status on a direct collect with no prior deliver (phase-1)', async () => {
    primeHappyPath();
    await recordHetCollection('wo-collect', { collectionPointId: 'point-1', collectionUnitId: 'unit-1' }, 'actor1');
    const receiptData = mocks.collectionReceipt.create.mock.calls[0][0].data;
    expect(receiptData.issuanceOrderId).toBeNull();
    expect(mocks.collectionUnit.update).not.toHaveBeenCalled();
  });
});

describe('hetCollectionService.deliverEmptyContainer', () => {
  it('issues an empty container: COLL-ISS issuance + line with parcel, unit ISSUED, WO linked', async () => {
    primeDeliverHappyPath();

    await deliverEmptyContainer(
      'wo-collect',
      { collectionPointId: 'point-1', collectionUnitId: 'unit-1', parcelTrackingNumber: 'TRACK-OUT', signatureDataUrl: 'data:image/png;base64,AAAA' },
      'actor1',
    );

    const issuanceData = mocks.issuanceOrder.create.mock.calls[0][0].data;
    const lineData = mocks.issuanceOrderLine.create.mock.calls[0][0].data;
    const unitUpdate = mocks.collectionUnit.update.mock.calls[0][0];
    const woUpdate = mocks.workOrder.updateMany.mock.calls[0][0];

    expect(issuanceData.id).toMatch(/^COLL-.*-ISS$/);
    expect(issuanceData.signaturePath).toBe('data:image/png;base64,AAAA');
    expect(issuanceData.issuedBy).toBe('actor1');
    expect(lineData.issuanceOrderId).toBe(issuanceData.id);
    expect(lineData.collectionUnitId).toBe('unit-1');
    expect(lineData.parcelTrackingNumber).toBe('TRACK-OUT');

    // Container moves into the ISSUED lifecycle state.
    expect(unitUpdate).toMatchObject({ where: { id: 'unit-1' }, data: expect.objectContaining({ status: 'ISSUED' }) });

    // WO links the issuance, guarded on issuanceOrderId being null.
    expect(woUpdate.where).toMatchObject({ id: 'wo-collect', issuanceOrderId: null });
    expect(woUpdate.data.issuanceOrderId).toBe(issuanceData.id);

    expect(workOrderServiceMocks.recordWorkOrderAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'work_order.empty_delivered', workOrderId: 'wo-collect' }),
    );
    expect(auditLogMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'IssuanceOrder', action: 'create' }),
    );
  });

  it('throws P2025 when the work order does not exist', async () => {
    mocks.workOrder.findFirst.mockResolvedValue(null);
    await expect(
      deliverEmptyContainer('missing', { collectionPointId: 'point-1', collectionUnitId: 'unit-1' }, 'actor1'),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect(mocks.issuanceOrder.create).not.toHaveBeenCalled();
  });

  it('rejects a work order that is not at a collection phase', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', phaseId: 'p1', hetId: null, collectionReceiptId: null, issuanceOrderId: null, releaseStatus: null, phase: { processType: null } });
    await expect(
      deliverEmptyContainer('wo-1', { collectionPointId: 'point-1', collectionUnitId: 'unit-1' }, 'actor1'),
    ).rejects.toThrow('cannot deliver: work order is not at a collection phase');
  });

  it('rejects a released work order', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', phaseId: 'p1', hetId: null, collectionReceiptId: null, issuanceOrderId: null, releaseStatus: 'released', phase: { processType: 'COLLECTION' } });
    await expect(
      deliverEmptyContainer('wo-1', { collectionPointId: 'point-1', collectionUnitId: 'unit-1' }, 'actor1'),
    ).rejects.toThrow('cannot deliver: work order already has a release disposition');
  });

  it('rejects a work order that already issued a container', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', phaseId: 'p1', hetId: null, collectionReceiptId: null, issuanceOrderId: 'iss-existing', releaseStatus: null, phase: { processType: 'COLLECTION' } });
    await expect(
      deliverEmptyContainer('wo-1', { collectionPointId: 'point-1', collectionUnitId: 'unit-1' }, 'actor1'),
    ).rejects.toThrow('cannot deliver: work order already has an issued container');
  });

  it('rejects an unknown collection point', async () => {
    primeDeliverHappyPath();
    mocks.collectionPoint.findFirst.mockResolvedValue(null);
    await expect(
      deliverEmptyContainer('wo-collect', { collectionPointId: 'nope', collectionUnitId: 'unit-1' }, 'actor1'),
    ).rejects.toThrow('cannot deliver: collection point not found');
    expect(mocks.issuanceOrder.create).not.toHaveBeenCalled();
  });

  it('rejects a collection unit that does not belong to the caller tenant', async () => {
    primeDeliverHappyPath();
    mocks.collectionUnit.findFirst.mockResolvedValue(null);
    await expect(
      deliverEmptyContainer('wo-collect', { collectionPointId: 'point-1', collectionUnitId: 'unit-other-tenant' }, 'actor1'),
    ).rejects.toThrow('cannot deliver: collection unit not found');
    expect(mocks.issuanceOrder.create).not.toHaveBeenCalled();
  });

  it('aborts when a concurrent deliver already issued a container (updateMany count 0)', async () => {
    primeDeliverHappyPath();
    mocks.workOrder.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      deliverEmptyContainer('wo-collect', { collectionPointId: 'point-1', collectionUnitId: 'unit-1' }, 'actor1'),
    ).rejects.toThrow('cannot deliver: work order already has an issued container');
  });
});

describe('collectionUnitStatusSchema', () => {
  it('accepts the live lifecycle values and rejects anything else', () => {
    expect(collectionUnitStatusSchema.parse('ISSUED')).toBe('ISSUED');
    expect(collectionUnitStatusSchema.parse('RECEIVED')).toBe('RECEIVED');
    expect(() => collectionUnitStatusSchema.parse('RECEIVED_AS_HET')).toThrow();
    expect(() => collectionUnitStatusSchema.parse('bogus')).toThrow();
  });
});

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
  collectionOrder: { create: vi.fn() },
  collectionReceipt: { create: vi.fn() },
  collectionReceiptLine: { create: vi.fn() },
  het: { create: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    workOrder: mocks.workOrder,
    collectionPoint: mocks.collectionPoint,
    $transaction: vi.fn((callback) => callback({
      collectionOrder: mocks.collectionOrder,
      collectionReceipt: mocks.collectionReceipt,
      collectionReceiptLine: mocks.collectionReceiptLine,
      het: mocks.het,
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

import { recordHetCollection } from '../hetCollectionService.js';

const collectionPoint = { id: 'point-1', supplyEntityId: 'supply-1', displayName: 'Clinic A', hciCode: 'HCI-001' };

function primeHappyPath() {
  mocks.workOrder.findFirst.mockResolvedValue({
    id: 'wo-collect',
    tenantId: 'ventas',
    phaseId: 'p1',
    hetId: null,
    collectionReceiptId: null,
    releaseStatus: null,
    phase: { processType: 'COLLECTION' },
  });
  mocks.collectionPoint.findFirst.mockResolvedValue(collectionPoint);
  mocks.collectionOrder.create.mockImplementation(({ data }) => Promise.resolve({ id: data.id }));
  mocks.collectionReceipt.create.mockImplementation(({ data }) => Promise.resolve({ id: data.id }));
  mocks.collectionReceiptLine.create.mockResolvedValue({ id: 'line-1' });
  mocks.het.create.mockImplementation(({ data }) => Promise.resolve({ id: data.id }));
  mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });
  mocks.workOrder.findFirstOrThrow.mockResolvedValue({ id: 'wo-collect' });
  workOrderServiceMocks.getDecoratedWorkOrderOrThrow.mockResolvedValue({ id: 'wo-collect', hetId: 'minted' });
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
});

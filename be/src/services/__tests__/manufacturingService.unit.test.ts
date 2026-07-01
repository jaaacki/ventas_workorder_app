import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  manufacturer: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  workOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    manufacturer: mocks.manufacturer,
    workOrder: mocks.workOrder,
    $transaction: mocks.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ manufacturer: mocks.manufacturer, workOrder: mocks.workOrder }),
    ),
  },
}));

import * as manufacturingService from '../manufacturingService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('manufacturingService', () => {
  it('generateBatchRecord creates a Manufacturer with a MANU- manuNumber and links the work order', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo1', tenantId: 'ventas' });
    mocks.manufacturer.create.mockResolvedValue({ id: 'm1', manuNumber: 'MANU-XYZ' });

    const result = await manufacturingService.generateBatchRecord('wo1', 'actor1');

    expect(result).toEqual({ id: 'm1', manuNumber: 'MANU-XYZ' });

    const createCall = mocks.manufacturer.create.mock.calls[0][0] as {
      data: { tenantId: string; manuNumber: string; createdById: string; updatedById: string };
    };
    expect(createCall.data.tenantId).toBe('ventas');
    expect(createCall.data.manuNumber).toMatch(/^MANU-/);
    expect(createCall.data.manuNumber).not.toEqual('MANU-');
    expect(createCall.data.createdById).toBe('actor1');
    expect(createCall.data.updatedById).toBe('actor1');

    const updateCall = mocks.workOrder.update.mock.calls[0][0] as {
      where: { id: string };
      data: { manuId: string; manuNumber: string; updatedById: string };
    };
    expect(updateCall.where.id).toBe('wo1');
    expect(updateCall.data.manuId).toBe('m1');
    expect(updateCall.data.manuNumber).toMatch(/^MANU-/);
    expect(updateCall.data.updatedById).toBe('actor1');
  });

  it('generateBatchRecord throws a P2025-shaped error when the work order is missing', async () => {
    mocks.workOrder.findFirst.mockResolvedValue(null);

    await expect(manufacturingService.generateBatchRecord('missing', 'actor1')).rejects.toMatchObject({
      code: 'P2025',
    });

    expect(mocks.manufacturer.create).not.toHaveBeenCalled();
    expect(mocks.workOrder.update).not.toHaveBeenCalled();
  });

  it('generateBatchRecord scopes work order lookup and manufacturer creation to the caller tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo1', tenantId: 'tenant-a' });
    mocks.manufacturer.create.mockResolvedValue({ id: 'm1', manuNumber: 'MANU-XYZ' });

    await manufacturingService.generateBatchRecord('wo1', 'actor1', 'tenant-a');

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'wo1', tenantId: 'tenant-a' },
    });
    expect(mocks.manufacturer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-a' }),
      }),
    );
  });

  it('getBatchRecord scopes reads to the caller tenant', async () => {
    mocks.manufacturer.findFirst.mockResolvedValue({ id: 'm1' });
    await manufacturingService.getBatchRecord('m1', 'tenant-a');
    expect(mocks.manufacturer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', tenantId: 'tenant-a' } }),
    );
  });
});

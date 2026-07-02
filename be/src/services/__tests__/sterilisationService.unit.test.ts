import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sterilise: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  het: {
    count: vi.fn(),
  },
  workOrder: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../../db/prisma.js', () => {
  // The prisma stub mirrors the singleton: $transaction hands the same model
  // mocks to the callback as the transaction client `tx`.
  const prisma = {
    sterilise: mocks.sterilise,
    het: mocks.het,
    workOrder: mocks.workOrder,
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
  return { prisma };
});

import {
  createSterilisation,
  listSterilisations,
  setSterilisationResult,
} from '../sterilisationService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sterilisationService', () => {
  it('createSterilisation creates a row, links hets and sets work order steralisationCurrentId', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', tenantId: 'ventas' });
    mocks.het.count.mockResolvedValue(2);
    mocks.sterilise.create.mockResolvedValue({ id: 'ster-1', workOrderId: 'wo-1' });
    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });

    const result = await createSterilisation(
      {
        workOrderId: 'wo-1',
        direction: 'OUT',
        result: true,
        signById: 'staff-1',
        hetIds: ['het-1', 'het-2'],
      },
      'actor1',
    );

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'wo-1', tenantId: 'ventas' },
      select: { id: true, tenantId: true },
    });
    expect(mocks.het.count).toHaveBeenCalledWith({
      where: { id: { in: ['het-1', 'het-2'] }, tenantId: 'ventas', deleted: false },
    });

    const createCall = mocks.sterilise.create.mock.calls[0][0];
    expect(createCall.data.workOrderId).toBe('wo-1');
    expect(createCall.data.tenantId).toBe('ventas');
    expect(createCall.data.direction).toBe('OUT');
    expect(createCall.data.result).toBe(true);
    expect(createCall.data.signById).toBe('staff-1');
    expect(createCall.data.createdById).toBe('actor1');
    expect(createCall.data.updatedById).toBe('actor1');
    expect(createCall.data.id).toMatch(/^STER-/);
    expect(createCall.data.batchHets.create).toEqual([
      { hetId: 'het-1' },
      { hetId: 'het-2' },
    ]);

    expect(mocks.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', tenantId: 'ventas' },
      data: {
        steralisationCurrentId: 'ster-1',
        updatedById: 'actor1',
      },
    });

    expect(result).toEqual({ id: 'ster-1', workOrderId: 'wo-1' });
  });

  it('createSterilisation throws P2025 when the work order is missing', async () => {
    mocks.workOrder.findFirst.mockResolvedValue(null);

    await expect(
      createSterilisation({ workOrderId: 'missing', direction: 'IN' }, 'actor1'),
    ).rejects.toMatchObject({ code: 'P2025' });

    expect(mocks.sterilise.create).not.toHaveBeenCalled();
    expect(mocks.workOrder.updateMany).not.toHaveBeenCalled();
  });

  it('createSterilisation omits optional fields and batchHets when not provided', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', tenantId: 'ventas' });
    mocks.sterilise.create.mockResolvedValue({ id: 'ster-2' });
    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });

    await createSterilisation(
      { workOrderId: 'wo-1', direction: 'IN' },
      'actor1',
    );

    const createCall = mocks.sterilise.create.mock.calls[0][0];
    expect(createCall.data).not.toHaveProperty('result');
    expect(createCall.data).not.toHaveProperty('signById');
    expect(createCall.data).not.toHaveProperty('batchHets');
  });

  it('createSterilisation scopes work order and HET checks to the caller tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', tenantId: 'tenant-a' });
    mocks.het.count.mockResolvedValue(1);
    mocks.sterilise.create.mockResolvedValue({ id: 'ster-1' });
    mocks.workOrder.updateMany.mockResolvedValue({ count: 1 });

    await createSterilisation(
      { workOrderId: 'wo-1', direction: 'OUT', hetIds: ['het-1'] },
      'actor1',
      'tenant-a',
    );

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'wo-1', tenantId: 'tenant-a' },
      select: { id: true, tenantId: true },
    });
    expect(mocks.het.count).toHaveBeenCalledWith({
      where: { id: { in: ['het-1'] }, tenantId: 'tenant-a', deleted: false },
    });
    expect(mocks.sterilise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-a' }),
      }),
    );
  });

  it('listSterilisations queries by workOrderId', async () => {
    mocks.sterilise.findMany.mockResolvedValue([{ id: 'ster-1' }]);

    const result = await listSterilisations('wo-1');

    expect(mocks.sterilise.findMany).toHaveBeenCalledWith({
      where: { workOrderId: 'wo-1', tenantId: 'ventas' },
      include: { batchHets: { include: { het: { select: { id: true, hetNumber: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([{ id: 'ster-1' }]);
  });

  it('listSterilisations scopes reads to the caller tenant', async () => {
    mocks.sterilise.findMany.mockResolvedValue([]);
    await listSterilisations('wo-1', 'tenant-a');
    expect(mocks.sterilise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workOrderId: 'wo-1', tenantId: 'tenant-a' } }),
    );
  });

  it('setSterilisationResult updates the result', async () => {
    mocks.sterilise.findFirst.mockResolvedValue({ id: 'ster-1' });
    mocks.sterilise.updateMany.mockResolvedValue({ count: 1 });
    mocks.sterilise.findFirstOrThrow.mockResolvedValue({ id: 'ster-1', result: false });

    const result = await setSterilisationResult('ster-1', false, 'actor1');

    expect(mocks.sterilise.findFirst).toHaveBeenCalledWith({
      where: { id: 'ster-1', tenantId: 'ventas' },
      select: { id: true },
    });
    expect(mocks.sterilise.updateMany).toHaveBeenCalledWith({
      where: { id: 'ster-1', tenantId: 'ventas' },
      data: { result: false, updatedById: 'actor1' },
    });
    expect(mocks.sterilise.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'ster-1', tenantId: 'ventas' },
      include: { batchHets: { include: { het: { select: { id: true, hetNumber: true } } } } },
    });
    expect(result).toEqual({ id: 'ster-1', result: false });
  });

  it('setSterilisationResult scopes the preflight lookup to the caller tenant', async () => {
    mocks.sterilise.findFirst.mockResolvedValue({ id: 'ster-1' });
    mocks.sterilise.updateMany.mockResolvedValue({ count: 1 });
    mocks.sterilise.findFirstOrThrow.mockResolvedValue({ id: 'ster-1', result: true });
    await setSterilisationResult('ster-1', true, 'actor1', 'tenant-a');
    expect(mocks.sterilise.findFirst).toHaveBeenCalledWith({
      where: { id: 'ster-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
  });

  it('setSterilisationResult throws a P2025-shaped error when missing', async () => {
    mocks.sterilise.findFirst.mockResolvedValue(null);

    await expect(setSterilisationResult('missing', true, 'actor1')).rejects.toMatchObject({
      code: 'P2025',
    });
  });
});

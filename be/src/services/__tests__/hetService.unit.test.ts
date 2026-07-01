import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  het: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  workOrder: { findFirst: vi.fn() },
  workOrderHet: { upsert: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    het: mocks.het,
    workOrder: mocks.workOrder,
    workOrderHet: mocks.workOrderHet,
  },
}));

import * as hetService from '../hetService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('hetService', () => {
  it('listHets excludes deleted and orders newest first', async () => {
    mocks.het.findMany.mockResolvedValue([{ id: 'h1' }]);
    await hetService.listHets();
    expect(mocks.het.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deleted: false, tenantId: 'ventas' }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('useHet sets usedById to the work order and creates the WorkOrderHet link', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo1' });
    mocks.het.findFirst.mockResolvedValue({ id: 'h1' });
    mocks.het.update.mockResolvedValue({ id: 'h1', usedById: 'wo1' });
    mocks.workOrderHet.upsert.mockResolvedValue({});

    const result = await hetService.useHet('h1', { workOrderId: 'wo1', actorId: 'actor1' });

    expect(mocks.het.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'h1' },
        data: { usedById: 'wo1' },
      }),
    );
    expect(mocks.workOrderHet.upsert).toHaveBeenCalledWith({
      where: { workOrderId_hetId: { workOrderId: 'wo1', hetId: 'h1' } },
      create: { workOrderId: 'wo1', hetId: 'h1' },
      update: {},
    });
    expect(result).toEqual({ id: 'h1', usedById: 'wo1' });
  });

  it('useHet scopes work order and HET preflight checks to the caller tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo1' });
    mocks.het.findFirst.mockResolvedValue({ id: 'h1' });
    mocks.het.update.mockResolvedValue({ id: 'h1', usedById: 'wo1' });
    mocks.workOrderHet.upsert.mockResolvedValue({});

    await hetService.useHet('h1', { workOrderId: 'wo1', actorId: 'actor1', tenantId: 'tenant-a' });

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'wo1', tenantId: 'tenant-a', deleted: false },
      select: { id: true },
    });
    expect(mocks.het.findFirst).toHaveBeenCalledWith({
      where: { id: 'h1', tenantId: 'tenant-a', deleted: false },
      select: { id: true },
    });
  });

  it('finishHet sets finishedById to the work order', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo1' });
    mocks.het.findFirst.mockResolvedValue({ id: 'h1' });
    mocks.het.update.mockResolvedValue({ id: 'h1', finishedById: 'wo1' });

    const result = await hetService.finishHet('h1', { workOrderId: 'wo1', actorId: 'actor1' });

    expect(mocks.het.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'h1' },
        data: { finishedById: 'wo1' },
      }),
    );
    expect(result).toEqual({ id: 'h1', finishedById: 'wo1' });
  });

  it('finishHet scopes work order and HET preflight checks to the caller tenant', async () => {
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo1' });
    mocks.het.findFirst.mockResolvedValue({ id: 'h1' });
    mocks.het.update.mockResolvedValue({ id: 'h1', finishedById: 'wo1' });

    await hetService.finishHet('h1', { workOrderId: 'wo1', actorId: 'actor1', tenantId: 'tenant-a' });

    expect(mocks.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'wo1', tenantId: 'tenant-a', deleted: false },
      select: { id: true },
    });
    expect(mocks.het.findFirst).toHaveBeenCalledWith({
      where: { id: 'h1', tenantId: 'tenant-a', deleted: false },
      select: { id: true },
    });
  });

  it('useHet rethrows a P2025 when the HET is missing', async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError('record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    mocks.workOrder.findFirst.mockResolvedValue({ id: 'wo1' });
    mocks.het.findFirst.mockResolvedValue(null);

    await expect(
      hetService.useHet('missing', { workOrderId: 'wo1', actorId: 'actor1' }),
    ).rejects.toMatchObject({ code: p2025.code });
    expect(mocks.workOrderHet.upsert).not.toHaveBeenCalled();
  });
});

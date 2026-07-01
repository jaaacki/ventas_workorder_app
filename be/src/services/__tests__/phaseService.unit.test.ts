import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  phase: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    phase: mocks.phase,
  },
}));

import { listPhases } from '../phaseService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('phaseService', () => {
  it('lists the tenant phase catalog ordered for workflow binding', async () => {
    mocks.phase.findMany.mockResolvedValue([]);

    await listPhases('tenant-a');

    expect(mocks.phase.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: {
        id: true,
        tenantId: true,
        phaseName: true,
        phaseShort: true,
        phaseOrder: true,
        description: true,
        bomId: true,
        keyText: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { phaseOrder: 'asc' },
        { phaseName: 'asc' },
        { id: 'asc' },
      ],
    });
  });
});

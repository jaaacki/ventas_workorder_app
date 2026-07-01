import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

export async function listPhases(tenantId?: string | null) {
  return prisma.phase.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
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
}

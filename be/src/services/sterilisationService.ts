import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

export interface CreateSterilisationInput {
  workOrderId: string;
  direction: 'OUT' | 'IN';
  result?: boolean;
  signById?: string;
  hetIds?: string[];
}

/**
 * Detail include for a Sterilise row: the linked HETs captured as a batch
 * (SteriliseHet join rows) so the caller can see what was processed.
 */
const steriliseDetailInclude = {
  batchHets: { include: { het: { select: { id: true, hetNumber: true } } } },
} satisfies Prisma.SteriliseInclude;

export async function createSterilisation(
  input: CreateSterilisationInput,
  actorId: string,
  tenantId?: string | null,
) {
  const hetIds = input.hetIds ?? [];
  const scopedTenantId = tenantIdOrDefault(tenantId);

  const sterilise = await prisma.$transaction(async (tx) => {
    // Guard the work order up front: workOrderId is a required foreign key, but
    // surfacing a clear P2025 here lets the route return 404 before any row is
    // written instead of relying on the create to fail later.
    const workOrder = await tx.workOrder.findFirst({
      where: { id: input.workOrderId, tenantId: scopedTenantId },
      select: { id: true, tenantId: true },
    });
    if (!workOrder) {
      throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }

    if (hetIds.length > 0) {
      const tenantHetCount = await tx.het.count({
        where: { id: { in: hetIds }, tenantId: scopedTenantId, deleted: false },
      });
      if (tenantHetCount !== new Set(hetIds).size) {
        throw new Prisma.PrismaClientKnownRequestError('Referenced HET not found', {
          code: 'P2025',
          clientVersion: 'unknown',
        });
      }
    }

    // Sterilise.id has no @default; generate a human-readable id mirroring the
    // WorkOrder woNumber convention so the sterilisation is addressable.
    const id = `STER-${Date.now().toString(36).toUpperCase()}`;

    const created = await tx.sterilise.create({
      data: {
        id,
        tenantId: scopedTenantId,
        workOrderId: input.workOrderId,
        direction: input.direction,
        ...(input.result !== undefined && { result: input.result }),
        ...(input.signById !== undefined && { signById: input.signById }),
        createdById: actorId,
        updatedById: actorId,
        ...(hetIds.length > 0 && {
          batchHets: {
            create: hetIds.map((hetId) => ({ hetId })),
          },
        }),
      },
      include: steriliseDetailInclude,
    });

    // Track the latest sterilisation on the work order.
    await tx.workOrder.update({
      where: { id: input.workOrderId },
      data: {
        steralisationCurrentId: created.id,
        updatedById: actorId,
      },
    });

    return created;
  });

  return sterilise;
}

export async function listSterilisations(workOrderId: string, tenantId?: string | null) {
  return prisma.sterilise.findMany({
    where: { workOrderId, tenantId: tenantIdOrDefault(tenantId) },
    include: steriliseDetailInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function setSterilisationResult(
  id: string,
  result: boolean,
  actorId: string,
  tenantId?: string | null,
) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  try {
    const existing = await prisma.sterilise.findFirst({
      where: { id, tenantId: scopedTenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new Prisma.PrismaClientKnownRequestError('Sterilise not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }
    return await prisma.sterilise.update({
      where: { id },
      data: {
        result,
        updatedById: actorId,
      },
      include: steriliseDetailInclude,
    });
  } catch (err) {
    // P2025 = record to update not found; surface a clear message so the route
    // can map it to 404.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      throw new Prisma.PrismaClientKnownRequestError('Sterilise not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }
    throw err;
  }
}

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

export interface CreatePhaseInput {
  phaseName?: string | null;
  phaseShort?: string | null;
  phaseOrder?: number | null;
  description?: string | null;
  bomId?: string | null;
  keyText?: string | null;
}

export interface UpdatePhaseInput {
  phaseName?: string | null;
  phaseShort?: string | null;
  phaseOrder?: number | null;
  description?: string | null;
  bomId?: string | null;
  keyText?: string | null;
}

const phaseSelect = {
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
} as const;

export async function listPhases(tenantId?: string | null) {
  return prisma.phase.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    select: phaseSelect,
    orderBy: [
      { phaseOrder: 'asc' },
      { phaseName: 'asc' },
      { id: 'asc' },
    ],
  });
}

export async function getPhase(id: string, tenantId?: string | null) {
  return prisma.phase.findFirst({
    where: { id, tenantId: tenantIdOrDefault(tenantId) },
    select: phaseSelect,
  });
}

export async function createPhase(input: CreatePhaseInput, actorId: string, tenantId?: string | null) {
  return prisma.phase.create({
    data: {
      id: randomUUID(),
      tenantId: tenantIdOrDefault(tenantId),
      phaseName: input.phaseName ?? null,
      phaseShort: input.phaseShort ?? null,
      phaseOrder: input.phaseOrder ?? null,
      description: input.description ?? null,
      bomId: input.bomId ?? null,
      keyText: input.keyText ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
    select: phaseSelect,
  });
}

export async function updatePhase(id: string, input: UpdatePhaseInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const phase = await prisma.phase.findFirst({
    where: { id, tenantId: scopedTenantId },
    select: { id: true },
  });
  if (!phase) {
    throw new Prisma.PrismaClientKnownRequestError('Phase not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  return prisma.phase.update({
    where: { id },
    data: {
      ...(input.phaseName !== undefined && { phaseName: input.phaseName }),
      ...(input.phaseShort !== undefined && { phaseShort: input.phaseShort }),
      ...(input.phaseOrder !== undefined && { phaseOrder: input.phaseOrder }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.bomId !== undefined && { bomId: input.bomId }),
      ...(input.keyText !== undefined && { keyText: input.keyText }),
      updatedById: actorId,
    },
    select: phaseSelect,
  });
}

export async function deletePhase(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const phase = await prisma.phase.findFirst({
    where: { id, tenantId: scopedTenantId },
    select: { id: true },
  });
  if (!phase) {
    throw new Prisma.PrismaClientKnownRequestError('Phase not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  await prisma.phase.delete({ where: { id } });
  return { success: true as const };
}

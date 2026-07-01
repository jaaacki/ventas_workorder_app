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

const phaseProcedureSelect = {
  phaseId: true,
  procedureId: true,
  procedure: {
    select: {
      id: true,
      procedureName: true,
      procedureShort: true,
      procedureDesc: true,
    },
  },
} as const;

const phaseEquipmentSelect = {
  phaseId: true,
  phaseEquipId: true,
  phaseEquip: {
    select: {
      id: true,
      equipId: true,
      name: true,
      description: true,
    },
  },
} as const;

function notFound(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: 'P2025',
    clientVersion: 'unknown',
  });
}

async function assertTenantPhase(id: string, tenantId: string) {
  const phase = await prisma.phase.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!phase) throw notFound('Phase not found');
}

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
    throw notFound('Phase not found');
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
    throw notFound('Phase not found');
  }

  await prisma.phase.delete({ where: { id } });
  return { success: true as const };
}

export async function listPhaseProcedures(phaseId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  await assertTenantPhase(phaseId, scopedTenantId);

  return prisma.phaseProcedure.findMany({
    where: { phaseId },
    select: phaseProcedureSelect,
    orderBy: [{ procedure: { procedureName: 'asc' } }, { procedureId: 'asc' }],
  });
}

export async function addPhaseProcedure(phaseId: string, procedureId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  await assertTenantPhase(phaseId, scopedTenantId);
  const procedure = await prisma.procedure.findFirst({
    where: { id: procedureId, tenantId: scopedTenantId },
    select: { id: true },
  });
  if (!procedure) throw notFound('Procedure not found');

  return prisma.phaseProcedure.upsert({
    where: { phaseId_procedureId: { phaseId, procedureId } },
    create: { phaseId, procedureId },
    update: {},
    select: phaseProcedureSelect,
  });
}

export async function deletePhaseProcedure(phaseId: string, procedureId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  await assertTenantPhase(phaseId, scopedTenantId);
  const binding = await prisma.phaseProcedure.findUnique({
    where: { phaseId_procedureId: { phaseId, procedureId } },
    select: { phaseId: true },
  });
  if (!binding) throw notFound('Phase procedure binding not found');

  await prisma.phaseProcedure.delete({ where: { phaseId_procedureId: { phaseId, procedureId } } });
  return { success: true as const };
}

export async function listPhaseEquipmentBindings(phaseId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  await assertTenantPhase(phaseId, scopedTenantId);

  return prisma.phasePhaseEquip.findMany({
    where: { phaseId },
    select: phaseEquipmentSelect,
    orderBy: [{ phaseEquip: { name: 'asc' } }, { phaseEquipId: 'asc' }],
  });
}

export async function addPhaseEquipment(phaseId: string, phaseEquipId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  await assertTenantPhase(phaseId, scopedTenantId);
  const phaseEquip = await prisma.phaseEquip.findFirst({
    where: { id: phaseEquipId, tenantId: scopedTenantId },
    select: { id: true },
  });
  if (!phaseEquip) throw notFound('Phase equipment not found');

  return prisma.phasePhaseEquip.upsert({
    where: { phaseId_phaseEquipId: { phaseId, phaseEquipId } },
    create: { phaseId, phaseEquipId },
    update: {},
    select: phaseEquipmentSelect,
  });
}

export async function deletePhaseEquipment(phaseId: string, phaseEquipId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  await assertTenantPhase(phaseId, scopedTenantId);
  const binding = await prisma.phasePhaseEquip.findUnique({
    where: { phaseId_phaseEquipId: { phaseId, phaseEquipId } },
    select: { phaseId: true },
  });
  if (!binding) throw notFound('Phase equipment binding not found');

  await prisma.phasePhaseEquip.delete({ where: { phaseId_phaseEquipId: { phaseId, phaseEquipId } } });
  return { success: true as const };
}

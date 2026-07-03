import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';
import { writeAuditLog } from './auditLogService.js';

export interface UpdatePhaseInput {
  phaseName?: string | null;
  phaseShort?: string | null;
  description?: string | null;
  isGate?: boolean;
  blocksCombine?: boolean;
  bomId?: string | null;
}

const phaseSelect = {
  id: true,
  tenantId: true,
  workflowId: true,
  phaseName: true,
  phaseShort: true,
  description: true,
  sortOrder: true,
  isGate: true,
  blocksCombine: true,
  bomId: true,
  createdAt: true,
  updatedAt: true,
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

function referenced(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: 'P2003',
    clientVersion: 'unknown',
  });
}

async function assertTenantPhase(id: string, tenantId: string) {
  const phase = await prisma.phase.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!phase) throw notFound('Phase not found');
}

async function assertTenantBom(bomId: string, tenantId: string) {
  const bom = await prisma.bom.findFirst({ where: { id: bomId, tenantId }, select: { id: true } });
  if (!bom) throw referenced('Referenced BOM does not exist');
}

export async function updatePhase(id: string, input: UpdatePhaseInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  if (input.bomId != null) await assertTenantBom(input.bomId, scopedTenantId);
  const before = await prisma.phase.findFirst({ where: { id, tenantId: scopedTenantId }, select: phaseSelect });
  const updated = await prisma.phase.updateMany({
    where: { id, tenantId: scopedTenantId },
    data: {
      ...(input.phaseName !== undefined && { phaseName: input.phaseName }),
      ...(input.phaseShort !== undefined && { phaseShort: input.phaseShort }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isGate !== undefined && { isGate: input.isGate }),
      ...(input.blocksCombine !== undefined && { blocksCombine: input.blocksCombine }),
      ...(input.bomId !== undefined && { bomId: input.bomId }),
      updatedById: actorId,
    },
  });
  if (updated.count === 0) {
    throw notFound('Phase not found');
  }

  const after = await prisma.phase.findFirstOrThrow({
    where: { id, tenantId: scopedTenantId },
    select: phaseSelect,
  });
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Phase', entityId: id, action: 'update', before, after });
  return after;
}

export async function deletePhase(id: string, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const before = await prisma.phase.findFirst({ where: { id, tenantId: scopedTenantId }, select: phaseSelect });
  // workOrder.phaseId & nextPhaseId are ON DELETE SET NULL, so a plain delete
  // would strand live work orders (nulling their phase pointers).
  const live = await prisma.workOrder.count({ where: { tenantId: scopedTenantId, deleted: false, OR: [{ phaseId: id }, { nextPhaseId: id }] } });
  if (live > 0) throw referenced('Phase is referenced by a work order and cannot be deleted');
  // Owned steps survive: Step.phaseId is ON DELETE SET NULL, so they fall back
  // to the workflow's unplaced pool rather than being deleted with the phase.
  const deleted = await prisma.phase.deleteMany({ where: { id, tenantId: scopedTenantId } });
  if (deleted.count === 0) {
    throw notFound('Phase not found');
  }

  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Phase', entityId: id, action: 'delete', before });
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

export async function addPhaseEquipment(phaseId: string, phaseEquipId: string, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  await assertTenantPhase(phaseId, scopedTenantId);
  const phaseEquip = await prisma.phaseEquip.findFirst({
    where: { id: phaseEquipId, tenantId: scopedTenantId },
    select: { id: true },
  });
  if (!phaseEquip) throw notFound('Phase equipment not found');

  const binding = await prisma.phasePhaseEquip.upsert({
    where: { phaseId_phaseEquipId: { phaseId, phaseEquipId } },
    create: { phaseId, phaseEquipId },
    update: {},
    select: phaseEquipmentSelect,
  });
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Phase', entityId: phaseId, action: 'link', after: binding, metadata: { relation: 'equipment', phaseEquipId } });
  return binding;
}

export async function deletePhaseEquipment(phaseId: string, phaseEquipId: string, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  await assertTenantPhase(phaseId, scopedTenantId);
  const binding = await prisma.phasePhaseEquip.findUnique({
    where: { phaseId_phaseEquipId: { phaseId, phaseEquipId } },
    select: { phaseId: true },
  });
  if (!binding) throw notFound('Phase equipment binding not found');

  await prisma.phasePhaseEquip.delete({ where: { phaseId_phaseEquipId: { phaseId, phaseEquipId } } });
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Phase', entityId: phaseId, action: 'unlink', metadata: { relation: 'equipment', phaseEquipId } });
  return { success: true as const };
}

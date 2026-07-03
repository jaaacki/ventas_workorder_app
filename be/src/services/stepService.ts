import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';
import { writeAuditLog } from './auditLogService.js';

export interface CreateStepInput {
  code?: string | null;
  name?: string | null;
  description?: string | null;
  phaseId?: string | null;
}

export interface UpdateStepInput {
  code?: string | null;
  name?: string | null;
  description?: string | null;
}

export interface PlaceStepInput {
  phaseId: string;
  sortOrder?: number | null;
}

const stepSelect = {
  id: true,
  workflowId: true,
  phaseId: true,
  sortOrder: true,
  code: true,
  name: true,
  description: true,
} as const;

function notFound(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: 'P2025',
    clientVersion: 'unknown',
  });
}

/** Next append position within a phase (or the unplaced pool when phaseId is null). */
async function nextSortOrder(workflowId: string, phaseId: string | null) {
  const agg = await prisma.step.aggregate({
    where: { workflowId, phaseId },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -1) + 1;
}

async function loadTenantStep(id: string, tenantId: string) {
  const step = await prisma.step.findFirst({
    where: { id, tenantId },
    select: { id: true, workflowId: true, phaseId: true },
  });
  if (!step) throw notFound('Step not found');
  return step;
}

/** Create a new step for a workflow. Unplaced (pool) unless a phaseId is supplied. */
export async function createStep(workflowId: string, input: CreateStepInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, tenantId: scopedTenantId }, select: { id: true } });
  if (!workflow) throw notFound('Workflow not found');

  let phaseId: string | null = null;
  if (input.phaseId != null) {
    const phase = await prisma.phase.findFirst({ where: { id: input.phaseId, workflowId, tenantId: scopedTenantId }, select: { id: true } });
    if (!phase) throw notFound('Phase not found');
    phaseId = phase.id;
  }

  const sortOrder = await nextSortOrder(workflowId, phaseId);
  const created = await prisma.step.create({
    data: {
      tenantId: scopedTenantId,
      workflowId,
      phaseId,
      sortOrder,
      code: input.code ?? null,
      name: input.name ?? null,
      description: input.description ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
    select: stepSelect,
  });
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Step', entityId: created.id, action: 'create', after: created });
  return created;
}

export async function updateStep(id: string, input: UpdateStepInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const before = await prisma.step.findFirst({ where: { id, tenantId: scopedTenantId }, select: stepSelect });
  const updated = await prisma.step.updateMany({
    where: { id, tenantId: scopedTenantId },
    data: {
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      updatedById: actorId,
    },
  });
  if (updated.count === 0) throw notFound('Step not found');

  const after = await prisma.step.findFirstOrThrow({ where: { id, tenantId: scopedTenantId }, select: stepSelect });
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Step', entityId: id, action: 'update', before, after });
  return after;
}

export async function deleteStep(id: string, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const before = await prisma.step.findFirst({ where: { id, tenantId: scopedTenantId }, select: stepSelect });
  const deleted = await prisma.step.deleteMany({ where: { id, tenantId: scopedTenantId } });
  if (deleted.count === 0) throw notFound('Step not found');

  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Step', entityId: id, action: 'delete', before });
  return { success: true as const };
}

/**
 * Place a step into a phase of the same workflow. Appends to the end of the
 * target phase unless an explicit sortOrder is supplied.
 * ponytail: an explicit sortOrder may tie with a sibling; the reorder endpoint
 * normalises order, so we don't re-pack siblings here.
 */
export async function placeStep(id: string, input: PlaceStepInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const step = await loadTenantStep(id, scopedTenantId);
  const phase = await prisma.phase.findFirst({
    where: { id: input.phaseId, workflowId: step.workflowId, tenantId: scopedTenantId },
    select: { id: true },
  });
  if (!phase) throw notFound('Phase not found');

  const sortOrder = input.sortOrder ?? (await nextSortOrder(step.workflowId, phase.id));
  await prisma.step.update({
    where: { id },
    data: { phaseId: phase.id, sortOrder, updatedById: actorId },
  });
  const after = await prisma.step.findFirstOrThrow({ where: { id, tenantId: scopedTenantId }, select: stepSelect });
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Step', entityId: id, action: 'update', after, metadata: { placedInPhase: phase.id } });
  return after;
}

/** Move a step back to the workflow's unplaced pool (phaseId = null). */
export async function unplaceStep(id: string, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const step = await loadTenantStep(id, scopedTenantId);
  const sortOrder = await nextSortOrder(step.workflowId, null);
  await prisma.step.update({
    where: { id },
    data: { phaseId: null, sortOrder, updatedById: actorId },
  });
  const after = await prisma.step.findFirstOrThrow({ where: { id, tenantId: scopedTenantId }, select: stepSelect });
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Step', entityId: id, action: 'update', after, metadata: { unplaced: true } });
  return after;
}

/** Set each step's sortOrder to its index in the supplied ordering. */
export async function reorderPhaseSteps(phaseId: string, stepIds: string[], actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const phase = await prisma.phase.findFirst({ where: { id: phaseId, tenantId: scopedTenantId }, select: { id: true } });
  if (!phase) throw notFound('Phase not found');

  await prisma.$transaction(
    stepIds.map((stepId, index) =>
      prisma.step.updateMany({
        where: { id: stepId, phaseId, tenantId: scopedTenantId },
        data: { sortOrder: index, updatedById: actorId },
      }),
    ),
  );
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Phase', entityId: phaseId, action: 'update', metadata: { reorderedSteps: stepIds } });
  return { success: true as const };
}

import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';
import { writeAuditLog } from './auditLogService.js';

export interface CreateWorkflowInput {
  name: string;
  code: string;
  description?: string | null;
}

export interface UpdateWorkflowInput {
  name?: string;
  code?: string;
  description?: string | null;
  active?: boolean;
}

export interface AddPhaseInput {
  phaseShort?: string | null;
  phaseName?: string | null;
  description?: string | null;
  isGate?: boolean;
  blocksCombine?: boolean;
  bomId?: string | null;
}

export interface ListWorkflowsOptions {
  activeOnly?: boolean;
}

const stepSummarySelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  sortOrder: true,
  phaseId: true,
} as const;

const phaseSummarySelect = {
  id: true,
  phaseShort: true,
  phaseName: true,
  description: true,
  sortOrder: true,
  isGate: true,
  blocksCombine: true,
  bomId: true,
} as const;

function notFound(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, { code: 'P2025', clientVersion: 'unknown' });
}

/**
 * Detail shape for one workflow: owned phases (ordered) each carrying their
 * ordered steps, plus the workflow's unplaced step pool (phaseId null).
 */
async function workflowDetail(id: string, tenantId: string) {
  const workflow = await prisma.workflow.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      active: true,
      phases: {
        orderBy: { sortOrder: 'asc' },
        select: {
          ...phaseSummarySelect,
          steps: { orderBy: { sortOrder: 'asc' }, select: stepSummarySelect },
        },
      },
      steps: {
        where: { phaseId: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true, name: true, description: true, sortOrder: true },
      },
    },
  });
  if (!workflow) return null;
  const { steps, ...rest } = workflow;
  return { ...rest, unplacedSteps: steps };
}

export async function listWorkflows(options: ListWorkflowsOptions = {}, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workflows = await prisma.workflow.findMany({
    where: { tenantId: scopedTenantId, ...(options.activeOnly ? { active: true } : {}) },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      active: true,
      _count: { select: { phases: true, steps: true } },
    },
  });
  return workflows.map(({ _count, ...workflow }) => ({
    ...workflow,
    phaseCount: _count.phases,
    stepCount: _count.steps,
  }));
}

export async function getWorkflow(id: string, tenantId?: string | null) {
  return workflowDetail(id, tenantIdOrDefault(tenantId));
}

export async function createWorkflow(input: CreateWorkflowInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const created = await prisma.workflow.create({
    data: {
      tenantId: scopedTenantId,
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
    select: { id: true },
  });
  const detail = await workflowDetail(created.id, scopedTenantId);
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Workflow', entityId: created.id, action: 'create', after: detail });
  return detail!;
}

export async function updateWorkflow(id: string, input: UpdateWorkflowInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const before = await workflowDetail(id, scopedTenantId);
  const updated = await prisma.workflow.updateMany({
    where: { id, tenantId: scopedTenantId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.code !== undefined && { code: input.code }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.active !== undefined && { active: input.active }),
      updatedById: actorId,
    },
  });
  if (updated.count === 0) throw notFound('Workflow not found');

  const after = await workflowDetail(id, scopedTenantId);
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Workflow', entityId: id, action: 'update', before, after });
  return after!;
}

export async function deleteWorkflow(id: string, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const before = await workflowDetail(id, scopedTenantId);
  const deleted = await prisma.workflow.deleteMany({ where: { id, tenantId: scopedTenantId } });
  if (deleted.count === 0) throw notFound('Workflow not found');

  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Workflow', entityId: id, action: 'delete', before });
  return { success: true as const };
}

/** Append a new phase to a workflow (sortOrder = current max + 1). */
export async function addPhase(workflowId: string, input: AddPhaseInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, tenantId: scopedTenantId }, select: { id: true } });
  if (!workflow) throw notFound('Workflow not found');

  const agg = await prisma.phase.aggregate({ where: { workflowId }, _max: { sortOrder: true } });
  const sortOrder = (agg._max.sortOrder ?? -1) + 1;

  const created = await prisma.phase.create({
    data: {
      tenantId: scopedTenantId,
      workflowId,
      sortOrder,
      phaseShort: input.phaseShort ?? null,
      phaseName: input.phaseName ?? null,
      description: input.description ?? null,
      isGate: input.isGate ?? false,
      blocksCombine: input.blocksCombine ?? false,
      bomId: input.bomId ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
    select: phaseSummarySelect,
  });
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Phase', entityId: created.id, action: 'create', after: created });
  return created;
}

/** Set each phase's sortOrder to its index in the supplied ordering. */
export async function reorderPhases(workflowId: string, phaseIds: string[], actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, tenantId: scopedTenantId }, select: { id: true } });
  if (!workflow) throw notFound('Workflow not found');

  await prisma.$transaction(
    phaseIds.map((phaseId, index) =>
      prisma.phase.updateMany({
        where: { id: phaseId, workflowId, tenantId: scopedTenantId },
        data: { sortOrder: index, updatedById: actorId },
      }),
    ),
  );
  await writeAuditLog({ tenantId: scopedTenantId, actorId, entityType: 'Workflow', entityId: workflowId, action: 'update', metadata: { reorderedPhases: phaseIds } });
  return { success: true as const };
}

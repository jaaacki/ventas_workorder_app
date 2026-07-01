import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

export interface WorkflowPhaseInput {
  phaseId: string;
  sortOrder: number;
}

export interface CreateWorkflowInput {
  name: string;
  code: string;
  description?: string | null;
  phases?: WorkflowPhaseInput[];
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string | null;
  active?: boolean;
  /** When provided, the workflow's phase bindings are replaced wholesale. */
  phases?: WorkflowPhaseInput[];
}

export interface ListWorkflowsOptions {
  activeOnly?: boolean;
}

/**
 * Shared include for the detail view: ordered phase bindings, each carrying the
 * phase summary a work-order execution UI needs (id, label, order).
 */
const workflowDetailInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  phases: {
    include: {
      phase: { select: { id: true, phaseName: true, phaseShort: true, phaseOrder: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.WorkflowInclude;

function phaseCreateMany(phases: WorkflowPhaseInput[]) {
  return phases.map(({ phaseId, sortOrder }) => ({ phaseId, sortOrder }));
}

export async function listWorkflows(options: ListWorkflowsOptions = {}, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  return prisma.workflow.findMany({
    where: { tenantId: scopedTenantId, ...(options.activeOnly ? { active: true } : {}) },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { phases: true, workOrders: true } },
    },
  });
}

export async function getWorkflow(id: string, tenantId?: string | null) {
  return prisma.workflow.findFirst({
    where: { id, tenantId: tenantIdOrDefault(tenantId) },
    include: workflowDetailInclude,
  });
}

export async function getWorkflowByCode(code: string, tenantId?: string | null) {
  return prisma.workflow.findFirst({
    where: { code, tenantId: tenantIdOrDefault(tenantId) },
    include: workflowDetailInclude,
  });
}

export async function createWorkflow(input: CreateWorkflowInput, actorId: string, tenantId?: string | null) {
  const phases = input.phases ?? [];
  return prisma.workflow.create({
    data: {
      tenantId: tenantIdOrDefault(tenantId),
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      createdById: actorId,
      updatedById: actorId,
      ...(phases.length > 0 && {
        phases: { create: phaseCreateMany(phases) },
      }),
    },
    include: workflowDetailInclude,
  });
}

export async function updateWorkflow(id: string, input: UpdateWorkflowInput, actorId: string, tenantId?: string | null) {
  const replacePhases = input.phases;
  const scopedTenantId = tenantIdOrDefault(tenantId);
  return prisma.$transaction(async (tx) => {
    const workflow = await tx.workflow.findFirst({
      where: { id, tenantId: scopedTenantId },
      select: { id: true },
    });
    if (!workflow) {
      throw new Prisma.PrismaClientKnownRequestError('Workflow not found', {
        code: 'P2025',
        clientVersion: 'unknown',
      });
    }
    // Replace phase bindings atomically when a new set is supplied.
    if (replacePhases !== undefined) {
      await tx.workflowPhase.deleteMany({ where: { workflowId: id } });
    }
    return tx.workflow.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.active !== undefined && { active: input.active }),
        updatedById: actorId,
        ...(replacePhases !== undefined &&
          replacePhases.length > 0 && {
            phases: { create: phaseCreateMany(replacePhases) },
          }),
      },
      include: workflowDetailInclude,
    });
  });
}

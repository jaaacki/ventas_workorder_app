import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

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
      phase: { select: { id: true, name: true, phaseShort: true, phaseOrder: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.WorkflowInclude;

function phaseCreateMany(phases: WorkflowPhaseInput[]) {
  return phases.map(({ phaseId, sortOrder }) => ({ phaseId, sortOrder }));
}

export async function listWorkflows(options: ListWorkflowsOptions = {}) {
  return prisma.workflow.findMany({
    where: options.activeOnly ? { active: true } : undefined,
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { phases: true, workOrders: true } },
    },
  });
}

export async function getWorkflow(id: string) {
  return prisma.workflow.findUnique({
    where: { id },
    include: workflowDetailInclude,
  });
}

export async function getWorkflowByCode(code: string) {
  return prisma.workflow.findUnique({
    where: { code },
    include: workflowDetailInclude,
  });
}

export async function createWorkflow(input: CreateWorkflowInput, actorId: string) {
  const phases = input.phases ?? [];
  return prisma.workflow.create({
    data: {
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

export async function updateWorkflow(id: string, input: UpdateWorkflowInput, actorId: string) {
  const replacePhases = input.phases;
  return prisma.$transaction(async (tx) => {
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

import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export interface CreateWorkOrderInput {
  workflowId: string;
  hetId?: string;
}

/**
 * Shared include for the detail view: workflow summary + the work-order's
 * current phase summary (id, label, order).
 */
const workOrderDetailInclude = {
  workflow: { select: { id: true, name: true, code: true } },
  phase: { select: { id: true, phaseName: true, phaseShort: true, phaseOrder: true } },
} satisfies Prisma.WorkOrderInclude;

/**
 * Include used when loading a work order with its workflow's ordered phase
 * bindings, so the lifecycle (create/advance) can read the phase ordering.
 */
const workOrderWithWorkflowPhasesInclude = {
  workflow: {
    include: {
      phases: {
        include: {
          phase: { select: { id: true, phaseName: true, phaseShort: true, phaseOrder: true } },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
} satisfies Prisma.WorkOrderInclude;

export async function createWorkOrder(input: CreateWorkOrderInput, actorId: string) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: input.workflowId },
    include: {
      phases: {
        include: {
          phase: { select: { id: true, phaseName: true, phaseShort: true, phaseOrder: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  // A missing workflow lets Prisma throw P2025 only on the workOrder create
  // below (workflowId is a foreign key). Guard it explicitly here so the route
  // never attempts to read `phases` off null.
  if (!workflow) {
    throw new Prisma.PrismaClientKnownRequestError('Workflow not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  if (workflow.phases.length === 0) {
    throw new Error('workflow has no phases configured');
  }

  const firstPhase = workflow.phases[0];
  const woNumber = `WO-${Date.now().toString(36).toUpperCase()}`;

  // WorkOrder.id has no @default; reuse woNumber as the id so the work order is
  // addressable by the same human-readable identifier used in the UI.
  return prisma.workOrder.create({
    data: {
      id: woNumber,
      woNumber,
      workflowId: input.workflowId,
      hetId: input.hetId,
      phaseId: firstPhase.phaseId,
      phaseOrder: firstPhase.sortOrder,
      createdById: actorId,
      updatedById: actorId,
    },
    include: workOrderDetailInclude,
  });
}

export async function listWorkOrders() {
  return prisma.workOrder.findMany({
    include: { workflow: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getWorkOrder(id: string) {
  return prisma.workOrder.findUnique({
    where: { id },
    include: workOrderDetailInclude,
  });
}

export async function advanceWorkOrder(id: string, actorId: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: workOrderWithWorkflowPhasesInclude,
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  const orderedPhases = workOrder.workflow?.phases ?? [];
  const currentIndex = orderedPhases.findIndex((p) => p.phaseId === workOrder.phaseId);

  if (currentIndex === -1 || currentIndex === orderedPhases.length - 1) {
    throw new Error('work order is at its final phase');
  }

  const nextPhase = orderedPhases[currentIndex + 1];

  await prisma.workOrder.update({
    where: { id },
    data: {
      phaseId: nextPhase.phaseId,
      phaseOrder: nextPhase.sortOrder,
      updatedById: actorId,
    },
  });

  return prisma.workOrder.findUnique({
    where: { id },
    include: workOrderDetailInclude,
  });
}

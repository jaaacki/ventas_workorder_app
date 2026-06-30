import { Prisma } from '@prisma/client';
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
  het: { select: { id: true, hetNumber: true, clinicName: true, quantity: true } },
  manufacturer: { select: { id: true, manuNumber: true, manuName: true } },
  sterilises: {
    select: { id: true, direction: true, result: true, betReading: true, quantity: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
  woSerials: {
    select: {
      id: true,
      serialNumber: true,
      bomRef: { select: { id: true, description: true, quantity: true, uom: true, hasSerial: true } },
    },
  },
  phaseEquips: {
    select: { phaseEquip: { select: { id: true, equipId: true, name: true } } },
  },
} satisfies Prisma.WorkOrderInclude;

const workOrderOperationalInclude = {
  ...workOrderDetailInclude,
  workflow: {
    select: {
      id: true,
      name: true,
      code: true,
      phases: {
        select: {
          sortOrder: true,
          phase: { select: { id: true, phaseName: true, phaseShort: true, phaseOrder: true } },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
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

type OperationalWorkOrder = Prisma.WorkOrderGetPayload<{ include: typeof workOrderOperationalInclude }>;

function isGatePhase(phaseName?: string | null) {
  return Boolean(phaseName && /steril|bet/i.test(phaseName));
}

function decorateOperationalWorkOrder(workOrder: OperationalWorkOrder) {
  const phases = workOrder.workflow?.phases ?? [];
  const currentIndex = phases.findIndex((p) => p.phase.id === workOrder.phaseId);
  const atFinalPhase = currentIndex >= 0 && currentIndex === phases.length - 1;
  const sterilises = workOrder.sterilises ?? [];
  const woSerials = workOrder.woSerials ?? [];
  const phaseEquips = workOrder.phaseEquips ?? [];
  const hasPassingSterilisation = sterilises.some((s) => s.result === true);
  const blockers: string[] = [];

  if (!workOrder.hetId) blockers.push('HET not assigned');
  if (!workOrder.prodStart) blockers.push('Phase not started');
  if (!workOrder.prodEnd) blockers.push('Phase not finished');
  if (isGatePhase(workOrder.phase?.phaseName) && !hasPassingSterilisation) {
    blockers.push('Sterilisation/BET pass required');
  }

  const phaseTimeline = phases.map((p, index) => ({
    id: p.phase.id,
    phaseName: p.phase.phaseName,
    phaseShort: p.phase.phaseShort,
    phaseOrder: p.phase.phaseOrder,
    sortOrder: p.sortOrder,
    state:
      currentIndex === -1
        ? 'pending'
        : index < currentIndex
          ? 'complete'
          : index === currentIndex
            ? 'current'
            : 'pending',
  }));

  return {
    ...workOrder,
    operationalStatus: atFinalPhase ? 'Release' : blockers.length ? 'Blocked' : 'Ready',
    readinessBlockers: blockers,
    currentPhaseLabel: workOrder.phase?.phaseName ?? workOrder.phaseShort ?? `Phase ${workOrder.phaseOrder ?? '-'}`,
    phaseTimeline,
    counts: {
      serials: woSerials.length,
      equipment: phaseEquips.length,
      sterilisationRecords: sterilises.length,
    },
  };
}

export async function listWorkOrders() {
  const workOrders = await prisma.workOrder.findMany({
    include: workOrderOperationalInclude,
    orderBy: { createdAt: 'desc' },
  });
  return workOrders.map(decorateOperationalWorkOrder);
}

export async function getWorkOrder(id: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: workOrderOperationalInclude,
  });
  return workOrder ? decorateOperationalWorkOrder(workOrder) : null;
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

  // Sterilisation / BET gate: leaving a sterilisation-gate phase requires a
  // passing sterilisation result recorded against the work order.
  const currentPhaseName = orderedPhases[currentIndex].phase?.phaseName;
  if (currentPhaseName && /steril|bet/i.test(currentPhaseName)) {
    const passing = await prisma.sterilise.findFirst({
      where: { workOrderId: id, result: true },
    });
    if (!passing) {
      throw new Error(
        'sterilisation/BET gate not satisfied: record a passing sterilisation result',
      );
    }
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

  return prisma.workOrder.findUniqueOrThrow({
    where: { id },
    include: workOrderDetailInclude,
  });
}

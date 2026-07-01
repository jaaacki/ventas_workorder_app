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
  phase: {
    select: {
      id: true,
      phaseName: true,
      phaseShort: true,
      phaseOrder: true,
      bom: { select: { lines: { where: { deleted: false }, select: { id: true } } } },
    },
  },
  nextPhase: { select: { id: true, phaseName: true, phaseShort: true, phaseOrder: true } },
  het: { select: { id: true, hetNumber: true, clinicName: true, quantity: true } },
  manufacturer: { select: { id: true, manuNumber: true, manuName: true } },
  steralisationCurrent: { select: { id: true, result: true, createdAt: true } },
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
  batchHets: { select: { hetId: true } },
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
  const created = await prisma.workOrder.create({
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
  });
  return getDecoratedWorkOrderOrThrow(created.id);
}

type OperationalWorkOrder = Prisma.WorkOrderGetPayload<{ include: typeof workOrderOperationalInclude }>;
type LegacyStateBucket =
  | '1. In Progress'
  | '2. Next Phase'
  | '3. In Quarantine'
  | '4. Finished Goods'
  | '5. WO Completed';

interface LegacyWorkOrderContext {
  phaseOrderCurrent: Map<string, number | null>;
}

function isGatePhase(phaseName?: string | null) {
  return Boolean(phaseName && /steril|bet/i.test(phaseName));
}

function getLifecycleState(workOrder: OperationalWorkOrder, atFinalPhase: boolean) {
  if (!workOrder.prodStart) return 'NotStarted';
  if (!workOrder.prodEnd) return 'InProgress';
  if (atFinalPhase) return 'ReleasePending';
  return 'ReadyToAdvance';
}

function legacyHetKeys(workOrder: Pick<OperationalWorkOrder, 'hetId' | 'batchHets'>) {
  return Array.from(
    new Set([
      ...(workOrder.hetId ? [workOrder.hetId] : []),
      ...((workOrder.batchHets ?? []).map((batchHet) => batchHet.hetId).filter(Boolean) as string[]),
    ]),
  );
}

function buildLegacyWorkOrderContext(workOrders: OperationalWorkOrder[]): LegacyWorkOrderContext {
  const workOrdersByHet = new Map<string, OperationalWorkOrder[]>();

  for (const workOrder of workOrders) {
    for (const hetId of legacyHetKeys(workOrder)) {
      const group = workOrdersByHet.get(hetId) ?? [];
      group.push(workOrder);
      workOrdersByHet.set(hetId, group);
    }
  }

  const phaseOrderCurrent = new Map<string, number | null>();

  for (const workOrder of workOrders) {
    const peerIds = new Set<string>();
    const peers: OperationalWorkOrder[] = [];

    for (const hetId of legacyHetKeys(workOrder)) {
      for (const peer of workOrdersByHet.get(hetId) ?? []) {
        if (!peerIds.has(peer.id)) {
          peerIds.add(peer.id);
          peers.push(peer);
        }
      }
    }

    const maxPhaseOrder = peers.reduce<number | null>((max, peer) => {
      if (peer.phaseOrder == null) return max;
      return max == null ? peer.phaseOrder : Math.max(max, peer.phaseOrder);
    }, null);

    phaseOrderCurrent.set(workOrder.id, maxPhaseOrder);
  }

  return { phaseOrderCurrent };
}

function legacyBucketLabel(bucket: LegacyStateBucket, suffix?: string | null) {
  return suffix ? `${bucket}: ${suffix}` : bucket;
}

function getLegacyWorkOrderState(workOrder: OperationalWorkOrder, context: LegacyWorkOrderContext) {
  const phaseOrder = workOrder.phaseOrder ?? null;
  const phaseOrderCurrent = context.phaseOrderCurrent.get(workOrder.id) ?? phaseOrder;
  const phaseShort = workOrder.nextPhase?.phaseShort ?? workOrder.phase?.phaseShort ?? workOrder.phaseShort;
  const currentPhaseShort = workOrder.phase?.phaseShort ?? workOrder.phaseShort;
  const currentSterilisation = workOrder.steralisationCurrent ?? null;
  const serialRequiredCount = workOrder.phase?.bom?.lines?.length ?? 0;
  const serialCheckDone = serialRequiredCount - (workOrder.woSerials?.length ?? 0) === 0;
  const combinedHetCheck = (workOrder.batchHets?.length ?? 0) > 0;
  const hasImageParityGap = true;
  let legacyStateBucket: LegacyStateBucket;
  let legacyProductionState: string;

  if (phaseOrderCurrent !== phaseOrder) {
    legacyStateBucket = '5. WO Completed';
    legacyProductionState = legacyStateBucket;
  } else if (workOrder.prodStart && workOrder.prodEnd) {
    if (phaseOrder != null && phaseOrder < 16) {
      legacyStateBucket = '2. Next Phase';
      legacyProductionState = legacyBucketLabel(legacyStateBucket, phaseShort);
    } else {
      legacyStateBucket = '4. Finished Goods';
      legacyProductionState = legacyStateBucket;
    }
  } else if (!currentSterilisation || currentSterilisation.result == null) {
    legacyStateBucket = '1. In Progress';
    legacyProductionState = legacyBucketLabel(legacyStateBucket, currentPhaseShort);
  } else {
    legacyStateBucket = '3. In Quarantine';
    legacyProductionState = `${legacyStateBucket} (${currentSterilisation.createdAt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).replace(/\//g, '-')})`;
  }

  const advanceRequirements = [
    { key: 'current_phase', label: 'Current HET/batch phase', met: phaseOrderCurrent === phaseOrder },
    { key: 'prod_start', label: 'Production started', met: Boolean(workOrder.prodStart) },
    { key: 'prod_end', label: 'Production finished', met: Boolean(workOrder.prodEnd) },
    { key: 'image', label: 'Work-order image captured', met: false, parityGap: hasImageParityGap },
    { key: 'serial_check', label: 'Serial/BOM entries complete', met: serialCheckDone },
  ];

  if (phaseOrder != null && phaseOrder <= 5) {
    advanceRequirements.push({ key: 'not_combined_het', label: 'Not a combined-HET phase <= 5', met: !combinedHetCheck });
  }

  const canAdvanceLegacy =
    phaseOrder != null &&
    phaseOrder < 16 &&
    advanceRequirements.every((requirement) => requirement.met);

  return {
    phaseOrderCurrent,
    legacyProductionState,
    legacyStateBucket,
    canAdvanceLegacy,
    advanceRequirements,
    missingAdvanceRequirements: advanceRequirements
      .filter((requirement) => !requirement.met)
      .map((requirement) => requirement.label),
    parityGaps: hasImageParityGap ? ['workOrder.image is not present in the imported schema; AppSheet image gating cannot be satisfied yet'] : [],
    serialCheckDone,
    serialRequiredCount,
    combinedHetCheck,
  };
}

function decorateOperationalWorkOrder(workOrder: OperationalWorkOrder, context: LegacyWorkOrderContext) {
  const phases = workOrder.workflow?.phases ?? [];
  const currentIndex = phases.findIndex((p) => p.phase.id === workOrder.phaseId);
  const atFinalPhase = currentIndex >= 0 && currentIndex === phases.length - 1;
  const sterilises = workOrder.sterilises ?? [];
  const woSerials = workOrder.woSerials ?? [];
  const phaseEquips = workOrder.phaseEquips ?? [];
  const hasPassingSterilisation = sterilises.some((s) => s.result === true);
  const blockers: string[] = [];
  const legacyState = getLegacyWorkOrderState(workOrder, context);

  if (!workOrder.hetId) blockers.push('HET not assigned');
  if (isGatePhase(workOrder.phase?.phaseName) && !hasPassingSterilisation) {
    blockers.push('Sterilisation/BET pass required');
  }
  if (atFinalPhase && !workOrder.prodEnd) blockers.push('Release phase not finished');

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
    lifecycleState: getLifecycleState(workOrder, atFinalPhase),
    operationalStatus: blockers.length ? 'Blocked' : atFinalPhase ? 'ReleasePending' : getLifecycleState(workOrder, atFinalPhase),
    readinessBlockers: blockers,
    currentPhaseLabel: workOrder.phase?.phaseName ?? workOrder.phaseShort ?? `Phase ${workOrder.phaseOrder ?? '-'}`,
    ...legacyState,
    phaseTimeline,
    counts: {
      serials: woSerials.length,
      equipment: phaseEquips.length,
      sterilisationRecords: sterilises.length,
    },
  };
}

async function getDecoratedWorkOrderOrThrow(id: string) {
  const workOrder = await prisma.workOrder.findUniqueOrThrow({
    where: { id },
    include: workOrderOperationalInclude,
  });
  const context = await getLegacyContextForWorkOrder(workOrder);
  return decorateOperationalWorkOrder(workOrder, context);
}

export async function listWorkOrders() {
  const workOrders = await prisma.workOrder.findMany({
    where: { deleted: false },
    include: workOrderOperationalInclude,
    orderBy: { createdAt: 'desc' },
  });
  const context = buildLegacyWorkOrderContext(workOrders);
  return workOrders.map((workOrder) => decorateOperationalWorkOrder(workOrder, context));
}

export async function getWorkOrder(id: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: workOrderOperationalInclude,
  });
  if (!workOrder) return null;
  const context = await getLegacyContextForWorkOrder(workOrder);
  return decorateOperationalWorkOrder(workOrder, context);
}

async function getLegacyContextForWorkOrder(workOrder: OperationalWorkOrder) {
  const hetIds = legacyHetKeys(workOrder);
  if (!hetIds.length) return buildLegacyWorkOrderContext([workOrder]);

  const peers = await prisma.workOrder.findMany({
    where: {
      deleted: false,
      OR: [
        { hetId: { in: hetIds } },
        { batchHets: { some: { hetId: { in: hetIds } } } },
      ],
    },
    include: workOrderOperationalInclude,
  });

  if (!peers.some((peer) => peer.id === workOrder.id)) peers.push(workOrder);
  return buildLegacyWorkOrderContext(peers);
}

export async function startWorkOrderPhase(id: string, actorId: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    select: { id: true, hetId: true, prodStart: true },
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  if (!workOrder.hetId) {
    throw new Error('cannot start: HET not assigned');
  }

  if (!workOrder.prodStart) {
    await prisma.workOrder.update({
      where: { id },
      data: {
        prodStart: new Date(),
        startSignById: actorId,
        updatedById: actorId,
      },
    });
  }

  return getDecoratedWorkOrderOrThrow(id);
}

export async function finishWorkOrderPhase(id: string, actorId: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    select: { id: true, prodStart: true, prodEnd: true },
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  if (!workOrder.prodStart) {
    throw new Error('cannot finish: phase not started');
  }

  if (!workOrder.prodEnd) {
    await prisma.workOrder.update({
      where: { id },
      data: {
        prodEnd: new Date(),
        endSignById: actorId,
        updatedById: actorId,
      },
    });
  }

  return getDecoratedWorkOrderOrThrow(id);
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

  if (!workOrder.hetId) {
    throw new Error('cannot advance: HET not assigned');
  }

  if (!workOrder.prodStart) {
    throw new Error('cannot advance: phase not started');
  }

  if (!workOrder.prodEnd) {
    throw new Error('cannot advance: phase not finished');
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

  return getDecoratedWorkOrderOrThrow(id);
}

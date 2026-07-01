import { Prisma, type WorkOrder } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

export interface CreateWorkOrderInput {
  workflowId: string;
  hetId?: string;
}

type WorkOrderAuditAction =
  | 'work_order.created'
  | 'work_order.serial_recorded'
  | 'work_order.phase_started'
  | 'work_order.phase_finished'
  | 'work_order.phase_advanced';

interface WorkOrderAuditState extends Prisma.InputJsonObject {
  id: string;
  tenantId: string;
  workflowId: string | null;
  phaseId: string | null;
  phaseOrder: number | null;
  hetId: string | null;
  prodStart: string | null;
  prodEnd: string | null;
  prodDurationMinutes: string | null;
  serialCount?: number | null;
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
      bom: { select: { lines: { where: { deleted: false }, select: { id: true, description: true, quantity: true, uom: true, hasSerial: true } } } },
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

const workOrderAuditSelect = {
  id: true,
  tenantId: true,
  workOrderId: true,
  action: true,
  actorId: true,
  source: true,
  previousState: true,
  newState: true,
  createdAt: true,
} satisfies Prisma.WorkOrderAuditEventSelect;

function auditState(
  workOrder: Pick<
    WorkOrder,
    'id' | 'tenantId' | 'workflowId' | 'phaseId' | 'phaseOrder' | 'hetId' | 'prodStart' | 'prodEnd' | 'prodDuration'
  > & { woSerials?: unknown[] },
): WorkOrderAuditState {
  return {
    id: workOrder.id,
    tenantId: workOrder.tenantId,
    workflowId: workOrder.workflowId,
    phaseId: workOrder.phaseId,
    phaseOrder: workOrder.phaseOrder,
    hetId: workOrder.hetId,
    prodStart: workOrder.prodStart?.toISOString() ?? null,
    prodEnd: workOrder.prodEnd?.toISOString() ?? null,
    prodDurationMinutes: workOrder.prodDuration?.toString() ?? null,
    ...(workOrder.woSerials ? { serialCount: workOrder.woSerials.length } : {}),
  };
}

function elapsedMinutes(start: Date, end: Date) {
  const elapsedMs = Math.max(0, end.getTime() - start.getTime());
  return new Prisma.Decimal((elapsedMs / 60000).toFixed(4));
}

async function recordWorkOrderAuditEvent(input: {
  tenantId: string;
  workOrderId: string;
  action: WorkOrderAuditAction;
  actorId: string;
  source: string;
  previousState?: WorkOrderAuditState | null;
  newState: WorkOrderAuditState;
}) {
  await prisma.workOrderAuditEvent.create({
    data: {
      tenantId: input.tenantId,
      workOrderId: input.workOrderId,
      action: input.action,
      actorId: input.actorId,
      source: input.source,
      ...(input.previousState ? { previousState: input.previousState } : {}),
      newState: input.newState,
    },
  });
}

export async function createWorkOrder(input: CreateWorkOrderInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workflow = await prisma.workflow.findFirst({
    where: { id: input.workflowId, tenantId: scopedTenantId },
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
      tenantId: scopedTenantId,
      woNumber,
      workflowId: input.workflowId,
      hetId: input.hetId,
      phaseId: firstPhase.phaseId,
      phaseOrder: firstPhase.sortOrder,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: created.id,
    action: 'work_order.created',
    actorId,
    source: 'workOrderService.createWorkOrder',
    previousState: null,
    newState: auditState(created),
  });
  return getDecoratedWorkOrderOrThrow(created.id, scopedTenantId);
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
  const serialRequiredLines = workOrder.phase?.bom?.lines?.filter((line) => line.hasSerial) ?? [];
  const serialRequiredCount = serialRequiredLines.length;
  const capturedSerialBomRefIds = new Set(
    (workOrder.woSerials ?? []).map((serial) => serial.bomRef?.id).filter(Boolean),
  );
  const serialCheckDone = serialRequiredLines.every((line) => capturedSerialBomRefIds.has(line.id));
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
    requiredSerials: serialRequiredLines.map((line) => {
      const captured = workOrder.woSerials?.find((serial) => serial.bomRef?.id === line.id);
      return {
        bomRefId: line.id,
        description: line.description,
        quantity: line.quantity,
        uom: line.uom,
        serialNumber: captured?.serialNumber ?? null,
      };
    }),
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

async function getDecoratedWorkOrderOrThrow(id: string, tenantId?: string | null) {
  const workOrder = await prisma.workOrder.findFirstOrThrow({
    where: { id, tenantId: tenantIdOrDefault(tenantId) },
    include: workOrderOperationalInclude,
  });
  const context = await getLegacyContextForWorkOrder(workOrder, tenantIdOrDefault(tenantId));
  return decorateOperationalWorkOrder(workOrder, context);
}

export async function listWorkOrders(tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrders = await prisma.workOrder.findMany({
    where: { deleted: false, tenantId: scopedTenantId },
    include: workOrderOperationalInclude,
    orderBy: { createdAt: 'desc' },
  });
  const context = buildLegacyWorkOrderContext(workOrders);
  return workOrders.map((workOrder) => decorateOperationalWorkOrder(workOrder, context));
}

export async function getWorkOrder(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, tenantId: scopedTenantId },
    include: workOrderOperationalInclude,
  });
  if (!workOrder) return null;
  const context = await getLegacyContextForWorkOrder(workOrder, scopedTenantId);
  return decorateOperationalWorkOrder(workOrder, context);
}

export async function listWorkOrderAuditEvents(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, tenantId: scopedTenantId, deleted: false },
    select: { id: true },
  });
  if (!workOrder) return null;

  const events = await prisma.workOrderAuditEvent.findMany({
    where: { workOrderId: id, tenantId: scopedTenantId },
    select: workOrderAuditSelect,
    orderBy: { createdAt: 'asc' },
  });
  return events.map((event) => ({
    ...event,
    previousState: event.previousState as WorkOrderAuditState | null,
    newState: event.newState as WorkOrderAuditState | null,
  }));
}

export async function recordWorkOrderSerial(
  id: string,
  input: { bomRefId: string; serialNumber: string },
  actorId: string,
  tenantId?: string | null,
) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, tenantId: scopedTenantId },
    select: {
      id: true,
      tenantId: true,
      workflowId: true,
      phaseId: true,
      phaseOrder: true,
      hetId: true,
      prodStart: true,
      prodEnd: true,
      prodDuration: true,
      phase: {
        select: {
          bom: {
            select: {
              lines: {
                where: { deleted: false },
                select: { id: true, hasSerial: true },
              },
            },
          },
        },
      },
      woSerials: { select: { id: true } },
    },
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  const requiredBomLine = workOrder.phase?.bom?.lines.find((line) => line.id === input.bomRefId && line.hasSerial);
  if (!requiredBomLine) {
    throw new Error('cannot record serial: BOM line is not serial-required for the current phase');
  }

  const serialId = `${id}:${input.bomRefId}`;
  const existingSerial = workOrder.woSerials.some((serial) => serial.id === serialId);
  await prisma.woSerial.upsert({
    where: { id: serialId },
    create: {
      id: serialId,
      tenantId: scopedTenantId,
      workOrderId: id,
      bomRefId: input.bomRefId,
      serialNumber: input.serialNumber,
      keyText: serialId,
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      serialNumber: input.serialNumber,
      updatedById: actorId,
    },
  });

  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: id,
    action: 'work_order.serial_recorded',
    actorId,
    source: 'workOrderService.recordWorkOrderSerial',
    previousState: auditState(workOrder),
    newState: { ...auditState(workOrder), serialCount: workOrder.woSerials.length + (existingSerial ? 0 : 1) },
  });

  return getDecoratedWorkOrderOrThrow(id, scopedTenantId);
}

async function getLegacyContextForWorkOrder(workOrder: OperationalWorkOrder, tenantId: string) {
  const hetIds = legacyHetKeys(workOrder);
  if (!hetIds.length) return buildLegacyWorkOrderContext([workOrder]);

  const peers = await prisma.workOrder.findMany({
    where: {
      deleted: false,
      tenantId,
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

export async function startWorkOrderPhase(id: string, actorId: string, signatureDataUrl?: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, tenantId: scopedTenantId },
    select: {
      id: true,
      tenantId: true,
      workflowId: true,
      phaseId: true,
      phaseOrder: true,
      hetId: true,
      prodStart: true,
      prodEnd: true,
      prodDuration: true,
    },
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
    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        prodStart: new Date(),
        startSignPath: signatureDataUrl,
        startSignById: actorId,
        updatedById: actorId,
      },
    });
    await recordWorkOrderAuditEvent({
      tenantId: scopedTenantId,
      workOrderId: id,
      action: 'work_order.phase_started',
      actorId,
      source: 'workOrderService.startWorkOrderPhase',
      previousState: auditState(workOrder),
      newState: auditState(updated),
    });
  }

  return getDecoratedWorkOrderOrThrow(id, scopedTenantId);
}

export async function finishWorkOrderPhase(id: string, actorId: string, signatureDataUrl?: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, tenantId: scopedTenantId },
    select: {
      id: true,
      tenantId: true,
      workflowId: true,
      phaseId: true,
      phaseOrder: true,
      hetId: true,
      prodStart: true,
      prodEnd: true,
      prodDuration: true,
    },
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
    const finishedAt = new Date();
    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        prodEnd: finishedAt,
        prodDuration: elapsedMinutes(workOrder.prodStart, finishedAt),
        endSignPath: signatureDataUrl,
        endSignById: actorId,
        updatedById: actorId,
      },
    });
    await recordWorkOrderAuditEvent({
      tenantId: scopedTenantId,
      workOrderId: id,
      action: 'work_order.phase_finished',
      actorId,
      source: 'workOrderService.finishWorkOrderPhase',
      previousState: auditState(workOrder),
      newState: auditState(updated),
    });
  }

  return getDecoratedWorkOrderOrThrow(id, scopedTenantId);
}

export async function advanceWorkOrder(id: string, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, tenantId: scopedTenantId },
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
      where: { workOrderId: id, tenantId: scopedTenantId, result: true },
    });
    if (!passing) {
      throw new Error(
        'sterilisation/BET gate not satisfied: record a passing sterilisation result',
      );
    }
  }

  const nextPhase = orderedPhases[currentIndex + 1];

  const updated = await prisma.workOrder.update({
    where: { id },
    data: {
      phaseId: nextPhase.phaseId,
      phaseOrder: nextPhase.sortOrder,
      updatedById: actorId,
    },
  });
  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: id,
    action: 'work_order.phase_advanced',
    actorId,
    source: 'workOrderService.advanceWorkOrder',
    previousState: auditState(workOrder),
    newState: auditState(updated),
  });

  return getDecoratedWorkOrderOrThrow(id, scopedTenantId);
}

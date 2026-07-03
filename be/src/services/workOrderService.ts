import { randomBytes } from 'node:crypto';
import { Prisma, type WorkOrder } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

/**
 * Mint a human-readable work-order number that is also the primary key
 * (WorkOrder.id has no @default). The millisecond timestamp keeps ids roughly
 * sortable/readable; the random suffix prevents same-millisecond collisions
 * when two work orders are created concurrently (two advances, or an advance
 * racing a create) — without it a PK clash aborts the transaction and surfaces
 * as an opaque 500.
 */
function generateWoNumber() {
  return `WO-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export interface CreateWorkOrderInput {
  workflowId: string;
  hetId?: string;
}

type WorkOrderAuditAction =
  | 'work_order.created'
  | 'work_order.equipment_recorded'
  | 'work_order.photo_evidence_recorded'
  | 'work_order.output_quantity_recorded'
  | 'work_order.release_recorded'
  | 'work_order.serial_recorded'
  | 'work_order.phase_started'
  | 'work_order.phase_finished'
  | 'work_order.phase_advanced';

const MAX_PHOTO_EVIDENCE_DECODED_BYTES = 5 * 1024 * 1024;

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
  outputQuantity: string | null;
  releaseStatus: string | null;
  releaseDecisionAt: string | null;
  imageCaptured?: boolean | null;
  equipmentCount?: number | null;
  serialCount?: number | null;
  previousWoId?: string | null;
  nextWorkOrderId?: string | null;
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
      sortOrder: true,
      isGate: true,
      blocksCombine: true,
      bom: { select: { lines: { where: { deleted: false }, select: { id: true, description: true, quantity: true, uom: true, hasSerial: true } } } },
      phaseEquips: { select: { phaseEquip: { select: { id: true, equipId: true, name: true, description: true } } } },
    },
  },
  nextPhase: { select: { id: true, phaseName: true, phaseShort: true, sortOrder: true } },
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
        select: { id: true, phaseName: true, phaseShort: true, sortOrder: true, isGate: true, blocksCombine: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
} satisfies Prisma.WorkOrderInclude;

/**
 * Include used when loading a work order with its workflow's owned phases
 * (ordered), so the lifecycle (create/advance) can read the phase ordering.
 * batchHets is included so an advance can carry the combined-HET links onto
 * the next phase's work order.
 */
const workOrderWithPhasesInclude = {
  workflow: {
    include: {
      phases: {
        select: { id: true, phaseName: true, phaseShort: true, sortOrder: true, isGate: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
  batchHets: { select: { hetId: true } },
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

const workOrderAuditSnapshotSelect = {
  id: true,
  tenantId: true,
  workflowId: true,
  phaseId: true,
  phaseOrder: true,
  hetId: true,
  prodStart: true,
  prodEnd: true,
  prodDuration: true,
  outputQuantity: true,
  releaseStatus: true,
  releaseDecisionAt: true,
  imagePath: true,
} satisfies Prisma.WorkOrderSelect;

function auditState(
  workOrder: Pick<
    WorkOrder,
    | 'id'
    | 'tenantId'
    | 'workflowId'
    | 'phaseId'
    | 'phaseOrder'
    | 'hetId'
    | 'prodStart'
    | 'prodEnd'
    | 'prodDuration'
    | 'outputQuantity'
  > & {
    releaseStatus?: string | null;
    releaseDecisionAt?: Date | null;
    imagePath?: string | null;
    phaseEquips?: unknown[];
    woSerials?: unknown[];
  },
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
    outputQuantity: workOrder.outputQuantity?.toString() ?? null,
    releaseStatus: workOrder.releaseStatus ?? null,
    releaseDecisionAt: workOrder.releaseDecisionAt?.toISOString() ?? null,
    ...('imagePath' in workOrder ? { imageCaptured: Boolean(workOrder.imagePath) } : {}),
    ...(workOrder.phaseEquips ? { equipmentCount: workOrder.phaseEquips.length } : {}),
    ...(workOrder.woSerials ? { serialCount: workOrder.woSerials.length } : {}),
  };
}

async function updateTenantWorkOrderForAudit(
  client: Pick<Prisma.TransactionClient, 'workOrder'>,
  id: string,
  tenantId: string,
  data: Prisma.WorkOrderUncheckedUpdateManyInput,
) {
  const updated = await client.workOrder.updateMany({
    where: { id, tenantId },
    data,
  });
  if (updated.count === 0) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  return client.workOrder.findFirstOrThrow({
    where: { id, tenantId },
    select: workOrderAuditSnapshotSelect,
  });
}

function elapsedMinutes(start: Date, end: Date) {
  const elapsedMs = Math.max(0, end.getTime() - start.getTime());
  return new Prisma.Decimal((elapsedMs / 60000).toFixed(4));
}

function validatePhotoEvidenceDataUrl(imageDataUrl: string) {
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(imageDataUrl);
  if (!match) {
    throw new Error('cannot record photo evidence: image data must be a png, jpeg, or webp base64 data URL');
  }

  const base64 = match[2].replace(/\s/g, '');
  if (!base64 || base64.length % 4 !== 0) {
    throw new Error('cannot record photo evidence: image data is not valid base64');
  }

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const decodedBytes = (base64.length / 4) * 3 - padding;
  if (decodedBytes > MAX_PHOTO_EVIDENCE_DECODED_BYTES) {
    throw new Error('cannot record photo evidence: image data exceeds 5 MB');
  }
}

function assertCanRecordPhaseEvidence(workOrder: Pick<WorkOrder, 'prodStart'> & { releaseStatus?: string | null }, evidenceName: string) {
  if (workOrder.releaseStatus) {
    throw new Error(`cannot record ${evidenceName}: work order already has a release disposition`);
  }
  if (!workOrder.prodStart) {
    throw new Error(`cannot record ${evidenceName}: phase not started`);
  }
}

function dispositionLifecycleState(releaseStatus: string) {
  if (releaseStatus === 'released') return 'Released';
  if (releaseStatus === 'quarantined') return 'Quarantined';
  if (releaseStatus === 'rejected') return 'Rejected';
  return 'ReleaseDispositionRecorded';
}

function positiveDecimalish(value: { toString: () => string } | null | undefined) {
  if (!value) return false;
  try {
    return new Prisma.Decimal(value.toString()).gt(0);
  } catch {
    return false;
  }
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
        select: { id: true, phaseName: true, phaseShort: true, sortOrder: true },
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
  const woNumber = generateWoNumber();

  // WorkOrder.id has no @default; reuse woNumber as the id so the work order is
  // addressable by the same human-readable identifier used in the UI.
  const created = await prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.create({
      data: {
        id: woNumber,
        tenantId: scopedTenantId,
        woNumber,
        workflowId: input.workflowId,
        hetId: input.hetId,
        phaseId: firstPhase.id,
        phaseOrder: firstPhase.sortOrder,
        phaseShort: firstPhase.phaseShort,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    // The first work order of a run marks the HET as in-use. Guarded on
    // usedById=null so a HET already in production keeps its original pointer.
    if (input.hetId) {
      await tx.het.updateMany({
        where: { id: input.hetId, tenantId: scopedTenantId, usedById: null },
        data: { usedById: workOrder.id },
      });
    }

    return workOrder;
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

function getLifecycleState(workOrder: OperationalWorkOrder, atFinalPhase: boolean) {
  if (workOrder.releaseStatus) return dispositionLifecycleState(workOrder.releaseStatus);
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

function getLegacyWorkOrderState(workOrder: OperationalWorkOrder, context: LegacyWorkOrderContext, atFinalPhase: boolean) {
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
  const allowedPhaseEquips = workOrder.phase?.phaseEquips ?? [];
  const capturedPhaseEquipIds = new Set(
    (workOrder.phaseEquips ?? []).map((equipment) => equipment.phaseEquip.id).filter(Boolean),
  );
  const combinedHetCheck = (workOrder.batchHets?.length ?? 0) > 0;
  const imageCaptured = Boolean(workOrder.imagePath);
  const outputQuantityCaptured = positiveDecimalish(workOrder.outputQuantity);
  const equipmentCheckDone = allowedPhaseEquips.every(({ phaseEquip }) => capturedPhaseEquipIds.has(phaseEquip.id));
  let legacyStateBucket: LegacyStateBucket;
  let legacyProductionState: string;

  if (phaseOrderCurrent !== phaseOrder) {
    legacyStateBucket = '5. WO Completed';
    legacyProductionState = legacyStateBucket;
  } else if (workOrder.prodStart && workOrder.prodEnd) {
    if (!atFinalPhase) {
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
    { key: 'image', label: 'Work-order image captured', met: imageCaptured },
    { key: 'output_quantity', label: 'Output quantity recorded', met: outputQuantityCaptured },
    { key: 'serial_check', label: 'Serial/BOM entries complete', met: serialCheckDone },
    { key: 'equipment_check', label: 'Allowed equipment recorded', met: equipmentCheckDone },
  ];

  if (workOrder.phase?.blocksCombine) {
    advanceRequirements.push({ key: 'not_combined_het', label: 'Combined-HET not allowed in this phase', met: !combinedHetCheck });
  }

  const canAdvanceLegacy =
    !atFinalPhase &&
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
    parityGaps: [],
    imageCaptured,
    outputQuantityCaptured,
    serialCheckDone,
    serialRequiredCount,
    equipmentCheckDone,
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
    allowedEquipment: allowedPhaseEquips.map(({ phaseEquip }) => ({
      phaseEquipId: phaseEquip.id,
      equipId: phaseEquip.equipId,
      name: phaseEquip.name,
      description: phaseEquip.description,
      recorded: capturedPhaseEquipIds.has(phaseEquip.id),
    })),
    combinedHetCheck,
  };
}

function decorateOperationalWorkOrder(workOrder: OperationalWorkOrder, context: LegacyWorkOrderContext) {
  const phases = workOrder.workflow?.phases ?? [];
  const currentIndex = phases.findIndex((p) => p.id === workOrder.phaseId);
  const atFinalPhase = currentIndex >= 0 && currentIndex === phases.length - 1;
  const sterilises = workOrder.sterilises ?? [];
  const woSerials = workOrder.woSerials ?? [];
  const phaseEquips = workOrder.phaseEquips ?? [];
  const hasPassingSterilisation = sterilises.some((s) => s.result === true);
  const blockers: string[] = [];
  const evidenceBlockers: string[] = [];
  const legacyState = getLegacyWorkOrderState(workOrder, context, atFinalPhase);

  if (!workOrder.hetId) blockers.push('HET not assigned');
  if (workOrder.phase?.isGate && !hasPassingSterilisation) {
    blockers.push('Sterilisation/BET pass required');
  }
  if (!legacyState.imageCaptured) evidenceBlockers.push('Work-order image captured');
  if (!legacyState.outputQuantityCaptured) evidenceBlockers.push('Output quantity recorded');
  if (!legacyState.serialCheckDone) evidenceBlockers.push('Serial/BOM entries complete');
  if (!legacyState.equipmentCheckDone) evidenceBlockers.push('Allowed equipment recorded');
  if (atFinalPhase && !workOrder.prodEnd) blockers.push('Release phase not finished');

  const phaseTimeline = phases.map((p, index) => ({
    id: p.id,
    phaseName: p.phaseName,
    phaseShort: p.phaseShort,
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

  // A work order is superseded when a peer on the same HET has advanced to a
  // later phase: the HET moved on to the next phase's work order, so this row
  // is a completed step in the chain, not active work.
  const superseded = legacyState.phaseOrderCurrent !== (workOrder.phaseOrder ?? null);
  const lifecycleState = workOrder.releaseStatus
    ? getLifecycleState(workOrder, atFinalPhase)
    : superseded
      ? 'Completed'
      : getLifecycleState(workOrder, atFinalPhase);

  return {
    ...workOrder,
    releaseStatus: workOrder.releaseStatus ?? null,
    releaseDecisionAt: workOrder.releaseDecisionAt ?? null,
    releaseDecisionById: workOrder.releaseDecisionById ?? null,
    releaseRemarks: workOrder.releaseRemarks ?? null,
    lifecycleState,
    operationalStatus: workOrder.releaseStatus ?? (superseded ? 'Completed' : blockers.length ? 'Blocked' : atFinalPhase ? 'ReleasePending' : lifecycleState),
    readinessBlockers: [...blockers, ...evidenceBlockers],
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
  return workOrders.map((workOrder) => {
    const decorated = decorateOperationalWorkOrder(workOrder, context);
    // List payloads must not ship the inline base64 evidence (imagePath can be up to
    // 5 MB per work order). The board only needs the `imageCaptured` boolean, which is
    // already computed; the detail view refetches the full record with imagePath intact.
    return { ...decorated, imagePath: null };
  });
}

export async function listQaWorkOrderQueue(tenantId?: string | null) {
  const workOrders = await listWorkOrders(tenantId);
  const sterilisation = workOrders.filter((workOrder) =>
    workOrder.phase?.isGate &&
    workOrder.readinessBlockers.includes('Sterilisation/BET pass required'),
  );
  const quarantine = workOrders.filter((workOrder) => workOrder.legacyStateBucket === '3. In Quarantine');
  const release = workOrders.filter((workOrder) => workOrder.lifecycleState === 'ReleasePending' && workOrder.readinessBlockers.length === 0);

  return {
    counts: {
      sterilisation: sterilisation.length,
      quarantine: quarantine.length,
      release: release.length,
    },
    sterilisation,
    quarantine,
    release,
  };
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
      outputQuantity: true,
      releaseStatus: true,
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
  assertCanRecordPhaseEvidence(workOrder, 'serial');

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

export async function recordWorkOrderOutputQuantity(
  id: string,
  input: { outputQuantity: string | number },
  actorId: string,
  tenantId?: string | null,
) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const outputQuantity = new Prisma.Decimal(input.outputQuantity);
  if (!outputQuantity.isFinite() || outputQuantity.lte(0)) {
    throw new Error('cannot record output quantity: quantity must be greater than zero');
  }

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
      outputQuantity: true,
      releaseStatus: true,
    },
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  assertCanRecordPhaseEvidence(workOrder, 'output quantity');

  const updated = await updateTenantWorkOrderForAudit(prisma, id, scopedTenantId, {
    outputQuantity,
    updatedById: actorId,
  });

  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: id,
    action: 'work_order.output_quantity_recorded',
    actorId,
    source: 'workOrderService.recordWorkOrderOutputQuantity',
    previousState: auditState(workOrder),
    newState: auditState(updated),
  });

  return getDecoratedWorkOrderOrThrow(id, scopedTenantId);
}

export async function recordWorkOrderPhotoEvidence(
  id: string,
  input: { imageDataUrl: string },
  actorId: string,
  tenantId?: string | null,
) {
  const imageDataUrl = input.imageDataUrl.trim();
  if (!imageDataUrl) {
    throw new Error('cannot record photo evidence: image data is required');
  }
  validatePhotoEvidenceDataUrl(imageDataUrl);

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
      outputQuantity: true,
      imagePath: true,
      releaseStatus: true,
    },
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  assertCanRecordPhaseEvidence(workOrder, 'photo evidence');

  const updated = await updateTenantWorkOrderForAudit(prisma, id, scopedTenantId, {
    imagePath: imageDataUrl,
    updatedById: actorId,
  });

  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: id,
    action: 'work_order.photo_evidence_recorded',
    actorId,
    source: 'workOrderService.recordWorkOrderPhotoEvidence',
    previousState: auditState(workOrder),
    newState: auditState(updated),
  });

  return getDecoratedWorkOrderOrThrow(id, scopedTenantId);
}

export async function recordWorkOrderRelease(
  id: string,
  input: { releaseStatus: 'released' | 'quarantined' | 'rejected'; remarks?: string | null },
  actorId: string,
  tenantId?: string | null,
) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, tenantId: scopedTenantId },
    include: workOrderOperationalInclude,
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  const context = await getLegacyContextForWorkOrder(workOrder, scopedTenantId);
  const decorated = decorateOperationalWorkOrder(workOrder, context);
  if (decorated.releaseStatus) {
    throw new Error('cannot release: work order already has a release disposition');
  }
  if (decorated.lifecycleState !== 'ReleasePending') {
    throw new Error('cannot release: work order is not ready for final release');
  }
  if (decorated.readinessBlockers.length > 0 || decorated.missingAdvanceRequirements.length > 0) {
    const blockers = Array.from(new Set([...decorated.readinessBlockers, ...decorated.missingAdvanceRequirements]));
    throw new Error(`cannot release: missing ${blockers.join(', ')}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const released = await updateTenantWorkOrderForAudit(tx, id, scopedTenantId, {
      releaseStatus: input.releaseStatus,
      releaseDecisionAt: new Date(),
      releaseDecisionById: actorId,
      releaseRemarks: input.remarks?.trim() || null,
      updatedById: actorId,
    });

    // A released run consumes its HET: the final (release-phase) work order is
    // recorded as the HET's finisher. Quarantine/reject leave the HET open.
    // Guarded on finishedById=null (symmetric to createWorkOrder's usedById
    // claim) so a HET already finished by an earlier run keeps its original
    // finisher pointer instead of being silently overwritten.
    if (input.releaseStatus === 'released' && workOrder.hetId) {
      await tx.het.updateMany({
        where: { id: workOrder.hetId, tenantId: scopedTenantId, finishedById: null },
        data: { finishedById: id },
      });
    }

    return released;
  });

  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: id,
    action: 'work_order.release_recorded',
    actorId,
    source: 'workOrderService.recordWorkOrderRelease',
    previousState: auditState(workOrder),
    newState: auditState(updated),
  });

  return getDecoratedWorkOrderOrThrow(id, scopedTenantId);
}

export async function recordWorkOrderEquipment(
  id: string,
  input: { phaseEquipId: string },
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
      outputQuantity: true,
      releaseStatus: true,
      phase: {
        select: {
          phaseEquips: {
            select: { phaseEquipId: true },
          },
        },
      },
      phaseEquips: { select: { phaseEquipId: true } },
    },
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  assertCanRecordPhaseEvidence(workOrder, 'equipment');

  const allowed = workOrder.phase?.phaseEquips.some((equipment) => equipment.phaseEquipId === input.phaseEquipId);
  if (!allowed) {
    throw new Error('cannot record equipment: equipment is not allowed for the current phase');
  }

  const existing = workOrder.phaseEquips.some((equipment) => equipment.phaseEquipId === input.phaseEquipId);
  if (existing) {
    return getDecoratedWorkOrderOrThrow(id, scopedTenantId);
  }

  await prisma.workOrderPhaseEquip.create({
    data: {
      workOrderId: id,
      phaseEquipId: input.phaseEquipId,
    },
  });

  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: id,
    action: 'work_order.equipment_recorded',
    actorId,
    source: 'workOrderService.recordWorkOrderEquipment',
    previousState: auditState(workOrder),
    newState: { ...auditState(workOrder), equipmentCount: workOrder.phaseEquips.length + 1 },
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
      outputQuantity: true,
      releaseStatus: true,
    },
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  if (workOrder.releaseStatus) {
    throw new Error('cannot start: work order already has a release disposition');
  }

  if (!workOrder.hetId) {
    throw new Error('cannot start: HET not assigned');
  }

  if (!workOrder.prodStart) {
    const updated = await updateTenantWorkOrderForAudit(prisma, id, scopedTenantId, {
      prodStart: new Date(),
      startSignPath: signatureDataUrl,
      startSignById: actorId,
      updatedById: actorId,
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
      outputQuantity: true,
      releaseStatus: true,
    },
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }
  if (workOrder.releaseStatus) {
    throw new Error('cannot finish: work order already has a release disposition');
  }

  if (!workOrder.prodStart) {
    throw new Error('cannot finish: phase not started');
  }

  if (!workOrder.prodEnd) {
    const finishedAt = new Date();
    const updated = await updateTenantWorkOrderForAudit(prisma, id, scopedTenantId, {
      prodEnd: finishedAt,
      prodDuration: elapsedMinutes(workOrder.prodStart, finishedAt),
      endSignPath: signatureDataUrl,
      endSignById: actorId,
      updatedById: actorId,
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
    include: workOrderWithPhasesInclude,
  });

  if (!workOrder) {
    throw new Prisma.PrismaClientKnownRequestError('Work order not found', {
      code: 'P2025',
      clientVersion: 'unknown',
    });
  }

  const orderedPhases = workOrder.workflow?.phases ?? [];
  const currentIndex = orderedPhases.findIndex((p) => p.id === workOrder.phaseId);

  if (currentIndex === -1 || currentIndex === orderedPhases.length - 1) {
    throw new Error('work order is at its final phase');
  }

  if (!workOrder.hetId) {
    throw new Error('cannot advance: HET not assigned');
  }
  if (workOrder.releaseStatus) {
    throw new Error('cannot advance: work order already has a release disposition');
  }

  if (!workOrder.prodStart) {
    throw new Error('cannot advance: phase not started');
  }

  if (!workOrder.prodEnd) {
    throw new Error('cannot advance: phase not finished');
  }

  // Sterilisation / BET gate: leaving a gate phase requires a passing
  // sterilisation result recorded against the work order.
  if (orderedPhases[currentIndex].isGate) {
    const passing = await prisma.sterilise.findFirst({
      where: { workOrderId: id, tenantId: scopedTenantId, result: true },
    });
    if (!passing) {
      throw new Error(
        'sterilisation/BET gate not satisfied: record a passing sterilisation result',
      );
    }
  }

  const decorated = await getDecoratedWorkOrderOrThrow(id, scopedTenantId);
  if (decorated.missingAdvanceRequirements.length > 0) {
    throw new Error(`cannot advance: missing ${decorated.missingAdvanceRequirements.join(', ')}`);
  }
  if (decorated.readinessBlockers.length > 0) {
    throw new Error(`cannot advance: ${decorated.readinessBlockers.join(', ')}`);
  }

  const nextPhase = orderedPhases[currentIndex + 1];

  // The HET is the state that carries through the workflow: advancing completes
  // this work order (evidence retained) and initialises the next phase as a NEW
  // work order chained via previousWoId, carrying the HET and batch-HET links.
  const nextWoNumber = generateWoNumber();

  const { completed, spawned } = await prisma.$transaction(async (tx) => {
    const completed = await updateTenantWorkOrderForAudit(tx, id, scopedTenantId, {
      nextPhaseId: nextPhase.id,
      updatedById: actorId,
    });

    // previousWoId carries a UNIQUE constraint, so a concurrent second advance of
    // the same source work order collides here instead of forking the chain into
    // two active next-phase work orders for one HET.
    const spawned = await tx.workOrder.create({
      data: {
        id: nextWoNumber,
        tenantId: scopedTenantId,
        woNumber: nextWoNumber,
        workflowId: workOrder.workflowId,
        hetId: workOrder.hetId,
        phaseId: nextPhase.id,
        phaseOrder: nextPhase.sortOrder,
        phaseShort: nextPhase.phaseShort,
        previousWoId: id,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    const batchHetIds = (workOrder.batchHets ?? []).map((batchHet) => batchHet.hetId);
    if (batchHetIds.length > 0) {
      await tx.workOrderHet.createMany({
        data: batchHetIds.map((hetId) => ({ workOrderId: spawned.id, hetId })),
        skipDuplicates: true,
      });
    }

    return { completed, spawned };
  });

  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: id,
    action: 'work_order.phase_advanced',
    actorId,
    source: 'workOrderService.advanceWorkOrder',
    previousState: auditState(workOrder),
    newState: { ...auditState(completed), nextWorkOrderId: spawned.id },
  });
  await recordWorkOrderAuditEvent({
    tenantId: scopedTenantId,
    workOrderId: spawned.id,
    action: 'work_order.created',
    actorId,
    source: 'workOrderService.advanceWorkOrder',
    previousState: null,
    newState: { ...auditState(spawned), previousWoId: id },
  });

  return getDecoratedWorkOrderOrThrow(spawned.id, scopedTenantId);
}

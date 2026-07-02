import api from './api';
import type { InventoryGenealogyEdge, InventoryLot, InventoryTransaction } from './inventory-api';

export interface WorkOrderWorkflowRef {
  id: string;
  name: string;
  code: string;
}

export interface WorkOrderPhaseRef {
  id: string;
  phaseName: string | null;
  phaseShort: string | null;
  phaseOrder: number | null;
}

export interface WorkOrderHetRef {
  id: string;
  hetNumber: string | null;
  clinicName: string | null;
  quantity: number | null;
}

export interface WorkOrderManufacturerRef {
  id: string;
  manuNumber: string | null;
  manuName: string | null;
}

export interface WorkOrderPhaseTimelineItem extends WorkOrderPhaseRef {
  sortOrder: number;
  state: 'complete' | 'current' | 'pending';
}

export interface WorkOrderCounts {
  serials: number;
  equipment: number;
  sterilisationRecords: number;
}

export type LegacyWorkOrderStateBucket =
  | '1. In Progress'
  | '2. Next Phase'
  | '3. In Quarantine'
  | '4. Finished Goods'
  | '5. WO Completed';

export type WorkOrderLifecycleState =
  | 'NotStarted'
  | 'InProgress'
  | 'ReadyToAdvance'
  | 'ReleasePending'
  | 'Released';

export interface WorkOrderSterilisationRef {
  id: string;
  direction: string | null;
  result: boolean | null;
  betReading: string | number | null;
  quantity: number | null;
  createdAt: string;
}

export interface WorkOrderSerialRef {
  id: string;
  serialNumber: string | null;
  bomRef: {
    id: string;
    description: string | null;
    quantity: string | number | null;
    uom: string | null;
    hasSerial: boolean;
  };
}

export interface WorkOrderAdvanceRequirement {
  key: string;
  label: string;
  met: boolean;
  parityGap?: boolean;
}

export interface WorkOrderRequiredSerial {
  bomRefId: string;
  description: string | null;
  quantity: string | number | null;
  uom: string | null;
  serialNumber: string | null;
}

export interface WorkOrderAllowedEquipment {
  phaseEquipId: string;
  equipId: string | null;
  name: string | null;
  description: string | null;
  recorded: boolean;
}

export interface WorkOrderSummary {
  id: string;
  woNumber: string | null;
  workflowId: string | null;
  hetId: string | null;
  phaseOrder: number | null;
  phaseShort: string | null;
  prodStart: string | null;
  prodEnd: string | null;
  prodDuration: string | number | null;
  outputQuantity: string | number | null;
  imagePath: string | null;
  releaseStatus: 'released' | 'quarantined' | 'rejected' | null;
  releaseDecisionAt: string | null;
  releaseDecisionById: string | null;
  releaseRemarks: string | null;
  workflow: WorkOrderWorkflowRef | null;
  phase: WorkOrderPhaseRef | null;
  het: WorkOrderHetRef | null;
  manufacturer: WorkOrderManufacturerRef | null;
  sterilises: WorkOrderSterilisationRef[];
  woSerials: WorkOrderSerialRef[];
  lifecycleState: WorkOrderLifecycleState;
  operationalStatus: 'Blocked' | WorkOrderLifecycleState | string;
  readinessBlockers: string[];
  currentPhaseLabel: string;
  phaseOrderCurrent: number | null;
  legacyProductionState: string;
  legacyStateBucket: LegacyWorkOrderStateBucket;
  canAdvanceLegacy: boolean;
  advanceRequirements: WorkOrderAdvanceRequirement[];
  missingAdvanceRequirements: string[];
  parityGaps: string[];
  imageCaptured: boolean;
  outputQuantityCaptured: boolean;
  serialCheckDone: boolean;
  serialRequiredCount: number;
  equipmentCheckDone: boolean;
  requiredSerials: WorkOrderRequiredSerial[];
  allowedEquipment: WorkOrderAllowedEquipment[];
  combinedHetCheck: boolean;
  phaseTimeline: WorkOrderPhaseTimelineItem[];
  counts: WorkOrderCounts;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  phaseId: string | null;
}

export interface QaWorkOrderQueue {
  counts: {
    sterilisation: number;
    quarantine: number;
    release: number;
  };
  sterilisation: WorkOrderSummary[];
  quarantine: WorkOrderSummary[];
  release: WorkOrderSummary[];
}

export interface WorkOrderInventoryTrace {
  subject: { type: 'workOrder'; id: string; label?: string | null };
  lots: InventoryLot[];
  transactions: InventoryTransaction[];
  consumptions: Array<{
    id: string;
    workOrderId: string;
    inventoryLotId: string | null;
    inventorySkuId: string | null;
    bomLineId: string | null;
    quantity: string | number | null;
    uom: string | null;
  }>;
  genealogy: InventoryGenealogyEdge[];
  hets: Array<{
    id: string;
    hetNumber: string | null;
    collectionUnitId: string | null;
    usedById: string | null;
    finishedById: string | null;
  }>;
  workOrders: Array<{
    id: string;
    woNumber: string | null;
    hetId: string | null;
    phaseOrder: number | null;
  }>;
}

export interface WorkOrderAuditState {
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
}

export interface WorkOrderAuditEvent {
  id: string;
  tenantId: string;
  workOrderId: string;
  action: string;
  actorId: string | null;
  source: string;
  previousState: WorkOrderAuditState | null;
  newState: WorkOrderAuditState | null;
  createdAt: string;
}

function asWorkOrderList(data: unknown): WorkOrderSummary[] {
  if (Array.isArray(data)) return data as WorkOrderSummary[];
  if (data && typeof data === 'object') {
    const envelope = data as { data?: unknown; items?: unknown };
    if (Array.isArray(envelope.items)) return envelope.items as WorkOrderSummary[];
    if (Array.isArray(envelope.data)) return envelope.data as WorkOrderSummary[];
  }
  return [];
}

export async function fetchWorkOrders(): Promise<WorkOrderSummary[]> {
  const { data } = await api.get<unknown>('/api/work-orders');
  return asWorkOrderList(data);
}

export async function fetchWorkOrder(id: string): Promise<WorkOrderDetail> {
  const { data } = await api.get<WorkOrderDetail>(`/api/work-orders/${id}`);
  return data;
}

export async function fetchQaWorkOrderQueue(): Promise<QaWorkOrderQueue> {
  const { data } = await api.get<QaWorkOrderQueue>('/api/work-orders/qa-queue');
  return data;
}

export async function fetchWorkOrderInventoryTrace(id: string): Promise<WorkOrderInventoryTrace> {
  const { data } = await api.get<WorkOrderInventoryTrace>(`/api/work-orders/${id}/inventory-trace`);
  return data;
}

export async function fetchWorkOrderAuditEvents(id: string): Promise<WorkOrderAuditEvent[]> {
  const { data } = await api.get<WorkOrderAuditEvent[]>(`/api/work-orders/${id}/audit-events`);
  return data;
}

export async function createWorkOrder(payload: {
  workflowId: string;
  hetId?: string;
}): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>('/api/work-orders', payload);
  return data;
}

export async function startWorkOrderPhase(id: string, signatureDataUrl?: string): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/start`, signatureDataUrl ? { signatureDataUrl } : {});
  return data;
}

export async function finishWorkOrderPhase(id: string, signatureDataUrl?: string): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/finish`, signatureDataUrl ? { signatureDataUrl } : {});
  return data;
}

export async function recordWorkOrderOutputQuantity(
  id: string,
  payload: { outputQuantity: string },
): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/output-quantity`, payload);
  return data;
}

export async function recordWorkOrderEquipment(
  id: string,
  payload: { phaseEquipId: string },
): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/equipment`, payload);
  return data;
}

export async function recordWorkOrderPhotoEvidence(
  id: string,
  payload: { imageDataUrl: string },
): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/photo-evidence`, payload);
  return data;
}

export async function recordWorkOrderRelease(
  id: string,
  payload: { releaseStatus: 'released' | 'quarantined' | 'rejected'; remarks?: string },
): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/release`, payload);
  return data;
}

export async function recordWorkOrderSerial(
  id: string,
  payload: { bomRefId: string; serialNumber: string },
): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/serials`, payload);
  return data;
}

export async function advanceWorkOrder(id: string): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/advance`);
  return data;
}

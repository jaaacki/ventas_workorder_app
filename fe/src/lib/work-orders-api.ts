import api from './api';

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

export interface WorkOrderSummary {
  id: string;
  woNumber: string | null;
  workflowId: string | null;
  hetId: string | null;
  phaseOrder: number | null;
  phaseShort: string | null;
  prodStart: string | null;
  prodEnd: string | null;
  workflow: WorkOrderWorkflowRef | null;
  phase: WorkOrderPhaseRef | null;
  het: WorkOrderHetRef | null;
  manufacturer: WorkOrderManufacturerRef | null;
  sterilises: WorkOrderSterilisationRef[];
  woSerials: WorkOrderSerialRef[];
  operationalStatus: 'Ready' | 'Blocked' | 'Release' | string;
  readinessBlockers: string[];
  currentPhaseLabel: string;
  phaseTimeline: WorkOrderPhaseTimelineItem[];
  counts: WorkOrderCounts;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  id: string;
  woNumber: string | null;
  workflowId: string | null;
  hetId: string | null;
  phaseId: string | null;
  phaseOrder: number | null;
  prodStart: string | null;
  prodEnd: string | null;
  workflow: WorkOrderWorkflowRef | null;
  phase: WorkOrderPhaseRef | null;
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

export async function createWorkOrder(payload: {
  workflowId: string;
  hetId?: string;
}): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>('/api/work-orders', payload);
  return data;
}

export async function advanceWorkOrder(id: string): Promise<WorkOrderDetail> {
  const { data } = await api.post<WorkOrderDetail>(`/api/work-orders/${id}/advance`);
  return data;
}

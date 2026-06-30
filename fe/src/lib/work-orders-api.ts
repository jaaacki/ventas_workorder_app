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

export interface WorkOrderSummary {
  id: string;
  woNumber: string | null;
  workflowId: string | null;
  phaseOrder: number | null;
  prodStart: string | null;
  prodEnd: string | null;
  workflow: WorkOrderWorkflowRef | null;
}

export interface WorkOrderDetail {
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

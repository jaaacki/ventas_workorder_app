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

export async function fetchWorkOrders(): Promise<WorkOrderSummary[]> {
  const { data } = await api.get<WorkOrderSummary[]>('/api/work-orders');
  return data;
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

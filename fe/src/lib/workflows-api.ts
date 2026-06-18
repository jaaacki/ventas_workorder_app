import api from './api';

export interface WorkflowSummary {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { phases: number; workOrders: number };
}

export interface WorkflowPhaseBinding {
  workflowId: string;
  phaseId: string;
  sortOrder: number;
  phase: {
    id: string;
    phaseName: string | null;
    phaseShort: string | null;
    phaseOrder: number | null;
  };
}

export interface WorkflowDetail {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  phases: WorkflowPhaseBinding[];
}

export async function fetchWorkflows(activeOnly = false): Promise<WorkflowSummary[]> {
  const { data } = await api.get<WorkflowSummary[]>('/api/workflows', {
    params: activeOnly ? { active: 'true' } : undefined,
  });
  return data;
}

export async function fetchWorkflow(id: string): Promise<WorkflowDetail> {
  const { data } = await api.get<WorkflowDetail>(`/api/workflows/${id}`);
  return data;
}

export async function createWorkflow(payload: {
  name: string;
  code: string;
  description?: string | null;
  phases?: { phaseId: string; sortOrder: number }[];
}): Promise<WorkflowDetail> {
  const { data } = await api.post<WorkflowDetail>('/api/workflows', payload);
  return data;
}

export async function updateWorkflow(
  id: string,
  payload: { name?: string; description?: string | null; active?: boolean },
): Promise<WorkflowDetail> {
  const { data } = await api.patch<WorkflowDetail>(`/api/workflows/${id}`, payload);
  return data;
}

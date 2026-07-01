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

export interface PhaseCatalogItem {
  id: string;
  tenantId: string;
  phaseName: string | null;
  phaseShort: string | null;
  phaseOrder: number | null;
  description: string | null;
  bomId: string | null;
  keyText: string | null;
  createdAt: string;
  updatedAt: string;
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

function asWorkflowList(data: unknown): WorkflowSummary[] {
  if (Array.isArray(data)) return data as WorkflowSummary[];
  if (data && typeof data === 'object') {
    const envelope = data as { data?: unknown; items?: unknown };
    if (Array.isArray(envelope.items)) return envelope.items as WorkflowSummary[];
    if (Array.isArray(envelope.data)) return envelope.data as WorkflowSummary[];
  }
  return [];
}

export async function fetchWorkflows(activeOnly = false): Promise<WorkflowSummary[]> {
  const { data } = await api.get<unknown>('/api/workflows', {
    params: activeOnly ? { active: 'true' } : undefined,
  });
  return asWorkflowList(data);
}

export async function fetchWorkflow(id: string): Promise<WorkflowDetail> {
  const { data } = await api.get<WorkflowDetail>(`/api/workflows/${id}`);
  return data;
}

export async function fetchPhases(): Promise<PhaseCatalogItem[]> {
  const { data } = await api.get<PhaseCatalogItem[]>('/api/phases');
  return data;
}

export type PhaseMutationPayload = {
  phaseName?: string | null;
  phaseShort?: string | null;
  phaseOrder?: number | null;
  description?: string | null;
  bomId?: string | null;
  keyText?: string | null;
};

export async function createPhase(payload: PhaseMutationPayload): Promise<PhaseCatalogItem> {
  const { data } = await api.post<PhaseCatalogItem>('/api/phases', payload);
  return data;
}

export async function updatePhase(id: string, payload: PhaseMutationPayload): Promise<PhaseCatalogItem> {
  const { data } = await api.patch<PhaseCatalogItem>(`/api/phases/${id}`, payload);
  return data;
}

export async function deletePhase(id: string): Promise<{ success: true }> {
  const { data } = await api.delete<{ success: true }>(`/api/phases/${id}`);
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
  payload: { name?: string; description?: string | null; active?: boolean; phases?: { phaseId: string; sortOrder: number }[] },
): Promise<WorkflowDetail> {
  const { data } = await api.patch<WorkflowDetail>(`/api/workflows/${id}`, payload);
  return data;
}

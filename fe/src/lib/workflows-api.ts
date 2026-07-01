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

export interface ProcedureCatalogItem {
  id: string;
  tenantId: string;
  procedureName: string | null;
  procedureDesc: string | null;
  procedureShort: string | null;
  keyText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BomCatalogItem {
  id: string;
  tenantId: string;
  bomName: string | null;
  keyText: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { lines?: number; phases?: number };
}

export interface BomLineCatalogItem {
  id: string;
  tenantId: string;
  bomId: string;
  bomName: string | null;
  description: string | null;
  quantity: string | number | null;
  uom: string | null;
  hasSerial: boolean;
  deleted: boolean;
  keyText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhaseEquipmentCatalogItem {
  id: string;
  tenantId: string;
  equipId: string | null;
  name: string | null;
  description: string | null;
  keyText: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { phases?: number; workOrders?: number };
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

export type ProcedureMutationPayload = {
  procedureName?: string | null;
  procedureDesc?: string | null;
  procedureShort?: string | null;
  keyText?: string | null;
};

export type BomMutationPayload = {
  bomName?: string | null;
  keyText?: string | null;
};

export type BomLineMutationPayload = {
  bomId?: string;
  bomName?: string | null;
  description?: string | null;
  quantity?: string | number | null;
  uom?: string | null;
  hasSerial?: boolean;
  keyText?: string | null;
};

export type PhaseEquipmentMutationPayload = {
  equipId?: string | null;
  name?: string | null;
  description?: string | null;
  keyText?: string | null;
};

export async function fetchProcedures(): Promise<ProcedureCatalogItem[]> {
  const { data } = await api.get<ProcedureCatalogItem[]>('/api/master-data/procedures');
  return data;
}

export async function createProcedure(payload: ProcedureMutationPayload): Promise<ProcedureCatalogItem> {
  const { data } = await api.post<ProcedureCatalogItem>('/api/master-data/procedures', payload);
  return data;
}

export async function updateProcedure(id: string, payload: ProcedureMutationPayload): Promise<ProcedureCatalogItem> {
  const { data } = await api.patch<ProcedureCatalogItem>(`/api/master-data/procedures/${id}`, payload);
  return data;
}

export async function deleteProcedure(id: string): Promise<{ success: true }> {
  const { data } = await api.delete<{ success: true }>(`/api/master-data/procedures/${id}`);
  return data;
}

export async function fetchBoms(): Promise<BomCatalogItem[]> {
  const { data } = await api.get<BomCatalogItem[]>('/api/master-data/boms');
  return data;
}

export async function createBom(payload: BomMutationPayload): Promise<BomCatalogItem> {
  const { data } = await api.post<BomCatalogItem>('/api/master-data/boms', payload);
  return data;
}

export async function updateBom(id: string, payload: BomMutationPayload): Promise<BomCatalogItem> {
  const { data } = await api.patch<BomCatalogItem>(`/api/master-data/boms/${id}`, payload);
  return data;
}

export async function deleteBom(id: string): Promise<{ success: true }> {
  const { data } = await api.delete<{ success: true }>(`/api/master-data/boms/${id}`);
  return data;
}

export async function fetchBomLines(bomId?: string): Promise<BomLineCatalogItem[]> {
  const { data } = await api.get<BomLineCatalogItem[]>('/api/master-data/bom-lines', {
    params: bomId ? { bomId } : undefined,
  });
  return data;
}

export async function createBomLine(payload: BomLineMutationPayload & { bomId: string }): Promise<BomLineCatalogItem> {
  const { data } = await api.post<BomLineCatalogItem>('/api/master-data/bom-lines', payload);
  return data;
}

export async function updateBomLine(id: string, payload: BomLineMutationPayload): Promise<BomLineCatalogItem> {
  const { data } = await api.patch<BomLineCatalogItem>(`/api/master-data/bom-lines/${id}`, payload);
  return data;
}

export async function deleteBomLine(id: string): Promise<{ success: true }> {
  const { data } = await api.delete<{ success: true }>(`/api/master-data/bom-lines/${id}`);
  return data;
}

export async function fetchPhaseEquipment(): Promise<PhaseEquipmentCatalogItem[]> {
  const { data } = await api.get<PhaseEquipmentCatalogItem[]>('/api/master-data/phase-equipment');
  return data;
}

export async function createPhaseEquipment(payload: PhaseEquipmentMutationPayload): Promise<PhaseEquipmentCatalogItem> {
  const { data } = await api.post<PhaseEquipmentCatalogItem>('/api/master-data/phase-equipment', payload);
  return data;
}

export async function updatePhaseEquipment(id: string, payload: PhaseEquipmentMutationPayload): Promise<PhaseEquipmentCatalogItem> {
  const { data } = await api.patch<PhaseEquipmentCatalogItem>(`/api/master-data/phase-equipment/${id}`, payload);
  return data;
}

export async function deletePhaseEquipment(id: string): Promise<{ success: true }> {
  const { data } = await api.delete<{ success: true }>(`/api/master-data/phase-equipment/${id}`);
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

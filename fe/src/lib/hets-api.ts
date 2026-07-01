import api from './api';

export interface HetSummary {
  id: string;
  hetNumber: string | null;
  clinicName: string | null;
  quantity: number | null;
  usedById: string | null;
  finishedById: string | null;
  deleted: boolean;
}

export async function fetchHets(): Promise<HetSummary[]> {
  const { data } = await api.get<HetSummary[]>('/api/hets');
  return Array.isArray(data) ? data : [];
}

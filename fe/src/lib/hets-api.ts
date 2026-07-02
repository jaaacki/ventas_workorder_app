import api from './api';
import type { InventoryGenealogyEdge, InventoryLot, InventoryTransaction } from './inventory-api';

export interface HetSummary {
  id: string;
  hetNumber: string | null;
  clinicName: string | null;
  quantity: number | null;
  usedById: string | null;
  finishedById: string | null;
  deleted: boolean;
}

export interface HetInventoryTrace {
  subject: { type: 'het'; id: string; label?: string | null };
  lots: InventoryLot[];
  transactions: InventoryTransaction[];
  genealogy: InventoryGenealogyEdge[];
  consumptions: Array<{
    id: string;
    workOrderId: string;
    inventoryLotId: string | null;
    inventorySkuId: string | null;
    bomLineId: string | null;
    quantity: string | number | null;
    uom: string | null;
  }>;
  workOrders: Array<{ id: string; woNumber: string | null; hetId: string | null; phaseOrder: number | null }>;
  hets: Array<{ id: string; hetNumber: string | null; collectionUnitId: string | null; usedById: string | null; finishedById: string | null }>;
}

export async function fetchHets(): Promise<HetSummary[]> {
  const { data } = await api.get<HetSummary[]>('/api/hets');
  return Array.isArray(data) ? data : [];
}

export async function fetchHetInventoryTrace(id: string): Promise<HetInventoryTrace> {
  const { data } = await api.get<HetInventoryTrace>(`/api/hets/${encodeURIComponent(id)}/inventory-trace`);
  return data;
}

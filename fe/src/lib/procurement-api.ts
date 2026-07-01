import api from './api';
import type { InventoryGenealogyEdge, InventoryLot, InventoryTransaction } from './inventory-api';

export interface ProcurementOverview {
  supplyEntities: number;
  collectionPoints: number;
  unitsTotal: number;
  unitsOperational: number;
  unitsPlaceholder: number;
  issuanceOrders: number;
  collectionOrders: number;
  collectionReceipts: number;
  linkedHets: number;
}

export interface SupplyEntity {
  id: string;
  name: string | null;
  legalName: string | null;
  externalCode: string | null;
  legacyClinicId: string | null;
}

export interface CollectionPoint {
  id: string;
  supplyEntityId: string;
  displayName: string | null;
  hciCode: string | null;
  address: string | null;
  legacyClinicId: string | null;
}

export interface CollectionUnit {
  id: string;
  tenantId?: string;
  supplyEntityId: string | null;
  collectionPointId: string | null;
  legacyHetId: string | null;
  unitNumber: string | null;
  parcelTrackingNumber: string | null;
  status: string;
  legacyDeliverId?: string | null;
  legacyCollectId?: string | null;
  legacyUsedByWorkOrderId: string | null;
  legacyNextHetId?: string | null;
  sourceSystem: string | null;
  linkCompleteness: string | null;
  semanticConfidence: string | null;
  hiddenFromOperations: boolean;
  deleted?: boolean;
  createdAt?: string;
  updatedAt: string;
}

export interface IssuanceOrderLine {
  id: string;
  issuanceOrderId: string;
  collectionUnitId: string | null;
  legacyHetId: string | null;
  legacyHetNumber: string | null;
  parcelTrackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionUnitFulfilment {
  id: string;
  collectionUnitId: string;
  fulfilledAt: string | null;
  fulfilledBy: string | null;
  source: string | null;
  evidencePath: string | null;
  remarks: string | null;
  inferred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionReceiptLine {
  id: string;
  collectionReceiptId: string;
  collectionUnitId: string | null;
  conditionStatus: string | null;
  acceptanceStatus: string | null;
  resultingHetId: string | null;
  discrepancyReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionUnitHet {
  id: string;
  hetNumber: string | null;
  clinicName: string | null;
  usedById: string | null;
  finishedById: string | null;
}

export interface CollectionUnitDetail extends CollectionUnit {
  legacyRaw: unknown | null;
  issuanceLines: IssuanceOrderLine[];
  fulfilments: CollectionUnitFulfilment[];
  receiptLines: CollectionReceiptLine[];
  hets: CollectionUnitHet[];
}

export interface CollectionUnitInventoryTrace {
  subject: { type: 'collectionUnit'; id: string; label?: string | null };
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

export interface ProcurementEvent {
  id: string;
  status?: string;
  legacyDirection?: string | null;
  semanticConfidence?: string | null;
  legacyConflatedOrderReceipt?: boolean;
  issuedAt?: string | null;
  requestedAt?: string | null;
  receivedAt?: string | null;
  legacyDeliverCollectId?: string | null;
  legacyCollectDeliverCollectId?: string | null;
}

export async function fetchProcurementOverview(): Promise<ProcurementOverview> {
  const { data } = await api.get<ProcurementOverview>('/api/procurement/overview');
  return data;
}

export async function fetchSupplyEntities(): Promise<SupplyEntity[]> {
  const { data } = await api.get<SupplyEntity[]>('/api/procurement/supply-entities');
  return data;
}

export async function fetchCollectionPoints(): Promise<CollectionPoint[]> {
  const { data } = await api.get<CollectionPoint[]>('/api/procurement/collection-points');
  return data;
}

export async function fetchCollectionUnits(includeHidden = false, q = ''): Promise<CollectionUnit[]> {
  const { data } = await api.get<CollectionUnit[]>('/api/procurement/collection-units', {
    params: { includeHidden: includeHidden ? 'true' : 'false', q: q || undefined, take: 300 },
  });
  return data;
}

export async function fetchCollectionUnit(id: string): Promise<CollectionUnitDetail> {
  const { data } = await api.get<CollectionUnitDetail>(`/api/procurement/collection-units/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchCollectionUnitInventoryTrace(id: string): Promise<CollectionUnitInventoryTrace> {
  const { data } = await api.get<CollectionUnitInventoryTrace>(`/api/procurement/collection-units/${encodeURIComponent(id)}/inventory-trace`);
  return data;
}

export async function fetchIssuanceOrders(): Promise<ProcurementEvent[]> {
  const { data } = await api.get<ProcurementEvent[]>('/api/procurement/issuance-orders');
  return data;
}

export async function fetchCollectionOrders(): Promise<ProcurementEvent[]> {
  const { data } = await api.get<ProcurementEvent[]>('/api/procurement/collection-orders');
  return data;
}

export async function fetchCollectionReceipts(): Promise<ProcurementEvent[]> {
  const { data } = await api.get<ProcurementEvent[]>('/api/procurement/collection-receipts');
  return data;
}

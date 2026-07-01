import api from './api';

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
  supplyEntityId: string | null;
  collectionPointId: string | null;
  legacyHetId: string | null;
  unitNumber: string | null;
  parcelTrackingNumber: string | null;
  status: string;
  legacyUsedByWorkOrderId: string | null;
  sourceSystem: string | null;
  linkCompleteness: string | null;
  semanticConfidence: string | null;
  hiddenFromOperations: boolean;
  updatedAt: string;
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

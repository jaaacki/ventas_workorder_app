import api from './api';
import type { ArchiveResult, AuditEvent, ErpListOptions, InventoryGenealogyEdge, InventoryLot, InventoryTransaction } from './inventory-api';

export interface ProcurementRecordMetadata {
  tenantId?: string;
  deleted?: boolean;
  deletedAt?: string | null;
  deletedById?: string | null;
  createdById?: string | null;
  updatedById?: string | null;
  legacyRaw?: unknown | null;
  createdAt?: string;
  updatedAt: string;
}

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

export interface SupplyEntity extends ProcurementRecordMetadata {
  id: string;
  name: string | null;
  legalName: string | null;
  externalCode: string | null;
  sourceSystem?: string | null;
  legacyGroupKey?: string | null;
  legacyClinicId: string | null;
}

export interface CollectionPoint extends ProcurementRecordMetadata {
  id: string;
  supplyEntityId: string;
  displayName: string | null;
  hciCode: string | null;
  licenseName?: string | null;
  address: string | null;
  postalCode?: string | null;
  telephone?: string | null;
  personInCharge?: string | null;
  legacyClinicId: string | null;
}

export interface CollectionUnit extends ProcurementRecordMetadata {
  id: string;
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
}

export interface IssuanceOrderLine extends ProcurementRecordMetadata {
  id: string;
  issuanceOrderId: string;
  collectionUnitId: string | null;
  itemCode: string | null;
  quantity: string | number | null;
  uom: string | null;
  legacyHetId: string | null;
  legacyHetNumber: string | null;
  parcelTrackingNumber: string | null;
}

export interface CollectionUnitFulfilment extends ProcurementRecordMetadata {
  id: string;
  collectionUnitId: string;
  fulfilledAt: string | null;
  fulfilledBy: string | null;
  source: string | null;
  evidencePath: string | null;
  remarks: string | null;
  inferred: boolean;
}

export interface CollectionReceiptLine extends ProcurementRecordMetadata {
  id: string;
  collectionReceiptId: string;
  collectionUnitId: string | null;
  itemCode: string | null;
  quantity: string | number | null;
  uom: string | null;
  conditionStatus: string | null;
  acceptanceStatus: string | null;
  resultingHetId: string | null;
  discrepancyReason: string | null;
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

export interface ProcurementEvent extends ProcurementRecordMetadata {
  id: string;
  status?: string;
  supplyEntityId?: string | null;
  collectionPointId?: string | null;
  legacyDirection?: string | null;
  semanticConfidence?: string | null;
  legacyConflatedOrderReceipt?: boolean;
  issuedAt?: string | null;
  issuedBy?: string | null;
  requestedAt?: string | null;
  scheduledFor?: string | null;
  requestedBy?: string | null;
  receivedAt?: string | null;
  receivedBy?: string | null;
  signaturePath?: string | null;
  acceptanceState?: string | null;
  legacyDeliverCollectId?: string | null;
  legacyCollectDeliverCollectId?: string | null;
  collectionOrderId?: string | null;
  level?: string | null;
  remarks?: string | null;
}

export interface ProcurementImportReport {
  id: string;
  tenantId?: string;
  source: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  deletedById?: string | null;
  report: unknown;
}

export type SupplyEntityPayload = {
  name?: string | null;
  legalName?: string | null;
  externalCode?: string | null;
  sourceSystem?: string | null;
  legacyGroupKey?: string | null;
  legacyClinicId?: string | null;
};

export type CollectionPointPayload = {
  supplyEntityId?: string;
  legacyClinicId?: string | null;
  hciCode?: string | null;
  displayName?: string | null;
  licenseName?: string | null;
  address?: string | null;
  postalCode?: string | null;
  telephone?: string | null;
  personInCharge?: string | null;
};

export type CollectionUnitPayload = {
  supplyEntityId?: string | null;
  collectionPointId?: string | null;
  legacyHetId?: string | null;
  unitNumber?: string | null;
  parcelTrackingNumber?: string | null;
  status?: string;
  legacyDeliverId?: string | null;
  legacyCollectId?: string | null;
  legacyUsedByWorkOrderId?: string | null;
  legacyNextHetId?: string | null;
  sourceSystem?: string | null;
  linkCompleteness?: string | null;
  semanticConfidence?: string | null;
  hiddenFromOperations?: boolean;
};

export type IssuanceOrderPayload = {
  supplyEntityId?: string | null;
  collectionPointId?: string | null;
  issuedAt?: string | null;
  issuedBy?: string | null;
  legacyDeliverCollectId?: string | null;
  legacyDirection?: string | null;
  semanticConfidence?: string | null;
  level?: string | null;
  remarks?: string | null;
};

export type IssuanceOrderLinePayload = {
  issuanceOrderId?: string;
  collectionUnitId?: string | null;
  itemCode?: string | null;
  quantity?: string | number | null;
  uom?: string | null;
  legacyHetId?: string | null;
  legacyHetNumber?: string | null;
  parcelTrackingNumber?: string | null;
};

export type CollectionUnitFulfilmentPayload = {
  collectionUnitId?: string;
  fulfilledAt?: string | null;
  fulfilledBy?: string | null;
  source?: string | null;
  evidencePath?: string | null;
  remarks?: string | null;
  inferred?: boolean;
};

export type CollectionOrderPayload = {
  supplyEntityId?: string | null;
  collectionPointId?: string | null;
  requestedAt?: string | null;
  scheduledFor?: string | null;
  requestedBy?: string | null;
  status?: string;
  legacyCollectDeliverCollectId?: string | null;
  legacyDirection?: string | null;
  semanticConfidence?: string | null;
  legacyConflatedOrderReceipt?: boolean;
  level?: string | null;
  remarks?: string | null;
};

export type CollectionReceiptPayload = {
  collectionOrderId?: string | null;
  receivedAt?: string | null;
  receivedBy?: string | null;
  signaturePath?: string | null;
  remarks?: string | null;
  legacyCollectDeliverCollectId?: string | null;
  legacyConflatedOrderReceipt?: boolean;
  acceptanceState?: string | null;
};

export type CollectionReceiptLinePayload = {
  collectionReceiptId?: string;
  collectionUnitId?: string | null;
  itemCode?: string | null;
  quantity?: string | number | null;
  uom?: string | null;
  conditionStatus?: string | null;
  acceptanceStatus?: string | null;
  resultingHetId?: string | null;
  discrepancyReason?: string | null;
};

export type ProcurementListOptions = ErpListOptions & {
  status?: string;
};

export type CollectionPointListOptions = ProcurementListOptions & {
  supplyEntityId?: string;
};

export type CollectionUnitListOptions = ProcurementListOptions & {
  includeHidden?: boolean;
  supplyEntityId?: string;
  collectionPointId?: string;
};

export type ProcurementEventListOptions = ProcurementListOptions & {
  supplyEntityId?: string;
  collectionPointId?: string;
};

export type IssuanceOrderLineListOptions = ProcurementListOptions & {
  issuanceOrderId?: string;
  collectionUnitId?: string;
};

export type CollectionUnitFulfilmentListOptions = ProcurementListOptions & {
  collectionUnitId?: string;
};

export type CollectionReceiptLineListOptions = ProcurementListOptions & {
  collectionReceiptId?: string;
  collectionUnitId?: string;
};

function listParams(options: ErpListOptions = {}, includeDefaultTake = true) {
  return {
    q: options.q || undefined,
    take: options.take ?? (includeDefaultTake ? 300 : undefined),
    includeDeleted: options.includeDeleted ? 'true' : undefined,
  };
}

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

export async function fetchProcurementOverview(): Promise<ProcurementOverview> {
  const { data } = await api.get<ProcurementOverview>('/api/procurement/overview');
  return data;
}

export async function fetchSupplyEntities(options: ProcurementListOptions = {}): Promise<SupplyEntity[]> {
  const { data } = await api.get<SupplyEntity[]>('/api/procurement/supply-entities', {
    params: { ...listParams(options, false), status: options.status || undefined },
  });
  return data;
}

export async function fetchSupplyEntity(id: string): Promise<SupplyEntity> {
  const { data } = await api.get<SupplyEntity>(`/api/procurement/supply-entities/${encodeId(id)}`);
  return data;
}

export async function createSupplyEntity(payload: SupplyEntityPayload): Promise<SupplyEntity> {
  const { data } = await api.post<SupplyEntity>('/api/procurement/supply-entities', payload);
  return data;
}

export async function updateSupplyEntity(id: string, payload: SupplyEntityPayload): Promise<SupplyEntity> {
  const { data } = await api.patch<SupplyEntity>(`/api/procurement/supply-entities/${encodeId(id)}`, payload);
  return data;
}

export async function archiveSupplyEntity(id: string): Promise<ArchiveResult<SupplyEntity>> {
  const { data } = await api.delete<ArchiveResult<SupplyEntity>>(`/api/procurement/supply-entities/${encodeId(id)}`);
  return data;
}

export async function restoreSupplyEntity(id: string): Promise<SupplyEntity> {
  const { data } = await api.patch<SupplyEntity>(`/api/procurement/supply-entities/${encodeId(id)}/restore`);
  return data;
}

export async function fetchSupplyEntityAudit(id: string): Promise<AuditEvent<SupplyEntity>[]> {
  const { data } = await api.get<AuditEvent<SupplyEntity>[]>(`/api/procurement/supply-entities/${encodeId(id)}/audit`);
  return data;
}

export async function fetchCollectionPoints(options: CollectionPointListOptions = {}): Promise<CollectionPoint[]> {
  const { data } = await api.get<CollectionPoint[]>('/api/procurement/collection-points', {
    params: {
      ...listParams(options, false),
      status: options.status || undefined,
      supplyEntityId: options.supplyEntityId || undefined,
    },
  });
  return data;
}

export async function fetchCollectionPoint(id: string): Promise<CollectionPoint> {
  const { data } = await api.get<CollectionPoint>(`/api/procurement/collection-points/${encodeId(id)}`);
  return data;
}

export async function createCollectionPoint(payload: CollectionPointPayload): Promise<CollectionPoint> {
  const { data } = await api.post<CollectionPoint>('/api/procurement/collection-points', payload);
  return data;
}

export async function updateCollectionPoint(id: string, payload: CollectionPointPayload): Promise<CollectionPoint> {
  const { data } = await api.patch<CollectionPoint>(`/api/procurement/collection-points/${encodeId(id)}`, payload);
  return data;
}

export async function archiveCollectionPoint(id: string): Promise<ArchiveResult<CollectionPoint>> {
  const { data } = await api.delete<ArchiveResult<CollectionPoint>>(`/api/procurement/collection-points/${encodeId(id)}`);
  return data;
}

export async function restoreCollectionPoint(id: string): Promise<CollectionPoint> {
  const { data } = await api.patch<CollectionPoint>(`/api/procurement/collection-points/${encodeId(id)}/restore`);
  return data;
}

export async function fetchCollectionPointAudit(id: string): Promise<AuditEvent<CollectionPoint>[]> {
  const { data } = await api.get<AuditEvent<CollectionPoint>[]>(`/api/procurement/collection-points/${encodeId(id)}/audit`);
  return data;
}

export async function fetchCollectionUnits(
  includeHiddenOrOptions: boolean | CollectionUnitListOptions = false,
  q = '',
): Promise<CollectionUnit[]> {
  const options = typeof includeHiddenOrOptions === 'boolean' ? { includeHidden: includeHiddenOrOptions, q } : includeHiddenOrOptions;
  const { data } = await api.get<CollectionUnit[]>('/api/procurement/collection-units', {
    params: {
      ...listParams(options),
      includeHidden: options.includeHidden ? 'true' : 'false',
      status: options.status || undefined,
      supplyEntityId: options.supplyEntityId || undefined,
      collectionPointId: options.collectionPointId || undefined,
    },
  });
  return data;
}

export async function fetchCollectionUnit(id: string): Promise<CollectionUnitDetail> {
  const { data } = await api.get<CollectionUnitDetail>(`/api/procurement/collection-units/${encodeId(id)}`);
  return data;
}

export async function createCollectionUnit(payload: CollectionUnitPayload): Promise<CollectionUnitDetail> {
  const { data } = await api.post<CollectionUnitDetail>('/api/procurement/collection-units', payload);
  return data;
}

export async function updateCollectionUnit(id: string, payload: CollectionUnitPayload): Promise<CollectionUnitDetail> {
  const { data } = await api.patch<CollectionUnitDetail>(`/api/procurement/collection-units/${encodeId(id)}`, payload);
  return data;
}

export async function archiveCollectionUnit(id: string): Promise<ArchiveResult<CollectionUnitDetail>> {
  const { data } = await api.delete<ArchiveResult<CollectionUnitDetail>>(`/api/procurement/collection-units/${encodeId(id)}`);
  return data;
}

export async function restoreCollectionUnit(id: string): Promise<CollectionUnitDetail> {
  const { data } = await api.patch<CollectionUnitDetail>(`/api/procurement/collection-units/${encodeId(id)}/restore`);
  return data;
}

export async function fetchCollectionUnitAudit(id: string): Promise<AuditEvent<CollectionUnit>[]> {
  const { data } = await api.get<AuditEvent<CollectionUnit>[]>(`/api/procurement/collection-units/${encodeId(id)}/audit`);
  return data;
}

export async function fetchCollectionUnitInventoryTrace(id: string): Promise<CollectionUnitInventoryTrace> {
  const { data } = await api.get<CollectionUnitInventoryTrace>(`/api/procurement/collection-units/${encodeId(id)}/inventory-trace`);
  return data;
}

export async function fetchIssuanceOrders(options: ProcurementEventListOptions = {}): Promise<ProcurementEvent[]> {
  const { data } = await api.get<ProcurementEvent[]>('/api/procurement/issuance-orders', {
    params: {
      ...listParams(options, false),
      status: options.status || undefined,
      supplyEntityId: options.supplyEntityId || undefined,
      collectionPointId: options.collectionPointId || undefined,
    },
  });
  return data;
}

export async function fetchIssuanceOrder(id: string): Promise<ProcurementEvent> {
  const { data } = await api.get<ProcurementEvent>(`/api/procurement/issuance-orders/${encodeId(id)}`);
  return data;
}

export async function createIssuanceOrder(payload: IssuanceOrderPayload): Promise<ProcurementEvent> {
  const { data } = await api.post<ProcurementEvent>('/api/procurement/issuance-orders', payload);
  return data;
}

export async function updateIssuanceOrder(id: string, payload: IssuanceOrderPayload): Promise<ProcurementEvent> {
  const { data } = await api.patch<ProcurementEvent>(`/api/procurement/issuance-orders/${encodeId(id)}`, payload);
  return data;
}

export async function archiveIssuanceOrder(id: string): Promise<ArchiveResult<ProcurementEvent>> {
  const { data } = await api.delete<ArchiveResult<ProcurementEvent>>(`/api/procurement/issuance-orders/${encodeId(id)}`);
  return data;
}

export async function restoreIssuanceOrder(id: string): Promise<ProcurementEvent> {
  const { data } = await api.patch<ProcurementEvent>(`/api/procurement/issuance-orders/${encodeId(id)}/restore`);
  return data;
}

export async function fetchIssuanceOrderAudit(id: string): Promise<AuditEvent<ProcurementEvent>[]> {
  const { data } = await api.get<AuditEvent<ProcurementEvent>[]>(`/api/procurement/issuance-orders/${encodeId(id)}/audit`);
  return data;
}

export async function fetchIssuanceOrderLines(options: IssuanceOrderLineListOptions = {}): Promise<IssuanceOrderLine[]> {
  const { data } = await api.get<IssuanceOrderLine[]>('/api/procurement/issuance-order-lines', {
    params: {
      ...listParams(options, false),
      status: options.status || undefined,
      issuanceOrderId: options.issuanceOrderId || undefined,
      collectionUnitId: options.collectionUnitId || undefined,
    },
  });
  return data;
}

export async function fetchIssuanceOrderLine(id: string): Promise<IssuanceOrderLine> {
  const { data } = await api.get<IssuanceOrderLine>(`/api/procurement/issuance-order-lines/${encodeId(id)}`);
  return data;
}

export async function createIssuanceOrderLine(payload: IssuanceOrderLinePayload): Promise<IssuanceOrderLine> {
  const { data } = await api.post<IssuanceOrderLine>('/api/procurement/issuance-order-lines', payload);
  return data;
}

export async function updateIssuanceOrderLine(id: string, payload: IssuanceOrderLinePayload): Promise<IssuanceOrderLine> {
  const { data } = await api.patch<IssuanceOrderLine>(`/api/procurement/issuance-order-lines/${encodeId(id)}`, payload);
  return data;
}

export async function archiveIssuanceOrderLine(id: string): Promise<ArchiveResult<IssuanceOrderLine>> {
  const { data } = await api.delete<ArchiveResult<IssuanceOrderLine>>(`/api/procurement/issuance-order-lines/${encodeId(id)}`);
  return data;
}

export async function restoreIssuanceOrderLine(id: string): Promise<IssuanceOrderLine> {
  const { data } = await api.patch<IssuanceOrderLine>(`/api/procurement/issuance-order-lines/${encodeId(id)}/restore`);
  return data;
}

export async function fetchIssuanceOrderLineAudit(id: string): Promise<AuditEvent<IssuanceOrderLine>[]> {
  const { data } = await api.get<AuditEvent<IssuanceOrderLine>[]>(`/api/procurement/issuance-order-lines/${encodeId(id)}/audit`);
  return data;
}

export async function fetchCollectionUnitFulfilments(options: CollectionUnitFulfilmentListOptions = {}): Promise<CollectionUnitFulfilment[]> {
  const { data } = await api.get<CollectionUnitFulfilment[]>('/api/procurement/collection-unit-fulfilments', {
    params: { ...listParams(options, false), status: options.status || undefined, collectionUnitId: options.collectionUnitId || undefined },
  });
  return data;
}

export async function fetchCollectionUnitFulfilment(id: string): Promise<CollectionUnitFulfilment> {
  const { data } = await api.get<CollectionUnitFulfilment>(`/api/procurement/collection-unit-fulfilments/${encodeId(id)}`);
  return data;
}

export async function createCollectionUnitFulfilment(payload: CollectionUnitFulfilmentPayload): Promise<CollectionUnitFulfilment> {
  const { data } = await api.post<CollectionUnitFulfilment>('/api/procurement/collection-unit-fulfilments', payload);
  return data;
}

export async function updateCollectionUnitFulfilment(
  id: string,
  payload: CollectionUnitFulfilmentPayload,
): Promise<CollectionUnitFulfilment> {
  const { data } = await api.patch<CollectionUnitFulfilment>(`/api/procurement/collection-unit-fulfilments/${encodeId(id)}`, payload);
  return data;
}

export async function archiveCollectionUnitFulfilment(id: string): Promise<ArchiveResult<CollectionUnitFulfilment>> {
  const { data } = await api.delete<ArchiveResult<CollectionUnitFulfilment>>(`/api/procurement/collection-unit-fulfilments/${encodeId(id)}`);
  return data;
}

export async function restoreCollectionUnitFulfilment(id: string): Promise<CollectionUnitFulfilment> {
  const { data } = await api.patch<CollectionUnitFulfilment>(`/api/procurement/collection-unit-fulfilments/${encodeId(id)}/restore`);
  return data;
}

export async function fetchCollectionUnitFulfilmentAudit(id: string): Promise<AuditEvent<CollectionUnitFulfilment>[]> {
  const { data } = await api.get<AuditEvent<CollectionUnitFulfilment>[]>(`/api/procurement/collection-unit-fulfilments/${encodeId(id)}/audit`);
  return data;
}

export async function fetchCollectionOrders(options: ProcurementEventListOptions = {}): Promise<ProcurementEvent[]> {
  const { data } = await api.get<ProcurementEvent[]>('/api/procurement/collection-orders', {
    params: {
      ...listParams(options, false),
      status: options.status || undefined,
      supplyEntityId: options.supplyEntityId || undefined,
      collectionPointId: options.collectionPointId || undefined,
    },
  });
  return data;
}

export async function fetchCollectionOrder(id: string): Promise<ProcurementEvent> {
  const { data } = await api.get<ProcurementEvent>(`/api/procurement/collection-orders/${encodeId(id)}`);
  return data;
}

export async function createCollectionOrder(payload: CollectionOrderPayload): Promise<ProcurementEvent> {
  const { data } = await api.post<ProcurementEvent>('/api/procurement/collection-orders', payload);
  return data;
}

export async function updateCollectionOrder(id: string, payload: CollectionOrderPayload): Promise<ProcurementEvent> {
  const { data } = await api.patch<ProcurementEvent>(`/api/procurement/collection-orders/${encodeId(id)}`, payload);
  return data;
}

export async function archiveCollectionOrder(id: string): Promise<ArchiveResult<ProcurementEvent>> {
  const { data } = await api.delete<ArchiveResult<ProcurementEvent>>(`/api/procurement/collection-orders/${encodeId(id)}`);
  return data;
}

export async function restoreCollectionOrder(id: string): Promise<ProcurementEvent> {
  const { data } = await api.patch<ProcurementEvent>(`/api/procurement/collection-orders/${encodeId(id)}/restore`);
  return data;
}

export async function fetchCollectionOrderAudit(id: string): Promise<AuditEvent<ProcurementEvent>[]> {
  const { data } = await api.get<AuditEvent<ProcurementEvent>[]>(`/api/procurement/collection-orders/${encodeId(id)}/audit`);
  return data;
}

export async function fetchCollectionReceipts(options: ProcurementEventListOptions = {}): Promise<ProcurementEvent[]> {
  const { data } = await api.get<ProcurementEvent[]>('/api/procurement/collection-receipts', {
    params: {
      ...listParams(options, false),
      status: options.status || undefined,
      supplyEntityId: options.supplyEntityId || undefined,
      collectionPointId: options.collectionPointId || undefined,
    },
  });
  return data;
}

export async function fetchCollectionReceipt(id: string): Promise<ProcurementEvent> {
  const { data } = await api.get<ProcurementEvent>(`/api/procurement/collection-receipts/${encodeId(id)}`);
  return data;
}

export async function createCollectionReceipt(payload: CollectionReceiptPayload): Promise<ProcurementEvent> {
  const { data } = await api.post<ProcurementEvent>('/api/procurement/collection-receipts', payload);
  return data;
}

export async function updateCollectionReceipt(id: string, payload: CollectionReceiptPayload): Promise<ProcurementEvent> {
  const { data } = await api.patch<ProcurementEvent>(`/api/procurement/collection-receipts/${encodeId(id)}`, payload);
  return data;
}

export async function archiveCollectionReceipt(id: string): Promise<ArchiveResult<ProcurementEvent>> {
  const { data } = await api.delete<ArchiveResult<ProcurementEvent>>(`/api/procurement/collection-receipts/${encodeId(id)}`);
  return data;
}

export async function restoreCollectionReceipt(id: string): Promise<ProcurementEvent> {
  const { data } = await api.patch<ProcurementEvent>(`/api/procurement/collection-receipts/${encodeId(id)}/restore`);
  return data;
}

export async function fetchCollectionReceiptAudit(id: string): Promise<AuditEvent<ProcurementEvent>[]> {
  const { data } = await api.get<AuditEvent<ProcurementEvent>[]>(`/api/procurement/collection-receipts/${encodeId(id)}/audit`);
  return data;
}

export async function fetchCollectionReceiptLines(options: CollectionReceiptLineListOptions = {}): Promise<CollectionReceiptLine[]> {
  const { data } = await api.get<CollectionReceiptLine[]>('/api/procurement/collection-receipt-lines', {
    params: {
      ...listParams(options, false),
      status: options.status || undefined,
      collectionReceiptId: options.collectionReceiptId || undefined,
      collectionUnitId: options.collectionUnitId || undefined,
    },
  });
  return data;
}

export async function fetchCollectionReceiptLine(id: string): Promise<CollectionReceiptLine> {
  const { data } = await api.get<CollectionReceiptLine>(`/api/procurement/collection-receipt-lines/${encodeId(id)}`);
  return data;
}

export async function createCollectionReceiptLine(payload: CollectionReceiptLinePayload): Promise<CollectionReceiptLine> {
  const { data } = await api.post<CollectionReceiptLine>('/api/procurement/collection-receipt-lines', payload);
  return data;
}

export async function updateCollectionReceiptLine(id: string, payload: CollectionReceiptLinePayload): Promise<CollectionReceiptLine> {
  const { data } = await api.patch<CollectionReceiptLine>(`/api/procurement/collection-receipt-lines/${encodeId(id)}`, payload);
  return data;
}

export async function archiveCollectionReceiptLine(id: string): Promise<ArchiveResult<CollectionReceiptLine>> {
  const { data } = await api.delete<ArchiveResult<CollectionReceiptLine>>(`/api/procurement/collection-receipt-lines/${encodeId(id)}`);
  return data;
}

export async function restoreCollectionReceiptLine(id: string): Promise<CollectionReceiptLine> {
  const { data } = await api.patch<CollectionReceiptLine>(`/api/procurement/collection-receipt-lines/${encodeId(id)}/restore`);
  return data;
}

export async function fetchCollectionReceiptLineAudit(id: string): Promise<AuditEvent<CollectionReceiptLine>[]> {
  const { data } = await api.get<AuditEvent<CollectionReceiptLine>[]>(`/api/procurement/collection-receipt-lines/${encodeId(id)}/audit`);
  return data;
}

export async function fetchProcurementImportReports(options: ErpListOptions = {}): Promise<ProcurementImportReport[]> {
  const { data } = await api.get<ProcurementImportReport[]>('/api/procurement/import-reports', {
    params: listParams(options, false),
  });
  return data;
}

export async function fetchProcurementImportReport(id: string): Promise<ProcurementImportReport> {
  const { data } = await api.get<ProcurementImportReport>(`/api/procurement/import-reports/${encodeId(id)}`);
  return data;
}

export async function archiveProcurementImportReport(id: string): Promise<ArchiveResult<ProcurementImportReport>> {
  const { data } = await api.delete<ArchiveResult<ProcurementImportReport>>(`/api/procurement/import-reports/${encodeId(id)}`);
  return data;
}

export async function restoreProcurementImportReport(id: string): Promise<ProcurementImportReport> {
  const { data } = await api.patch<ProcurementImportReport>(`/api/procurement/import-reports/${encodeId(id)}/restore`);
  return data;
}

export async function fetchProcurementImportReportAudit(id: string): Promise<AuditEvent<ProcurementImportReport>[]> {
  const { data } = await api.get<AuditEvent<ProcurementImportReport>[]>(`/api/procurement/import-reports/${encodeId(id)}/audit`);
  return data;
}

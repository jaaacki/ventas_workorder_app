import api from './api';

export interface AuditEvent<TSnapshot = Record<string, unknown>> {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorEmail?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before: TSnapshot | null;
  after: TSnapshot | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ErpListOptions {
  q?: string;
  take?: number;
  includeDeleted?: boolean;
}

export type ArchiveResult<T> = T;

export interface ErpRecordMetadata {
  tenantId?: string;
  deleted?: boolean;
  deletedAt?: string | null;
  deletedById?: string | null;
  createdById?: string | null;
  updatedById?: string | null;
  legacyRaw?: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryOverview {
  skus: number;
  lots: number;
  transactions: number;
  locations: number;
  balances: number;
  importReports: number;
  hetLots: number;
  finishedGoodLots: number;
}

export interface InventoryReference extends ErpRecordMetadata {
  id: string;
  refType: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  sourceSystem: string | null;
}

export interface InventorySku extends ErpRecordMetadata {
  id: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  brand: string | null;
  size: string | null;
  colour: string | null;
  uom: string | null;
  packQuantity?: string | number | null;
  threshold?: string | number | null;
  serialisedMode: string | null;
  qrImagePath?: string | null;
  mediaUrl?: string | null;
  qrPrintPath?: string | null;
  sourceSystem: string | null;
}

export interface InventoryLocation extends ErpRecordMetadata {
  id: string;
  locationType: string;
  name: string;
  parentLocationId: string | null;
  description: string | null;
  imagePath: string | null;
  sourceSystem: string | null;
}

export interface InventoryLot extends ErpRecordMetadata {
  id: string;
  inventorySkuId: string | null;
  lotNumber: string | null;
  inventoryType: string;
  status: string;
  quantityInitial?: string | number | null;
  quantityCurrent?: string | number | null;
  uom: string | null;
  currentLocationId: string | null;
  collectionUnitId: string | null;
  hetId: string | null;
  workOrderId: string | null;
  sourceSystem: string | null;
  legacyItemSerialId: string | null;
  legacyCheckInOutId?: string | null;
  legacyHetId: string | null;
  inventorySku?: InventorySku | null;
  currentLocation?: InventoryLocation | null;
}

export interface InventoryTransaction extends ErpRecordMetadata {
  id: string;
  inventorySkuId: string | null;
  inventoryLotId: string | null;
  transactionType: string;
  direction: string | null;
  reason: string | null;
  quantity?: string | number | null;
  uom: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  workOrderId: string | null;
  occurredAt: string | null;
  actor: string | null;
  signaturePath: string | null;
  remarks: string | null;
  legacyRefNumber: string | null;
  legacyRefNumberOut: string | null;
  sourceSystem: string | null;
  inventorySku?: InventorySku | null;
  inventoryLot?: InventoryLot | null;
  fromLocation?: InventoryLocation | null;
  toLocation?: InventoryLocation | null;
}

export interface InventoryGenealogyEdge {
  id: string;
  tenantId?: string;
  parentInventoryLotId?: string;
  childInventoryLotId?: string;
  relationshipType: string;
  workOrderId?: string | null;
  phaseId?: string | null;
  sourceSystem?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  deletedById?: string | null;
  createdById?: string | null;
  updatedById?: string | null;
  legacyRaw?: unknown | null;
  createdAt?: string;
  updatedAt?: string;
  parentInventoryLot?: InventoryLot;
  childInventoryLot?: InventoryLot;
}

export interface InventoryGenealogy {
  id: string;
  lot: InventoryLot;
  parents: InventoryGenealogyEdge[];
  children: InventoryGenealogyEdge[];
}

export interface InventoryImportReport {
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

export interface InventoryBalance extends ErpRecordMetadata {
  id: string;
  inventorySkuId: string;
  inventoryLotId: string | null;
  inventoryLocationId: string | null;
  quantity: string | number | null;
  sourceSystem: string | null;
  inventorySku?: InventorySku;
  inventoryLot?: InventoryLot | null;
  inventoryLocation?: InventoryLocation | null;
}

export interface WorkOrderInventoryConsumption extends ErpRecordMetadata {
  id: string;
  workOrderId: string;
  inventoryLotId: string | null;
  inventorySkuId: string | null;
  bomLineId: string | null;
  quantity: string | number | null;
  uom: string | null;
  sourceSystem: string | null;
  inventoryLot?: InventoryLot | null;
}

export type InventoryReferencePayload = {
  refType?: string;
  name?: string;
  shortCode?: string | null;
  description?: string | null;
  sourceSystem?: string | null;
};

export type InventoryLocationPayload = {
  locationType?: string;
  name?: string;
  parentLocationId?: string | null;
  description?: string | null;
  imagePath?: string | null;
  sourceSystem?: string | null;
};

export type InventorySkuPayload = {
  sku?: string | null;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  size?: string | null;
  colour?: string | null;
  uom?: string | null;
  packQuantity?: string | number | null;
  threshold?: string | number | null;
  serialisedMode?: string | null;
  qrImagePath?: string | null;
  mediaUrl?: string | null;
  qrPrintPath?: string | null;
  sourceSystem?: string | null;
};

export type InventoryLotPayload = {
  inventorySkuId?: string | null;
  lotNumber?: string | null;
  inventoryType?: string;
  status?: string;
  quantityInitial?: string | number | null;
  quantityCurrent?: string | number | null;
  uom?: string | null;
  currentLocationId?: string | null;
  collectionUnitId?: string | null;
  hetId?: string | null;
  workOrderId?: string | null;
  sourceSystem?: string | null;
  legacyItemSerialId?: string | null;
  legacyCheckInOutId?: string | null;
  legacyHetId?: string | null;
};

export type InventoryTransactionPayload = {
  inventorySkuId?: string | null;
  inventoryLotId?: string | null;
  transactionType?: string;
  direction?: string | null;
  reason?: string | null;
  quantity?: string | number | null;
  uom?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  workOrderId?: string | null;
  occurredAt?: string | null;
  actor?: string | null;
  signaturePath?: string | null;
  remarks?: string | null;
  legacyRefNumber?: string | null;
  legacyRefNumberOut?: string | null;
  sourceSystem?: string | null;
};

export type InventoryBalancePayload = {
  inventorySkuId?: string;
  inventoryLotId?: string | null;
  inventoryLocationId?: string | null;
  quantity?: string | number | null;
  sourceSystem?: string | null;
};

export type InventoryGenealogyPayload = {
  parentInventoryLotId?: string;
  childInventoryLotId?: string;
  relationshipType?: string;
  workOrderId?: string | null;
  phaseId?: string | null;
  sourceSystem?: string | null;
};

export type WorkOrderInventoryConsumptionPayload = {
  workOrderId?: string;
  inventoryLotId?: string | null;
  inventorySkuId?: string | null;
  bomLineId?: string | null;
  quantity?: string | number | null;
  uom?: string | null;
  sourceSystem?: string | null;
};

export type InventoryLotListOptions = ErpListOptions & {
  inventoryType?: string;
  status?: string;
};

export type InventoryReferenceListOptions = ErpListOptions & {
  refType?: string;
};

export type InventoryLocationListOptions = ErpListOptions & {
  locationType?: string;
  parentLocationId?: string | null;
};

export type InventoryBalanceListOptions = ErpListOptions & {
  inventorySkuId?: string;
  inventoryLotId?: string;
  inventoryLocationId?: string;
};

export type InventoryGenealogyListOptions = ErpListOptions & {
  parentInventoryLotId?: string;
  childInventoryLotId?: string;
  relationshipType?: string;
  workOrderId?: string;
};

export type WorkOrderInventoryConsumptionListOptions = ErpListOptions & {
  workOrderId?: string;
  inventoryLotId?: string;
  inventorySkuId?: string;
  bomLineId?: string;
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

export async function fetchInventoryOverview(): Promise<InventoryOverview> {
  const { data } = await api.get<InventoryOverview>('/api/inventory/overview');
  return data;
}

export async function fetchInventoryReferences(options: InventoryReferenceListOptions = {}): Promise<InventoryReference[]> {
  const { data } = await api.get<InventoryReference[]>('/api/inventory/references', {
    params: { ...listParams(options, false), refType: options.refType || undefined },
  });
  return data;
}

export async function fetchInventoryReference(id: string): Promise<InventoryReference> {
  const { data } = await api.get<InventoryReference>(`/api/inventory/references/${encodeId(id)}`);
  return data;
}

export async function createInventoryReference(payload: InventoryReferencePayload): Promise<InventoryReference> {
  const { data } = await api.post<InventoryReference>('/api/inventory/references', payload);
  return data;
}

export async function updateInventoryReference(id: string, payload: InventoryReferencePayload): Promise<InventoryReference> {
  const { data } = await api.patch<InventoryReference>(`/api/inventory/references/${encodeId(id)}`, payload);
  return data;
}

export async function archiveInventoryReference(id: string): Promise<ArchiveResult<InventoryReference>> {
  const { data } = await api.delete<ArchiveResult<InventoryReference>>(`/api/inventory/references/${encodeId(id)}`);
  return data;
}

export async function restoreInventoryReference(id: string): Promise<InventoryReference> {
  const { data } = await api.patch<InventoryReference>(`/api/inventory/references/${encodeId(id)}/restore`);
  return data;
}

export async function fetchInventoryReferenceAudit(id: string): Promise<AuditEvent<InventoryReference>[]> {
  const { data } = await api.get<AuditEvent<InventoryReference>[]>(`/api/inventory/references/${encodeId(id)}/audit`);
  return data;
}

export async function fetchInventorySkus(q: string | ErpListOptions = ''): Promise<InventorySku[]> {
  const options = typeof q === 'string' ? { q } : q;
  const { data } = await api.get<InventorySku[]>('/api/inventory/skus', {
    params: listParams(options),
  });
  return data;
}

export async function fetchInventorySku(id: string): Promise<InventorySku> {
  const { data } = await api.get<InventorySku>(`/api/inventory/skus/${encodeId(id)}`);
  return data;
}

export async function createInventorySku(payload: InventorySkuPayload): Promise<InventorySku> {
  const { data } = await api.post<InventorySku>('/api/inventory/skus', payload);
  return data;
}

export async function updateInventorySku(id: string, payload: InventorySkuPayload): Promise<InventorySku> {
  const { data } = await api.patch<InventorySku>(`/api/inventory/skus/${encodeId(id)}`, payload);
  return data;
}

export async function archiveInventorySku(id: string): Promise<ArchiveResult<InventorySku>> {
  const { data } = await api.delete<ArchiveResult<InventorySku>>(`/api/inventory/skus/${encodeId(id)}`);
  return data;
}

export async function restoreInventorySku(id: string): Promise<InventorySku> {
  const { data } = await api.patch<InventorySku>(`/api/inventory/skus/${encodeId(id)}/restore`);
  return data;
}

export async function fetchInventorySkuAudit(id: string): Promise<AuditEvent<InventorySku>[]> {
  const { data } = await api.get<AuditEvent<InventorySku>[]>(`/api/inventory/skus/${encodeId(id)}/audit`);
  return data;
}

export async function fetchInventoryLots(options: InventoryLotListOptions = {}): Promise<InventoryLot[]> {
  const { data } = await api.get<InventoryLot[]>('/api/inventory/lots', {
    params: {
      ...listParams(options),
      inventoryType: options.inventoryType || undefined,
      status: options.status || undefined,
    },
  });
  return data;
}

export async function fetchInventoryLot(id: string): Promise<InventoryLot> {
  const { data } = await api.get<InventoryLot>(`/api/inventory/lots/${encodeId(id)}`);
  return data;
}

export async function createInventoryLot(payload: InventoryLotPayload): Promise<InventoryLot> {
  const { data } = await api.post<InventoryLot>('/api/inventory/lots', payload);
  return data;
}

export async function updateInventoryLot(id: string, payload: InventoryLotPayload): Promise<InventoryLot> {
  const { data } = await api.patch<InventoryLot>(`/api/inventory/lots/${encodeId(id)}`, payload);
  return data;
}

export async function archiveInventoryLot(id: string): Promise<ArchiveResult<InventoryLot>> {
  const { data } = await api.delete<ArchiveResult<InventoryLot>>(`/api/inventory/lots/${encodeId(id)}`);
  return data;
}

export async function restoreInventoryLot(id: string): Promise<InventoryLot> {
  const { data } = await api.patch<InventoryLot>(`/api/inventory/lots/${encodeId(id)}/restore`);
  return data;
}

export async function fetchInventoryLotAudit(id: string): Promise<AuditEvent<InventoryLot>[]> {
  const { data } = await api.get<AuditEvent<InventoryLot>[]>(`/api/inventory/lots/${encodeId(id)}/audit`);
  return data;
}

export async function fetchInventoryTransactions(q: string | ErpListOptions = ''): Promise<InventoryTransaction[]> {
  const options = typeof q === 'string' ? { q } : q;
  const { data } = await api.get<InventoryTransaction[]>('/api/inventory/transactions', {
    params: listParams(options),
  });
  return data;
}

export async function fetchInventoryTransaction(id: string): Promise<InventoryTransaction> {
  const { data } = await api.get<InventoryTransaction>(`/api/inventory/transactions/${encodeId(id)}`);
  return data;
}

export async function createInventoryTransaction(payload: InventoryTransactionPayload): Promise<InventoryTransaction> {
  const { data } = await api.post<InventoryTransaction>('/api/inventory/transactions', payload);
  return data;
}

export async function updateInventoryTransaction(id: string, payload: InventoryTransactionPayload): Promise<InventoryTransaction> {
  const { data } = await api.patch<InventoryTransaction>(`/api/inventory/transactions/${encodeId(id)}`, payload);
  return data;
}

export async function archiveInventoryTransaction(id: string): Promise<ArchiveResult<InventoryTransaction>> {
  const { data } = await api.delete<ArchiveResult<InventoryTransaction>>(`/api/inventory/transactions/${encodeId(id)}`);
  return data;
}

export async function restoreInventoryTransaction(id: string): Promise<InventoryTransaction> {
  const { data } = await api.patch<InventoryTransaction>(`/api/inventory/transactions/${encodeId(id)}/restore`);
  return data;
}

export async function fetchInventoryTransactionAudit(id: string): Promise<AuditEvent<InventoryTransaction>[]> {
  const { data } = await api.get<AuditEvent<InventoryTransaction>[]>(`/api/inventory/transactions/${encodeId(id)}/audit`);
  return data;
}

export async function fetchInventoryLocations(options: InventoryLocationListOptions = {}): Promise<InventoryLocation[]> {
  const { data } = await api.get<InventoryLocation[]>('/api/inventory/locations', {
    params: {
      ...listParams(options, false),
      locationType: options.locationType || undefined,
      parentLocationId: options.parentLocationId || undefined,
    },
  });
  return data;
}

export async function fetchInventoryLocation(id: string): Promise<InventoryLocation> {
  const { data } = await api.get<InventoryLocation>(`/api/inventory/locations/${encodeId(id)}`);
  return data;
}

export async function createInventoryLocation(payload: InventoryLocationPayload): Promise<InventoryLocation> {
  const { data } = await api.post<InventoryLocation>('/api/inventory/locations', payload);
  return data;
}

export async function updateInventoryLocation(id: string, payload: InventoryLocationPayload): Promise<InventoryLocation> {
  const { data } = await api.patch<InventoryLocation>(`/api/inventory/locations/${encodeId(id)}`, payload);
  return data;
}

export async function archiveInventoryLocation(id: string): Promise<ArchiveResult<InventoryLocation>> {
  const { data } = await api.delete<ArchiveResult<InventoryLocation>>(`/api/inventory/locations/${encodeId(id)}`);
  return data;
}

export async function restoreInventoryLocation(id: string): Promise<InventoryLocation> {
  const { data } = await api.patch<InventoryLocation>(`/api/inventory/locations/${encodeId(id)}/restore`);
  return data;
}

export async function fetchInventoryLocationAudit(id: string): Promise<AuditEvent<InventoryLocation>[]> {
  const { data } = await api.get<AuditEvent<InventoryLocation>[]>(`/api/inventory/locations/${encodeId(id)}/audit`);
  return data;
}

export async function fetchInventoryGenealogy(lotId: string): Promise<InventoryGenealogy> {
  const { data } = await api.get<InventoryGenealogy>(`/api/inventory/lots/${encodeId(lotId)}/genealogy`);
  return data;
}

export async function fetchInventoryGenealogyLinks(options: InventoryGenealogyListOptions = {}): Promise<InventoryGenealogyEdge[]> {
  const { data } = await api.get<InventoryGenealogyEdge[]>('/api/inventory/genealogy', {
    params: {
      ...listParams(options, false),
      parentInventoryLotId: options.parentInventoryLotId || undefined,
      childInventoryLotId: options.childInventoryLotId || undefined,
      relationshipType: options.relationshipType || undefined,
      workOrderId: options.workOrderId || undefined,
    },
  });
  return data;
}

export async function fetchInventoryGenealogyLink(id: string): Promise<InventoryGenealogyEdge> {
  const { data } = await api.get<InventoryGenealogyEdge>(`/api/inventory/genealogy/${encodeId(id)}`);
  return data;
}

export async function createInventoryGenealogy(payload: InventoryGenealogyPayload): Promise<InventoryGenealogyEdge> {
  const { data } = await api.post<InventoryGenealogyEdge>('/api/inventory/genealogy', payload);
  return data;
}

export async function updateInventoryGenealogy(id: string, payload: InventoryGenealogyPayload): Promise<InventoryGenealogyEdge> {
  const { data } = await api.patch<InventoryGenealogyEdge>(`/api/inventory/genealogy/${encodeId(id)}`, payload);
  return data;
}

export async function archiveInventoryGenealogy(id: string): Promise<ArchiveResult<InventoryGenealogyEdge>> {
  const { data } = await api.delete<ArchiveResult<InventoryGenealogyEdge>>(`/api/inventory/genealogy/${encodeId(id)}`);
  return data;
}

export async function restoreInventoryGenealogy(id: string): Promise<InventoryGenealogyEdge> {
  const { data } = await api.patch<InventoryGenealogyEdge>(`/api/inventory/genealogy/${encodeId(id)}/restore`);
  return data;
}

export async function fetchInventoryGenealogyAudit(id: string): Promise<AuditEvent<InventoryGenealogyEdge>[]> {
  const { data } = await api.get<AuditEvent<InventoryGenealogyEdge>[]>(`/api/inventory/genealogy/${encodeId(id)}/audit`);
  return data;
}

export async function fetchInventoryBalances(options: InventoryBalanceListOptions = {}): Promise<InventoryBalance[]> {
  const { data } = await api.get<InventoryBalance[]>('/api/inventory/balances', {
    params: {
      ...listParams(options, false),
      inventorySkuId: options.inventorySkuId || undefined,
      inventoryLotId: options.inventoryLotId || undefined,
      inventoryLocationId: options.inventoryLocationId || undefined,
    },
  });
  return data;
}

export async function fetchInventoryBalance(id: string): Promise<InventoryBalance> {
  const { data } = await api.get<InventoryBalance>(`/api/inventory/balances/${encodeId(id)}`);
  return data;
}

export async function createInventoryBalance(payload: InventoryBalancePayload): Promise<InventoryBalance> {
  const { data } = await api.post<InventoryBalance>('/api/inventory/balances', payload);
  return data;
}

export async function updateInventoryBalance(id: string, payload: InventoryBalancePayload): Promise<InventoryBalance> {
  const { data } = await api.patch<InventoryBalance>(`/api/inventory/balances/${encodeId(id)}`, payload);
  return data;
}

export async function archiveInventoryBalance(id: string): Promise<ArchiveResult<InventoryBalance>> {
  const { data } = await api.delete<ArchiveResult<InventoryBalance>>(`/api/inventory/balances/${encodeId(id)}`);
  return data;
}

export async function restoreInventoryBalance(id: string): Promise<InventoryBalance> {
  const { data } = await api.patch<InventoryBalance>(`/api/inventory/balances/${encodeId(id)}/restore`);
  return data;
}

export async function fetchInventoryBalanceAudit(id: string): Promise<AuditEvent<InventoryBalance>[]> {
  const { data } = await api.get<AuditEvent<InventoryBalance>[]>(`/api/inventory/balances/${encodeId(id)}/audit`);
  return data;
}

export async function fetchWorkOrderInventoryConsumptions(
  options: WorkOrderInventoryConsumptionListOptions = {},
): Promise<WorkOrderInventoryConsumption[]> {
  const { data } = await api.get<WorkOrderInventoryConsumption[]>('/api/inventory/work-order-consumptions', {
    params: {
      ...listParams(options, false),
      workOrderId: options.workOrderId || undefined,
      inventoryLotId: options.inventoryLotId || undefined,
      inventorySkuId: options.inventorySkuId || undefined,
      bomLineId: options.bomLineId || undefined,
    },
  });
  return data;
}

export async function fetchWorkOrderInventoryConsumption(id: string): Promise<WorkOrderInventoryConsumption> {
  const { data } = await api.get<WorkOrderInventoryConsumption>(`/api/inventory/work-order-consumptions/${encodeId(id)}`);
  return data;
}

export async function createWorkOrderInventoryConsumption(
  payload: WorkOrderInventoryConsumptionPayload,
): Promise<WorkOrderInventoryConsumption> {
  const { data } = await api.post<WorkOrderInventoryConsumption>('/api/inventory/work-order-consumptions', payload);
  return data;
}

export async function updateWorkOrderInventoryConsumption(
  id: string,
  payload: WorkOrderInventoryConsumptionPayload,
): Promise<WorkOrderInventoryConsumption> {
  const { data } = await api.patch<WorkOrderInventoryConsumption>(`/api/inventory/work-order-consumptions/${encodeId(id)}`, payload);
  return data;
}

export async function archiveWorkOrderInventoryConsumption(id: string): Promise<ArchiveResult<WorkOrderInventoryConsumption>> {
  const { data } = await api.delete<ArchiveResult<WorkOrderInventoryConsumption>>(`/api/inventory/work-order-consumptions/${encodeId(id)}`);
  return data;
}

export async function restoreWorkOrderInventoryConsumption(id: string): Promise<WorkOrderInventoryConsumption> {
  const { data } = await api.patch<WorkOrderInventoryConsumption>(`/api/inventory/work-order-consumptions/${encodeId(id)}/restore`);
  return data;
}

export async function fetchWorkOrderInventoryConsumptionAudit(id: string): Promise<AuditEvent<WorkOrderInventoryConsumption>[]> {
  const { data } = await api.get<AuditEvent<WorkOrderInventoryConsumption>[]>(`/api/inventory/work-order-consumptions/${encodeId(id)}/audit`);
  return data;
}

export async function fetchInventoryImportReports(options: ErpListOptions = {}): Promise<InventoryImportReport[]> {
  const { data } = await api.get<InventoryImportReport[]>('/api/inventory/import-reports', {
    params: listParams(options, false),
  });
  return data;
}

export async function fetchInventoryImportReport(id: string): Promise<InventoryImportReport> {
  const { data } = await api.get<InventoryImportReport>(`/api/inventory/import-reports/${encodeId(id)}`);
  return data;
}

export async function archiveInventoryImportReport(id: string): Promise<ArchiveResult<InventoryImportReport>> {
  const { data } = await api.delete<ArchiveResult<InventoryImportReport>>(`/api/inventory/import-reports/${encodeId(id)}`);
  return data;
}

export async function restoreInventoryImportReport(id: string): Promise<InventoryImportReport> {
  const { data } = await api.patch<InventoryImportReport>(`/api/inventory/import-reports/${encodeId(id)}/restore`);
  return data;
}

export async function fetchInventoryImportReportAudit(id: string): Promise<AuditEvent<InventoryImportReport>[]> {
  const { data } = await api.get<AuditEvent<InventoryImportReport>[]>(`/api/inventory/import-reports/${encodeId(id)}/audit`);
  return data;
}

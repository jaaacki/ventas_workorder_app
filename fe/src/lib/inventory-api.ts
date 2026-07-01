import api from './api';

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

export interface InventorySku {
  id: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  brand: string | null;
  size: string | null;
  colour: string | null;
  uom: string | null;
  serialisedMode: string | null;
  sourceSystem: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLocation {
  id: string;
  locationType: string;
  name: string;
  parentLocationId: string | null;
  description: string | null;
  imagePath: string | null;
  sourceSystem: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLot {
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
  legacyHetId: string | null;
  createdAt: string;
  updatedAt: string;
  inventorySku?: InventorySku | null;
  currentLocation?: InventoryLocation | null;
}

export interface InventoryTransaction {
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
  createdAt: string;
  updatedAt: string;
  inventorySku?: InventorySku | null;
  inventoryLot?: InventoryLot | null;
  fromLocation?: InventoryLocation | null;
  toLocation?: InventoryLocation | null;
}

export interface InventoryGenealogyEdge {
  id: string;
  relationshipType?: string;
  workOrderId?: string | null;
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
  source: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string | null;
  report: unknown;
}

export async function fetchInventoryOverview(): Promise<InventoryOverview> {
  const { data } = await api.get<InventoryOverview>('/api/inventory/overview');
  return data;
}

export async function fetchInventorySkus(q = ''): Promise<InventorySku[]> {
  const { data } = await api.get<InventorySku[]>('/api/inventory/skus', {
    params: { q: q || undefined, take: 300 },
  });
  return data;
}

export async function fetchInventoryLots(options: {
  q?: string;
  inventoryType?: string;
  status?: string;
} = {}): Promise<InventoryLot[]> {
  const { data } = await api.get<InventoryLot[]>('/api/inventory/lots', {
    params: {
      q: options.q || undefined,
      inventoryType: options.inventoryType || undefined,
      status: options.status || undefined,
      take: 300,
    },
  });
  return data;
}

export async function fetchInventoryTransactions(q = ''): Promise<InventoryTransaction[]> {
  const { data } = await api.get<InventoryTransaction[]>('/api/inventory/transactions', {
    params: { q: q || undefined, take: 300 },
  });
  return data;
}

export async function fetchInventoryLocations(): Promise<InventoryLocation[]> {
  const { data } = await api.get<InventoryLocation[]>('/api/inventory/locations');
  return data;
}

export async function fetchInventoryGenealogy(lotId: string): Promise<InventoryGenealogy> {
  const { data } = await api.get<InventoryGenealogy>(`/api/inventory/genealogy/${encodeURIComponent(lotId)}`);
  return data;
}

export async function fetchInventoryImportReports(): Promise<InventoryImportReport[]> {
  const { data } = await api.get<InventoryImportReport[]>('/api/inventory/import-reports');
  return data;
}

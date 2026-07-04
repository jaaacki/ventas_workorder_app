import api from './api';

// Finished-goods LOTs and their assembled batch records. Mints happen on QA
// release (see backend workOrderService.recordWorkOrderRelease); these reads
// reconstruct the record from immutable production tables.

export interface FinishedGoodLot {
  id: string;
  lotNumber: string | null;
  status: string;
  quantity: string | number | null;
  uom: string | null;
  product: string | null;
  releaseStatus: string | null;
  releasedAt: string | null;
  workOrderId: string | null;
  hetNumber: string | null;
  clinicName: string | null;
  createdAt: string;
}

export interface BatchRecordSku {
  id: string;
  sku: string | null;
  description: string | null;
}

export interface BatchRecordSerial {
  id: string;
  serialNumber: string | null;
  bomLine: {
    id: string;
    description: string | null;
    quantity: string | number | null;
    uom: string | null;
    inventorySku: BatchRecordSku | null;
  } | null;
}

export interface BatchRecordSignature {
  dataUrl: string;
  signer: string | null;
  at: string | null;
}

export interface BatchRecordSterilisation {
  id: string;
  direction: string | null;
  result: boolean | null;
  betReading: string | number | null;
  signOn: string | null;
  signer: string | null;
  signatureDataUrl: string | null;
}

export interface BatchRecordPhase {
  workOrderId: string;
  woNumber: string | null;
  phase: {
    id: string;
    phaseName: string | null;
    phaseShort: string | null;
    sortOrder: number | null;
    isGate: boolean;
  } | null;
  prodStart: string | null;
  prodEnd: string | null;
  prodDuration: string | number | null;
  outputQuantity: string | number | null;
  photoDataUrl: string | null;
  startSignature: BatchRecordSignature | null;
  endSignature: BatchRecordSignature | null;
  serials: BatchRecordSerial[];
  equipment: Array<{ phaseEquipId: string; equipId: string | null; name: string | null }>;
  sterilisations: BatchRecordSterilisation[];
}

export interface BatchRecord {
  lot: {
    id: string;
    lotNumber: string | null;
    inventoryType: string;
    status: string;
    quantityInitial: string | number | null;
    quantityCurrent: string | number | null;
    uom: string | null;
    createdAt: string;
  };
  manufacturer: { manuNumber: string | null; manuName: string | null } | null;
  release: {
    status: string | null;
    decisionAt: string | null;
    decidedBy: string | null;
    remarks: string | null;
  } | null;
  hetOrigin: {
    hetId: string;
    hetNumber: string | null;
    clinicName: string | null;
    HCICode: string | null;
  } | null;
  genealogyParents: Array<{
    id: string;
    lotNumber: string | null;
    inventoryType: string;
    hetId: string | null;
    relationshipType: string;
  }>;
  phases: BatchRecordPhase[];
}

export async function fetchFinishedGoodsLots(): Promise<FinishedGoodLot[]> {
  const { data } = await api.get<FinishedGoodLot[]>('/api/lots');
  return data;
}

export async function fetchBatchRecord(lotNumber: string): Promise<BatchRecord> {
  const { data } = await api.get<BatchRecord>(`/api/lots/${encodeURIComponent(lotNumber)}/batch-record`);
  return data;
}

// Same-origin URL for the on-demand PDF; the httpOnly auth cookie rides along on
// a direct browser navigation / download.
export function batchRecordPdfUrl(lotNumber: string): string {
  return `/api/lots/${encodeURIComponent(lotNumber)}/batch-record.pdf`;
}

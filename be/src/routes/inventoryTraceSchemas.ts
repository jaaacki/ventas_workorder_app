import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const dateish = z.union([z.date(), z.string()]);
const decimalish = z.union([z.number(), z.string(), z.custom<Prisma.Decimal>()]);

export const inventoryTraceSkuSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  sku: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  size: z.string().nullable(),
  colour: z.string().nullable(),
  uom: z.string().nullable(),
  packQuantity: decimalish.nullable(),
  threshold: decimalish.nullable(),
  serialisedMode: z.string().nullable(),
  qrImagePath: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  qrPrintPath: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

export const inventoryTraceLocationSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationType: z.string(),
  name: z.string(),
  parentLocationId: z.string().nullable(),
  description: z.string().nullable(),
  imagePath: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

export const inventoryTraceLotSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  inventorySkuId: z.string().nullable(),
  lotNumber: z.string().nullable(),
  inventoryType: z.string(),
  status: z.string(),
  quantityInitial: decimalish.nullable(),
  quantityCurrent: decimalish.nullable(),
  uom: z.string().nullable(),
  currentLocationId: z.string().nullable(),
  collectionUnitId: z.string().nullable(),
  hetId: z.string().nullable(),
  workOrderId: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyItemSerialId: z.string().nullable(),
  legacyCheckInOutId: z.string().nullable(),
  legacyHetId: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
  inventorySku: inventoryTraceSkuSchema.nullable().optional(),
  currentLocation: inventoryTraceLocationSchema.nullable().optional(),
});

export const inventoryTraceTransactionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  inventorySkuId: z.string().nullable(),
  inventoryLotId: z.string().nullable(),
  transactionType: z.string(),
  direction: z.string().nullable(),
  reason: z.string().nullable(),
  quantity: decimalish.nullable(),
  uom: z.string().nullable(),
  fromLocationId: z.string().nullable(),
  toLocationId: z.string().nullable(),
  workOrderId: z.string().nullable(),
  occurredAt: dateish.nullable(),
  actor: z.string().nullable(),
  signaturePath: z.string().nullable(),
  remarks: z.string().nullable(),
  legacyRefNumber: z.string().nullable(),
  legacyRefNumberOut: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
  inventorySku: inventoryTraceSkuSchema.nullable().optional(),
  inventoryLot: inventoryTraceLotSchema.nullable().optional(),
  fromLocation: inventoryTraceLocationSchema.nullable().optional(),
  toLocation: inventoryTraceLocationSchema.nullable().optional(),
});

export const workOrderInventoryConsumptionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  workOrderId: z.string(),
  inventoryLotId: z.string().nullable(),
  inventorySkuId: z.string().nullable(),
  bomLineId: z.string().nullable(),
  quantity: decimalish.nullable(),
  uom: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

export const inventoryTraceGenealogySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  parentInventoryLotId: z.string(),
  childInventoryLotId: z.string(),
  relationshipType: z.string(),
  workOrderId: z.string().nullable(),
  phaseId: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
  parentInventoryLot: inventoryTraceLotSchema,
  childInventoryLot: inventoryTraceLotSchema,
});

export const traceHetSchema = z.object({
  id: z.string(),
  hetNumber: z.string().nullable(),
  collectionUnitId: z.string().nullable(),
  usedById: z.string().nullable(),
  finishedById: z.string().nullable(),
});

export const traceWorkOrderSchema = z.object({
  id: z.string(),
  woNumber: z.string().nullable(),
  hetId: z.string().nullable(),
  phaseOrder: z.number().nullable(),
});

export const inventoryTraceSchema = z.object({
  subject: z.object({
    type: z.enum(['workOrder', 'collectionUnit', 'het']),
    id: z.string(),
    label: z.string().nullable().optional(),
  }),
  lots: z.array(inventoryTraceLotSchema),
  transactions: z.array(inventoryTraceTransactionSchema),
  consumptions: z.array(workOrderInventoryConsumptionSchema),
  genealogy: z.array(inventoryTraceGenealogySchema),
  hets: z.array(traceHetSchema),
  workOrders: z.array(traceWorkOrderSchema),
});

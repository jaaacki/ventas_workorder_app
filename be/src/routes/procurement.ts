import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { JwtPayload } from '../plugins/auth.js';
import * as procurementService from '../services/procurementService.js';
import * as inventoryTraceService from '../services/inventoryTraceService.js';
import { inventoryTraceSchema } from './inventoryTraceSchemas.js';

const errorResponse = z.object({ error: z.string() });
const dateish = z.union([z.date(), z.string()]);

const procurementOverviewSchema = z.object({
  supplyEntities: z.number(),
  collectionPoints: z.number(),
  unitsTotal: z.number(),
  unitsOperational: z.number(),
  unitsPlaceholder: z.number(),
  issuanceOrders: z.number(),
  collectionOrders: z.number(),
  collectionReceipts: z.number(),
  linkedHets: z.number(),
});

const supplyEntitySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().nullable(),
  legalName: z.string().nullable(),
  externalCode: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyGroupKey: z.string().nullable(),
  legacyClinicId: z.string().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

const collectionPointSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  supplyEntityId: z.string(),
  legacyClinicId: z.string().nullable(),
  hciCode: z.string().nullable(),
  displayName: z.string().nullable(),
  licenseName: z.string().nullable(),
  address: z.string().nullable(),
  postalCode: z.string().nullable(),
  telephone: z.string().nullable(),
  personInCharge: z.string().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

const collectionUnitSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  supplyEntityId: z.string().nullable(),
  collectionPointId: z.string().nullable(),
  legacyHetId: z.string().nullable(),
  unitNumber: z.string().nullable(),
  parcelTrackingNumber: z.string().nullable(),
  status: z.string(),
  legacyDeliverId: z.string().nullable(),
  legacyCollectId: z.string().nullable(),
  legacyUsedByWorkOrderId: z.string().nullable(),
  legacyNextHetId: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  linkCompleteness: z.string().nullable(),
  semanticConfidence: z.string().nullable(),
  hiddenFromOperations: z.boolean(),
  deleted: z.boolean(),
  createdAt: dateish,
  updatedAt: dateish,
});

const issuanceOrderLineSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  issuanceOrderId: z.string(),
  collectionUnitId: z.string().nullable(),
  legacyHetId: z.string().nullable(),
  legacyHetNumber: z.string().nullable(),
  parcelTrackingNumber: z.string().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

const collectionUnitFulfilmentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  collectionUnitId: z.string(),
  fulfilledAt: dateish.nullable(),
  fulfilledBy: z.string().nullable(),
  source: z.string().nullable(),
  evidencePath: z.string().nullable(),
  remarks: z.string().nullable(),
  inferred: z.boolean(),
  createdAt: dateish,
  updatedAt: dateish,
});

const collectionReceiptLineSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  collectionReceiptId: z.string(),
  collectionUnitId: z.string().nullable(),
  conditionStatus: z.string().nullable(),
  acceptanceStatus: z.string().nullable(),
  resultingHetId: z.string().nullable(),
  discrepancyReason: z.string().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

const collectionUnitDetailSchema = collectionUnitSchema
  .extend({
    legacyRaw: z.unknown().nullable(),
    issuanceLines: z.array(issuanceOrderLineSchema),
    fulfilments: z.array(collectionUnitFulfilmentSchema),
    receiptLines: z.array(collectionReceiptLineSchema),
    hets: z.array(
      z.object({
        id: z.string(),
        hetNumber: z.string().nullable(),
        clinicName: z.string().nullable(),
        usedById: z.string().nullable(),
        finishedById: z.string().nullable(),
      }),
    ),
  });

const issuanceOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  supplyEntityId: z.string().nullable(),
  collectionPointId: z.string().nullable(),
  issuedAt: dateish.nullable(),
  issuedBy: z.string().nullable(),
  legacyDeliverCollectId: z.string().nullable(),
  legacyDirection: z.string().nullable(),
  semanticConfidence: z.string().nullable(),
  level: z.string().nullable(),
  remarks: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

const collectionOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  supplyEntityId: z.string().nullable(),
  collectionPointId: z.string().nullable(),
  requestedAt: dateish.nullable(),
  scheduledFor: dateish.nullable(),
  requestedBy: z.string().nullable(),
  status: z.string(),
  legacyCollectDeliverCollectId: z.string().nullable(),
  legacyDirection: z.string().nullable(),
  semanticConfidence: z.string().nullable(),
  legacyConflatedOrderReceipt: z.boolean(),
  level: z.string().nullable(),
  remarks: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

const collectionReceiptSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  collectionOrderId: z.string().nullable(),
  receivedAt: dateish.nullable(),
  receivedBy: z.string().nullable(),
  signaturePath: z.string().nullable(),
  remarks: z.string().nullable(),
  legacyCollectDeliverCollectId: z.string().nullable(),
  legacyConflatedOrderReceipt: z.boolean(),
  acceptanceState: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  createdAt: dateish,
  updatedAt: dateish,
});

const importReportSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  source: z.string(),
  dryRun: z.boolean(),
  startedAt: dateish,
  finishedAt: dateish.nullable(),
  report: z.unknown(),
});

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export const procurementRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/overview',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement'],
        summary: 'Get procurement overview',
        description: 'Read aggregate procurement counts for the dashboard. Example: GET /api/procurement/overview.',
        operationId: 'getProcurementOverview',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: procurementOverviewSchema, 401: errorResponse },
      },
    },
    async (req) => procurementService.getProcurementOverview(tenantIdOf(req)),
  );

  app.get(
    '/supply-entities',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement'],
        summary: 'List supply entities',
        description: 'Read supplier or clinic groups imported from the procurement source data.',
        operationId: 'listSupplyEntities',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: z.array(supplyEntitySchema), 401: errorResponse },
      },
    },
    async (req) => procurementService.listSupplyEntities(tenantIdOf(req)),
  );

  app.get(
    '/collection-points',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement'],
        summary: 'List collection points',
        description: 'Read collection points, optionally narrowed by supply entity. Example: GET /api/procurement/collection-points?supplyEntityId=clinic-1.',
        operationId: 'listCollectionPoints',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        querystring: z.object({ supplyEntityId: z.string().optional() }),
        response: { 200: z.array(collectionPointSchema), 401: errorResponse },
      },
    },
    async (req) => procurementService.listCollectionPoints(tenantIdOf(req), req.query.supplyEntityId),
  );

  app.get(
    '/collection-units',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement'],
        summary: 'List collection units',
        description: 'Read collection units with optional hidden/status/search filters. Example: GET /api/procurement/collection-units?status=received&q=HET&take=50.',
        operationId: 'listCollectionUnits',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        querystring: z.object({
          includeHidden: z.enum(['true', 'false']).optional(),
          status: z.string().optional(),
          q: z.string().optional(),
          take: z.coerce.number().int().min(1).max(500).optional(),
        }),
        response: { 200: z.array(collectionUnitSchema), 401: errorResponse },
      },
    },
    async (req) =>
      procurementService.listCollectionUnits({
        tenantId: tenantIdOf(req),
        includeHidden: req.query.includeHidden === 'true',
        status: req.query.status,
        q: req.query.q,
        take: req.query.take,
      }),
  );

  app.get(
    '/collection-units/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement'],
        summary: 'Get collection unit',
        description: 'Read one collection unit with issuance, fulfilment, receipt, and HET trace context.',
        operationId: 'getCollectionUnit',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: collectionUnitDetailSchema, 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const unit = await procurementService.getCollectionUnit(req.params.id, tenantIdOf(req));
      if (!unit) return reply.status(404).send({ error: 'Collection unit not found' });
      return unit;
    },
  );

  app.get(
    '/collection-units/:id/inventory-trace',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement', 'Inventory'],
        summary: 'Get collection unit inventory trace',
        description: 'Read inventory lots, movements, consumptions, genealogy, HETs, and work orders associated with a collection unit. Example: GET /api/procurement/collection-units/CU-1001/inventory-trace.',
        operationId: 'getCollectionUnitInventoryTrace',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: inventoryTraceSchema, 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const trace = await inventoryTraceService.getCollectionUnitInventoryTrace(req.params.id, tenantIdOf(req));
      if (!trace) return reply.status(404).send({ error: 'Collection unit not found' });
      return trace;
    },
  );

  app.get(
    '/issuance-orders',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement'],
        summary: 'List issuance orders',
        description: 'Read imported issuance orders. This is currently a read model, not a mutation workflow.',
        operationId: 'listIssuanceOrders',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: z.array(issuanceOrderSchema), 401: errorResponse },
      },
    },
    async (req) => procurementService.listIssuanceOrders(tenantIdOf(req)),
  );

  app.get(
    '/collection-orders',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement'],
        summary: 'List collection orders',
        description: 'Read imported collection orders. This is currently a read model, not a mutation workflow.',
        operationId: 'listCollectionOrders',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: z.array(collectionOrderSchema), 401: errorResponse },
      },
    },
    async (req) => procurementService.listCollectionOrders(tenantIdOf(req)),
  );

  app.get(
    '/collection-receipts',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Procurement'],
        summary: 'List collection receipts',
        description: 'Read imported collection receipts. Acceptance/release mutations are not implemented in this endpoint.',
        operationId: 'listCollectionReceipts',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: z.array(collectionReceiptSchema), 401: errorResponse },
      },
    },
    async (req) => procurementService.listCollectionReceipts(tenantIdOf(req)),
  );

  app.get(
    '/import-reports',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Procurement'],
        summary: 'List procurement import reports',
        description: 'Read recent procurement import audit reports. Admin or owner role required.',
        operationId: 'listProcurementImportReports',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'import-admin',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        response: { 200: z.array(importReportSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req) => procurementService.listImportReports(tenantIdOf(req)),
  );
};

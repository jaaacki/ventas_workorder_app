import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { JwtPayload } from '../plugins/auth.js';
import * as procurementService from '../services/procurementService.js';

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

const supplyEntitySchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    legalName: z.string().nullable(),
    externalCode: z.string().nullable(),
    sourceSystem: z.string().nullable(),
    legacyClinicId: z.string().nullable(),
    createdAt: dateish,
    updatedAt: dateish,
  })
  .passthrough();

const collectionPointSchema = z
  .object({
    id: z.string(),
    supplyEntityId: z.string(),
    hciCode: z.string().nullable(),
    displayName: z.string().nullable(),
    licenseName: z.string().nullable(),
    address: z.string().nullable(),
    postalCode: z.string().nullable(),
    telephone: z.string().nullable(),
    personInCharge: z.string().nullable(),
    createdAt: dateish,
    updatedAt: dateish,
  })
  .passthrough();

const collectionUnitSchema = z
  .object({
    id: z.string(),
    supplyEntityId: z.string().nullable(),
    collectionPointId: z.string().nullable(),
    legacyHetId: z.string().nullable(),
    unitNumber: z.string().nullable(),
    parcelTrackingNumber: z.string().nullable(),
    status: z.string(),
    legacyUsedByWorkOrderId: z.string().nullable(),
    legacyNextHetId: z.string().nullable(),
    sourceSystem: z.string().nullable(),
    linkCompleteness: z.string().nullable(),
    semanticConfidence: z.string().nullable(),
    hiddenFromOperations: z.boolean(),
    deleted: z.boolean(),
    createdAt: dateish,
    updatedAt: dateish,
  })
  .passthrough();

const collectionUnitDetailSchema = collectionUnitSchema
  .extend({
    issuanceLines: z.array(z.object({ id: z.string() }).passthrough()),
    fulfilments: z.array(z.object({ id: z.string() }).passthrough()),
    receiptLines: z.array(z.object({ id: z.string() }).passthrough()),
    hets: z.array(
      z
        .object({
          id: z.string(),
          hetNumber: z.string().nullable(),
          clinicName: z.string().nullable(),
          usedById: z.string().nullable(),
          finishedById: z.string().nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const issuanceOrderSchema = z
  .object({
    id: z.string(),
    supplyEntityId: z.string().nullable(),
    collectionPointId: z.string().nullable(),
    issuedAt: dateish.nullable(),
    issuedBy: z.string().nullable(),
    semanticConfidence: z.string().nullable(),
    level: z.string().nullable(),
    remarks: z.string().nullable(),
    createdAt: dateish,
    updatedAt: dateish,
  })
  .passthrough();

const collectionOrderSchema = z
  .object({
    id: z.string(),
    supplyEntityId: z.string().nullable(),
    collectionPointId: z.string().nullable(),
    requestedAt: dateish.nullable(),
    scheduledFor: dateish.nullable(),
    requestedBy: z.string().nullable(),
    status: z.string(),
    semanticConfidence: z.string().nullable(),
    legacyConflatedOrderReceipt: z.boolean(),
    remarks: z.string().nullable(),
    createdAt: dateish,
    updatedAt: dateish,
  })
  .passthrough();

const collectionReceiptSchema = z
  .object({
    id: z.string(),
    collectionOrderId: z.string().nullable(),
    receivedAt: dateish.nullable(),
    receivedBy: z.string().nullable(),
    signaturePath: z.string().nullable(),
    remarks: z.string().nullable(),
    legacyConflatedOrderReceipt: z.boolean(),
    acceptanceState: z.string().nullable(),
    createdAt: dateish,
    updatedAt: dateish,
  })
  .passthrough();

const importReportSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    dryRun: z.boolean(),
    startedAt: dateish,
    finishedAt: dateish.nullable(),
    report: z.unknown(),
  })
  .passthrough();

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
        response: { 200: z.array(importReportSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req) => procurementService.listImportReports(tenantIdOf(req)),
  );
};

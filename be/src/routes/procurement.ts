import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as procurementService from '../services/procurementService.js';
import * as inventoryTraceService from '../services/inventoryTraceService.js';
import { inventoryTraceSchema } from './inventoryTraceSchemas.js';
import { registerCrudRoutes, type CrudRouteDefinition } from './crudRouteHelpers.js';

const errorResponse = z.object({ error: z.string() });
const dateish = z.union([z.date(), z.string()]);
const decimalish = z.union([z.number(), z.string(), z.custom<Prisma.Decimal>()]);
const softDeleteSchema = {
  deleted: z.boolean(),
  deletedAt: dateish.nullable(),
  deletedById: z.string().nullable(),
  createdById: z.string().nullable(),
  updatedById: z.string().nullable(),
};

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
  ...softDeleteSchema,
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
  ...softDeleteSchema,
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
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
});

const issuanceOrderLineSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  issuanceOrderId: z.string(),
  collectionUnitId: z.string().nullable(),
  itemCode: z.string().nullable(),
  quantity: decimalish.nullable(),
  uom: z.string().nullable(),
  legacyHetId: z.string().nullable(),
  legacyHetNumber: z.string().nullable(),
  parcelTrackingNumber: z.string().nullable(),
  ...softDeleteSchema,
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
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
});

const collectionReceiptLineSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  collectionReceiptId: z.string(),
  collectionUnitId: z.string().nullable(),
  itemCode: z.string().nullable(),
  quantity: decimalish.nullable(),
  uom: z.string().nullable(),
  conditionStatus: z.string().nullable(),
  acceptanceStatus: z.string().nullable(),
  resultingHetId: z.string().nullable(),
  discrepancyReason: z.string().nullable(),
  ...softDeleteSchema,
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
  ...softDeleteSchema,
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
  ...softDeleteSchema,
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
  ...softDeleteSchema,
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
  ...softDeleteSchema,
});

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

const includeDeletedQuery = z.object({ includeDeleted: z.coerce.boolean().optional() });

const procurementCrudRoutes = [
  {
    key: 'supplyEntities',
    path: 'supply-entities',
    singular: 'supply entity',
    plural: 'supply entities',
    config: procurementService.procurementCrudResources.supplyEntities,
    schema: supplyEntitySchema,
    skipList: true,
  },
  {
    key: 'collectionPoints',
    path: 'collection-points',
    singular: 'collection point',
    plural: 'collection points',
    config: procurementService.procurementCrudResources.collectionPoints,
    schema: collectionPointSchema,
    filters: ['supplyEntityId'],
    skipList: true,
  },
  {
    key: 'collectionUnits',
    path: 'collection-units',
    singular: 'collection unit',
    plural: 'collection units',
    config: procurementService.procurementCrudResources.collectionUnits,
    schema: collectionUnitSchema.extend({ legacyRaw: z.unknown().nullable() }),
    filters: ['status'],
    skipList: true,
    skipDetail: true,
  },
  {
    key: 'issuanceOrders',
    path: 'issuance-orders',
    singular: 'issuance order',
    plural: 'issuance orders',
    config: procurementService.procurementCrudResources.issuanceOrders,
    schema: issuanceOrderSchema,
    skipList: true,
  },
  {
    key: 'issuanceOrderLines',
    path: 'issuance-order-lines',
    singular: 'issuance order line',
    plural: 'issuance order lines',
    config: procurementService.procurementCrudResources.issuanceOrderLines,
    schema: issuanceOrderLineSchema,
    filters: ['issuanceOrderId', 'collectionUnitId'],
  },
  {
    key: 'collectionUnitFulfilments',
    path: 'collection-unit-fulfilments',
    singular: 'collection unit fulfilment',
    plural: 'collection unit fulfilments',
    config: procurementService.procurementCrudResources.collectionUnitFulfilments,
    schema: collectionUnitFulfilmentSchema,
    filters: ['collectionUnitId'],
  },
  {
    key: 'collectionOrders',
    path: 'collection-orders',
    singular: 'collection order',
    plural: 'collection orders',
    config: procurementService.procurementCrudResources.collectionOrders,
    schema: collectionOrderSchema,
    filters: ['supplyEntityId', 'status'],
    skipList: true,
  },
  {
    key: 'collectionReceipts',
    path: 'collection-receipts',
    singular: 'collection receipt',
    plural: 'collection receipts',
    config: procurementService.procurementCrudResources.collectionReceipts,
    schema: collectionReceiptSchema,
    filters: ['collectionOrderId'],
    skipList: true,
  },
  {
    key: 'collectionReceiptLines',
    path: 'collection-receipt-lines',
    singular: 'collection receipt line',
    plural: 'collection receipt lines',
    config: procurementService.procurementCrudResources.collectionReceiptLines,
    schema: collectionReceiptLineSchema,
    filters: ['collectionReceiptId', 'collectionUnitId'],
  },
  {
    key: 'importReports',
    path: 'import-reports',
    operationSuffix: 'ProcurementImportReports',
    singular: 'procurement import report',
    plural: 'procurement import reports',
    config: procurementService.procurementCrudResources.importReports,
    schema: importReportSchema,
    skipList: true,
    skipCreate: true,
    skipUpdate: true,
  },
] satisfies CrudRouteDefinition<procurementService.ProcurementCrudResourceKey>[];

export const procurementRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/overview',
    {
      onRequest: [app.requirePermission('procurement.supplyEntity', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'Get procurement overview',
        description: 'Read aggregate procurement counts for the dashboard. Example: GET /api/procurement/overview.',
        operationId: 'getProcurementOverview',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.supplyEntity.read'],
        response: { 200: procurementOverviewSchema, 401: errorResponse, 403: errorResponse },
      },
    },
    async (req) => procurementService.getProcurementOverview(tenantIdOf(req)),
  );

  app.get(
    '/supply-entities',
    {
      onRequest: [app.requirePermission('procurement.supplyEntity', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'List supply entities',
        description: 'Read supplier or clinic groups imported from the procurement source data.',
        operationId: 'listSupplyEntities',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.supplyEntity.read'],
        querystring: includeDeletedQuery,
        response: { 200: z.array(supplyEntitySchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'procurement.supplyEntity', action: 'readDeleted' }, { resource: 'procurement.supplyEntity', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return procurementService.listProcurementResource('supplyEntities', {
        tenantId: tenantIdOf(req),
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  app.get(
    '/collection-points',
    {
      onRequest: [app.requirePermission('procurement.collectionPoint', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'List collection points',
        description: 'Read collection points, optionally narrowed by supply entity. Example: GET /api/procurement/collection-points?supplyEntityId=clinic-1.',
        operationId: 'listCollectionPoints',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.collectionPoint.read'],
        querystring: includeDeletedQuery.extend({ supplyEntityId: z.string().optional() }),
        response: { 200: z.array(collectionPointSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'procurement.collectionPoint', action: 'readDeleted' }, { resource: 'procurement.collectionPoint', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return procurementService.listProcurementResource('collectionPoints', {
        tenantId: tenantIdOf(req),
        includeDeleted: req.query.includeDeleted,
        filters: { supplyEntityId: req.query.supplyEntityId },
      });
    },
  );

  app.get(
    '/collection-units',
    {
      onRequest: [app.requirePermission('procurement.collectionUnit', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'List collection units',
        description: 'Read collection units with optional hidden/status/search filters. Example: GET /api/procurement/collection-units?status=received&q=HET&take=50.',
        operationId: 'listCollectionUnits',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.collectionUnit.read'],
        querystring: z.object({
          includeHidden: z.enum(['true', 'false']).optional(),
          includeDeleted: z.coerce.boolean().optional(),
          status: z.string().optional(),
          q: z.string().optional(),
          take: z.coerce.number().int().min(1).max(500).optional(),
        }),
        response: { 200: z.array(collectionUnitSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'procurement.collectionUnit', action: 'readDeleted' }, { resource: 'procurement.collectionUnit', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return procurementService.listCollectionUnits({
        tenantId: tenantIdOf(req),
        includeHidden: req.query.includeHidden === 'true',
        includeDeleted: req.query.includeDeleted,
        status: req.query.status,
        q: req.query.q,
        take: req.query.take,
      });
    },
  );

  app.get(
    '/collection-units/:id',
    {
      onRequest: [app.requirePermission('procurement.collectionUnit', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'Get collection unit',
        description: 'Read one collection unit with issuance, fulfilment, receipt, and HET trace context.',
        operationId: 'getCollectionUnit',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.collectionUnit.read'],
        params: z.object({ id: z.string() }),
        querystring: includeDeletedQuery,
        response: { 200: collectionUnitDetailSchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'procurement.collectionUnit', action: 'readDeleted' }, { resource: 'procurement.collectionUnit', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      const unit = await procurementService.getCollectionUnit(req.params.id, tenantIdOf(req), req.query.includeDeleted);
      if (!unit) return reply.status(404).send({ error: 'Collection unit not found' });
      return unit;
    },
  );

  app.get(
    '/collection-units/:id/inventory-trace',
    {
      onRequest: [app.requirePermission('procurement.issuanceOrder', 'read')],
      schema: {
        tags: ['Procurement', 'Inventory'],
        summary: 'Get collection unit inventory trace',
        description: 'Read inventory lots, movements, consumptions, genealogy, HETs, and work orders associated with a collection unit. Example: GET /api/procurement/collection-units/CU-1001/inventory-trace.',
        operationId: 'getCollectionUnitInventoryTrace',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.issuanceOrder.read'],
        params: z.object({ id: z.string() }),
        response: { 200: inventoryTraceSchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
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
      onRequest: [app.requirePermission('procurement.issuanceOrder', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'List issuance orders',
        description: 'Read imported issuance orders. Mutations are managed through permission-gated CRUD, archive, restore, and audit endpoints.',
        operationId: 'listIssuanceOrders',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.issuanceOrder.read'],
        querystring: includeDeletedQuery,
        response: { 200: z.array(issuanceOrderSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'procurement.issuanceOrder', action: 'readDeleted' }, { resource: 'procurement.issuanceOrder', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return procurementService.listProcurementResource('issuanceOrders', {
        tenantId: tenantIdOf(req),
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  app.get(
    '/collection-orders',
    {
      onRequest: [app.requirePermission('procurement.collectionOrder', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'List collection orders',
        description: 'Read imported collection orders. Mutations are managed through permission-gated CRUD, archive, restore, and audit endpoints.',
        operationId: 'listCollectionOrders',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.collectionOrder.read'],
        querystring: includeDeletedQuery,
        response: { 200: z.array(collectionOrderSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'procurement.collectionOrder', action: 'readDeleted' }, { resource: 'procurement.collectionOrder', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return procurementService.listProcurementResource('collectionOrders', {
        tenantId: tenantIdOf(req),
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  app.get(
    '/collection-receipts',
    {
      onRequest: [app.requirePermission('procurement.collectionReceipt', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'List collection receipts',
        description: 'Read collection receipts. Receipt records are managed through permission-gated CRUD, archive, restore, and audit endpoints.',
        operationId: 'listCollectionReceipts',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.collectionReceipt.read'],
        querystring: includeDeletedQuery,
        response: { 200: z.array(collectionReceiptSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'procurement.collectionReceipt', action: 'readDeleted' }, { resource: 'procurement.collectionReceipt', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return procurementService.listProcurementResource('collectionReceipts', {
        tenantId: tenantIdOf(req),
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  app.get(
    '/import-reports',
    {
      onRequest: [app.requirePermission('procurement.importReport', 'read')],
      schema: {
        tags: ['Procurement'],
        summary: 'List procurement import reports',
        description: 'Read recent procurement import audit reports. Requires procurement import-report read permission.',
        operationId: 'listProcurementImportReports',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['procurement.importReport.read'],
        querystring: includeDeletedQuery,
        response: { 200: z.array(importReportSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'procurement.importReport', action: 'readDeleted' }, { resource: 'procurement.importReport', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return procurementService.listImportReports({
        tenantId: tenantIdOf(req),
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  for (const definition of procurementCrudRoutes) {
    registerCrudRoutes(app, 'Procurement', definition, {
      list: procurementService.listProcurementResource,
      get: procurementService.getProcurementResource,
      create: procurementService.createProcurementResource,
      update: procurementService.updateProcurementResource,
      archive: procurementService.archiveProcurementResource,
      restore: procurementService.restoreProcurementResource,
      audit: procurementService.listProcurementResourceAudit,
    });
  }
};

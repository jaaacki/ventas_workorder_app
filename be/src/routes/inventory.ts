import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { JwtPayload } from '../plugins/auth.js';
import * as inventoryService from '../services/inventoryService.js';

const errorResponse = z.object({ error: z.string() });
const dateish = z.union([z.date(), z.string()]);

const inventoryOverviewSchema = z.object({
  skus: z.number(),
  lots: z.number(),
  transactions: z.number(),
  locations: z.number(),
  balances: z.number(),
  importReports: z.number(),
  hetLots: z.number(),
  finishedGoodLots: z.number(),
});

const inventorySkuSchema = z
  .object({
    id: z.string(),
    sku: z.string().nullable(),
    description: z.string().nullable(),
    category: z.string().nullable(),
    brand: z.string().nullable(),
    size: z.string().nullable(),
    colour: z.string().nullable(),
    uom: z.string().nullable(),
    serialisedMode: z.string().nullable(),
    sourceSystem: z.string().nullable(),
    createdAt: dateish,
    updatedAt: dateish,
  })
  .passthrough();

const inventoryLocationSchema = z
  .object({
    id: z.string(),
    locationType: z.string(),
    name: z.string(),
    parentLocationId: z.string().nullable(),
    description: z.string().nullable(),
    imagePath: z.string().nullable(),
    sourceSystem: z.string().nullable(),
    createdAt: dateish,
    updatedAt: dateish,
  })
  .passthrough();

const inventoryLotSchema = z
  .object({
    id: z.string(),
    inventorySkuId: z.string().nullable(),
    lotNumber: z.string().nullable(),
    inventoryType: z.string(),
    status: z.string(),
    uom: z.string().nullable(),
    currentLocationId: z.string().nullable(),
    collectionUnitId: z.string().nullable(),
    hetId: z.string().nullable(),
    workOrderId: z.string().nullable(),
    sourceSystem: z.string().nullable(),
    legacyItemSerialId: z.string().nullable(),
    legacyHetId: z.string().nullable(),
    createdAt: dateish,
    updatedAt: dateish,
    inventorySku: inventorySkuSchema.nullable().optional(),
    currentLocation: inventoryLocationSchema.nullable().optional(),
  })
  .passthrough();

const inventoryTransactionSchema = z
  .object({
    id: z.string(),
    inventorySkuId: z.string().nullable(),
    inventoryLotId: z.string().nullable(),
    transactionType: z.string(),
    direction: z.string().nullable(),
    reason: z.string().nullable(),
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
    createdAt: dateish,
    updatedAt: dateish,
    inventorySku: inventorySkuSchema.nullable().optional(),
    inventoryLot: inventoryLotSchema.nullable().optional(),
    fromLocation: inventoryLocationSchema.nullable().optional(),
    toLocation: inventoryLocationSchema.nullable().optional(),
  })
  .passthrough();

const inventoryGenealogySchema = z
  .object({
    id: z.string(),
    lot: inventoryLotSchema,
    parents: z.array(z.object({ id: z.string(), parentInventoryLot: inventoryLotSchema }).passthrough()),
    children: z.array(z.object({ id: z.string(), childInventoryLot: inventoryLotSchema }).passthrough()),
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

const listQuery = z.object({
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
});

export const inventoryRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/overview',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Inventory'],
        summary: 'Get inventory overview',
        description: 'Read aggregate inventory counts for the dashboard. Example: GET /api/inventory/overview.',
        operationId: 'getInventoryOverview',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        response: { 200: inventoryOverviewSchema, 401: errorResponse },
      },
    },
    async (req) => inventoryService.getInventoryOverview(tenantIdOf(req)),
  );

  app.get(
    '/skus',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory SKUs',
        description: 'Read inventory SKU master records. Example: GET /api/inventory/skus?q=graft&take=50.',
        operationId: 'listInventorySkus',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        querystring: listQuery,
        response: { 200: z.array(inventorySkuSchema), 401: errorResponse },
      },
    },
    async (req) => inventoryService.listSkus({ tenantId: tenantIdOf(req), q: req.query.q, take: req.query.take }),
  );

  app.get(
    '/lots',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory lots',
        description: 'Read inventory lots with SKU and current-location context. Example: GET /api/inventory/lots?inventoryType=HET&status=available&take=50.',
        operationId: 'listInventoryLots',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        querystring: listQuery.extend({
          inventoryType: z.string().optional(),
          status: z.string().optional(),
        }),
        response: { 200: z.array(inventoryLotSchema), 401: errorResponse },
      },
    },
    async (req) =>
      inventoryService.listLots({
        tenantId: tenantIdOf(req),
        q: req.query.q,
        inventoryType: req.query.inventoryType,
        status: req.query.status,
        take: req.query.take,
      }),
  );

  app.get(
    '/transactions',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory transactions',
        description: 'Read immutable inventory transaction history with SKU, lot, and location context. Example: GET /api/inventory/transactions?q=WO-1001&take=100.',
        operationId: 'listInventoryTransactions',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        querystring: listQuery,
        response: { 200: z.array(inventoryTransactionSchema), 401: errorResponse },
      },
    },
    async (req) =>
      inventoryService.listTransactions({ tenantId: tenantIdOf(req), q: req.query.q, take: req.query.take }),
  );

  app.get(
    '/locations',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory locations',
        description: 'Read inventory location master records.',
        operationId: 'listInventoryLocations',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        response: { 200: z.array(inventoryLocationSchema), 401: errorResponse },
      },
    },
    async (req) => inventoryService.listLocations(tenantIdOf(req)),
  );

  app.get(
    '/genealogy/:lotId',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Inventory'],
        summary: 'Get inventory genealogy',
        description: 'Read parent and child lot genealogy for one inventory lot.',
        operationId: 'getInventoryGenealogy',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        params: z.object({ lotId: z.string() }),
        response: { 200: inventoryGenealogySchema, 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const trace = await inventoryService.getGenealogy(req.params.lotId, tenantIdOf(req));
      if (!trace) return reply.status(404).send({ error: 'Inventory lot not found' });
      return trace;
    },
  );

  app.get(
    '/import-reports',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory import reports',
        description: 'Read recent inventory import audit reports. Admin or owner role required.',
        operationId: 'listInventoryImportReports',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'import-admin',
        response: { 200: z.array(importReportSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req) => inventoryService.listImportReports(tenantIdOf(req)),
  );
};

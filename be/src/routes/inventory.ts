import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as inventoryService from '../services/inventoryService.js';
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

const inventoryReferenceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  refType: z.string(),
  name: z.string(),
  shortCode: z.string().nullable(),
  description: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
});

const inventorySkuSchema = z.object({
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
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
});

const inventoryLocationSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationType: z.string(),
  name: z.string(),
  parentLocationId: z.string().nullable(),
  description: z.string().nullable(),
  imagePath: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
});

const inventoryLotSchema = z.object({
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
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
  inventorySku: inventorySkuSchema.nullable().optional(),
  currentLocation: inventoryLocationSchema.nullable().optional(),
});

const inventoryTransactionSchema = z.object({
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
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
  inventorySku: inventorySkuSchema.nullable().optional(),
  inventoryLot: inventoryLotSchema.nullable().optional(),
  fromLocation: inventoryLocationSchema.nullable().optional(),
  toLocation: inventoryLocationSchema.nullable().optional(),
});

const inventoryGenealogyLinkSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  parentInventoryLotId: z.string(),
  childInventoryLotId: z.string(),
  relationshipType: z.string(),
  workOrderId: z.string().nullable(),
  phaseId: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
});

const inventoryBalanceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  inventorySkuId: z.string(),
  inventoryLotId: z.string().nullable(),
  inventoryLocationId: z.string().nullable(),
  quantity: decimalish.nullable(),
  sourceSystem: z.string().nullable(),
  legacyRaw: z.unknown().nullable(),
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
  inventorySku: inventorySkuSchema.optional(),
  inventoryLot: inventoryLotSchema.nullable().optional(),
  inventoryLocation: inventoryLocationSchema.nullable().optional(),
});

const workOrderInventoryConsumptionSchema = z.object({
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
  ...softDeleteSchema,
  createdAt: dateish,
  updatedAt: dateish,
  inventoryLot: inventoryLotSchema.nullable().optional(),
});

const inventoryGenealogySchema = z.object({
  id: z.string(),
  lot: inventoryLotSchema,
  parents: z.array(inventoryGenealogyLinkSchema.extend({ parentInventoryLot: inventoryLotSchema })),
  children: z.array(inventoryGenealogyLinkSchema.extend({ childInventoryLot: inventoryLotSchema })),
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

const listQuery = z.object({
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
  includeDeleted: z.coerce.boolean().optional(),
});

const inventoryCrudRoutes = [
  {
    key: 'references',
    path: 'references',
    singular: 'inventory reference',
    plural: 'inventory references',
    config: inventoryService.inventoryCrudResources.references,
    schema: inventoryReferenceSchema,
  },
  {
    key: 'locations',
    path: 'locations',
    singular: 'inventory location',
    plural: 'inventory locations',
    config: inventoryService.inventoryCrudResources.locations,
    schema: inventoryLocationSchema,
    skipList: true,
  },
  {
    key: 'skus',
    path: 'skus',
    singular: 'inventory SKU',
    plural: 'inventory SKUs',
    config: inventoryService.inventoryCrudResources.skus,
    schema: inventorySkuSchema,
    skipList: true,
  },
  {
    key: 'lots',
    path: 'lots',
    singular: 'inventory lot',
    plural: 'inventory lots',
    config: inventoryService.inventoryCrudResources.lots,
    schema: inventoryLotSchema,
    filters: ['inventoryType', 'status', 'inventorySkuId', 'currentLocationId', 'collectionUnitId', 'workOrderId'],
    skipList: true,
    skipDetail: true,
  },
  {
    key: 'transactions',
    path: 'transactions',
    singular: 'inventory transaction',
    plural: 'inventory transactions',
    config: inventoryService.inventoryCrudResources.transactions,
    schema: inventoryTransactionSchema,
    filters: ['inventorySkuId', 'inventoryLotId', 'workOrderId'],
    skipList: true,
  },
  {
    key: 'balances',
    path: 'balances',
    singular: 'inventory balance',
    plural: 'inventory balances',
    config: inventoryService.inventoryCrudResources.balances,
    schema: inventoryBalanceSchema,
    filters: ['inventorySkuId', 'inventoryLotId', 'inventoryLocationId'],
  },
  {
    key: 'genealogy',
    path: 'genealogy',
    singular: 'inventory genealogy link',
    plural: 'inventory genealogy links',
    config: inventoryService.inventoryCrudResources.genealogy,
    schema: inventoryGenealogyLinkSchema.extend({
      parentInventoryLot: inventoryLotSchema.optional(),
      childInventoryLot: inventoryLotSchema.optional(),
    }),
    filters: ['parentInventoryLotId', 'childInventoryLotId', 'relationshipType', 'workOrderId'],
  },
  {
    key: 'workOrderConsumptions',
    path: 'work-order-consumptions',
    singular: 'work-order inventory consumption',
    plural: 'work-order inventory consumptions',
    config: inventoryService.inventoryCrudResources.workOrderConsumptions,
    schema: workOrderInventoryConsumptionSchema,
    filters: ['workOrderId', 'inventoryLotId', 'inventorySkuId'],
  },
  {
    key: 'importReports',
    path: 'import-reports',
    operationSuffix: 'InventoryImportReports',
    singular: 'inventory import report',
    plural: 'inventory import reports',
    config: inventoryService.inventoryCrudResources.importReports,
    schema: importReportSchema,
    skipList: true,
    skipCreate: true,
    skipUpdate: true,
  },
] satisfies CrudRouteDefinition<inventoryService.InventoryCrudResourceKey>[];

export const inventoryRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/overview',
    {
      onRequest: [app.requirePermission('inventory.sku', 'read')],
      schema: {
        tags: ['Inventory'],
        summary: 'Get inventory overview',
        description: 'Read aggregate inventory counts for the dashboard. Example: GET /api/inventory/overview.',
        operationId: 'getInventoryOverview',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'permission',
        'x-required-permissions': ['inventory.sku.read'],
        response: { 200: inventoryOverviewSchema, 401: errorResponse, 403: errorResponse },
      },
    },
    async (req) => inventoryService.getInventoryOverview(tenantIdOf(req)),
  );

  app.get(
    '/skus',
    {
      onRequest: [app.requirePermission('inventory.sku', 'read')],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory SKUs',
        description: 'Read inventory SKU master records. Example: GET /api/inventory/skus?q=graft&take=50.',
        operationId: 'listInventorySkus',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['inventory.sku.read'],
        querystring: listQuery,
        response: { 200: z.array(inventorySkuSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'inventory.sku', action: 'readDeleted' }, { resource: 'inventory.sku', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return inventoryService.listSkus({
        tenantId: tenantIdOf(req),
        q: req.query.q,
        take: req.query.take,
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  app.get(
    '/lots',
    {
      onRequest: [app.requirePermission('inventory.lot', 'read')],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory lots',
        description: 'Read inventory lots with SKU and current-location context. Example: GET /api/inventory/lots?inventoryType=HET&status=available&take=50.',
        operationId: 'listInventoryLots',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['inventory.lot.read'],
        querystring: listQuery.extend({
          inventoryType: z.string().optional(),
          status: z.string().optional(),
        }),
        response: { 200: z.array(inventoryLotSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'inventory.lot', action: 'readDeleted' }, { resource: 'inventory.lot', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return inventoryService.listLots({
        tenantId: tenantIdOf(req),
        q: req.query.q,
        inventoryType: req.query.inventoryType,
        status: req.query.status,
        take: req.query.take,
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  app.get(
    '/lots/:id',
    {
      onRequest: [app.requirePermission('inventory.lot', 'read')],
      schema: {
        tags: ['Inventory'],
        summary: 'Get inventory lot',
        description: 'Read one inventory lot with SKU and current-location context. Example: GET /api/inventory/lots/lot-1001.',
        operationId: 'getInventoryLot',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['inventory.lot.read'],
        params: z.object({ id: z.string() }),
        querystring: z.object({ includeDeleted: z.coerce.boolean().optional() }),
        response: { 200: inventoryLotSchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'inventory.lot', action: 'readDeleted' }, { resource: 'inventory.lot', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      const lot = await inventoryService.getLot(req.params.id, tenantIdOf(req), req.query.includeDeleted);
      if (!lot) return reply.status(404).send({ error: 'Inventory lot not found' });
      return lot;
    },
  );

  app.get(
    '/transactions',
    {
      onRequest: [app.requirePermission('inventory.transaction', 'read')],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory transactions',
        description: 'Read immutable inventory transaction history with SKU, lot, and location context. Example: GET /api/inventory/transactions?q=WO-1001&take=100.',
        operationId: 'listInventoryTransactions',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['inventory.transaction.read'],
        querystring: listQuery,
        response: { 200: z.array(inventoryTransactionSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'inventory.transaction', action: 'readDeleted' }, { resource: 'inventory.transaction', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return inventoryService.listTransactions({
        tenantId: tenantIdOf(req),
        q: req.query.q,
        take: req.query.take,
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  app.get(
    '/locations',
    {
      onRequest: [app.requirePermission('inventory.location', 'read')],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory locations',
        description: 'Read inventory location master records.',
        operationId: 'listInventoryLocations',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['inventory.location.read'],
        querystring: z.object({ includeDeleted: z.coerce.boolean().optional() }),
        response: { 200: z.array(inventoryLocationSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'inventory.location', action: 'readDeleted' }, { resource: 'inventory.location', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return inventoryService.listLocations({
        tenantId: tenantIdOf(req),
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  app.get(
    '/lots/:lotId/genealogy',
    {
      onRequest: [app.requirePermission('inventory.genealogy', 'read')],
      schema: {
        tags: ['Inventory'],
        summary: 'Get inventory genealogy',
        description: 'Read parent and child lot genealogy for one inventory lot.',
        operationId: 'getInventoryLotGenealogy',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'permission',
        'x-required-permissions': ['inventory.genealogy.read'],
        params: z.object({ lotId: z.string() }),
        response: { 200: inventoryGenealogySchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
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
      onRequest: [app.requirePermission('inventory.importReport', 'read')],
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory import reports',
        description: 'Read recent inventory import audit reports. Requires inventory import-report read permission.',
        operationId: 'listInventoryImportReports',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'permission',
        'x-required-permissions': ['inventory.importReport.read'],
        querystring: z.object({ includeDeleted: z.coerce.boolean().optional() }),
        response: { 200: z.array(importReportSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      if (req.query.includeDeleted) {
        await app.requireAnyPermission([{ resource: 'inventory.importReport', action: 'readDeleted' }, { resource: 'inventory.importReport', action: 'readAudit' }])(req, reply);
        if (reply.sent) return;
      }
      return inventoryService.listImportReports({
        tenantId: tenantIdOf(req),
        includeDeleted: req.query.includeDeleted,
      });
    },
  );

  for (const definition of inventoryCrudRoutes) {
    registerCrudRoutes(app, 'Inventory', definition, {
      list: inventoryService.listInventoryResource,
      get: inventoryService.getInventoryResource,
      create: inventoryService.createInventoryResource,
      update: inventoryService.updateInventoryResource,
      archive: inventoryService.archiveInventoryResource,
      restore: inventoryService.restoreInventoryResource,
      audit: inventoryService.listInventoryResourceAudit,
    });
  }
};

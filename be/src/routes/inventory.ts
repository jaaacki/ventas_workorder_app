import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { JwtPayload } from '../plugins/auth.js';
import * as inventoryService from '../services/inventoryService.js';

const errorResponse = z.object({ error: z.string() });
const looseEntitySchema = z.object({ id: z.string() }).passthrough();

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
      schema: { response: { 200: z.record(z.string(), z.number()), 401: errorResponse } },
    },
    async (req) => inventoryService.getInventoryOverview(tenantIdOf(req)),
  );

  app.get(
    '/skus',
    {
      onRequest: [app.authenticate],
      schema: {
        querystring: listQuery,
        response: { 200: z.array(looseEntitySchema), 401: errorResponse },
      },
    },
    async (req) => inventoryService.listSkus({ tenantId: tenantIdOf(req), q: req.query.q, take: req.query.take }),
  );

  app.get(
    '/lots',
    {
      onRequest: [app.authenticate],
      schema: {
        querystring: listQuery.extend({
          inventoryType: z.string().optional(),
          status: z.string().optional(),
        }),
        response: { 200: z.array(looseEntitySchema), 401: errorResponse },
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
        querystring: listQuery,
        response: { 200: z.array(looseEntitySchema), 401: errorResponse },
      },
    },
    async (req) =>
      inventoryService.listTransactions({ tenantId: tenantIdOf(req), q: req.query.q, take: req.query.take }),
  );

  app.get(
    '/locations',
    {
      onRequest: [app.authenticate],
      schema: { response: { 200: z.array(looseEntitySchema), 401: errorResponse } },
    },
    async (req) => inventoryService.listLocations(tenantIdOf(req)),
  );

  app.get(
    '/genealogy/:lotId',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ lotId: z.string() }),
        response: { 200: looseEntitySchema, 401: errorResponse, 404: errorResponse },
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
      schema: { response: { 200: z.array(looseEntitySchema), 401: errorResponse, 403: errorResponse } },
    },
    async (req) => inventoryService.listImportReports(tenantIdOf(req)),
  );
};

import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { JwtPayload } from '../plugins/auth.js';
import * as procurementService from '../services/procurementService.js';

const errorResponse = z.object({ error: z.string() });
const looseEntitySchema = z.object({ id: z.string() }).passthrough();

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export const procurementRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/overview',
    {
      onRequest: [app.authenticate],
      schema: {
        response: { 200: z.record(z.string(), z.number()), 401: errorResponse },
      },
    },
    async (req) => procurementService.getProcurementOverview(tenantIdOf(req)),
  );

  app.get(
    '/supply-entities',
    {
      onRequest: [app.authenticate],
      schema: { response: { 200: z.array(looseEntitySchema), 401: errorResponse } },
    },
    async (req) => procurementService.listSupplyEntities(tenantIdOf(req)),
  );

  app.get(
    '/collection-points',
    {
      onRequest: [app.authenticate],
      schema: {
        querystring: z.object({ supplyEntityId: z.string().optional() }),
        response: { 200: z.array(looseEntitySchema), 401: errorResponse },
      },
    },
    async (req) => procurementService.listCollectionPoints(tenantIdOf(req), req.query.supplyEntityId),
  );

  app.get(
    '/collection-units',
    {
      onRequest: [app.authenticate],
      schema: {
        querystring: z.object({
          includeHidden: z.enum(['true', 'false']).optional(),
          status: z.string().optional(),
          q: z.string().optional(),
          take: z.coerce.number().int().min(1).max(500).optional(),
        }),
        response: { 200: z.array(looseEntitySchema), 401: errorResponse },
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
        params: z.object({ id: z.string() }),
        response: { 200: looseEntitySchema, 401: errorResponse, 404: errorResponse },
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
      schema: { response: { 200: z.array(looseEntitySchema), 401: errorResponse } },
    },
    async (req) => procurementService.listIssuanceOrders(tenantIdOf(req)),
  );

  app.get(
    '/collection-orders',
    {
      onRequest: [app.authenticate],
      schema: { response: { 200: z.array(looseEntitySchema), 401: errorResponse } },
    },
    async (req) => procurementService.listCollectionOrders(tenantIdOf(req)),
  );

  app.get(
    '/collection-receipts',
    {
      onRequest: [app.authenticate],
      schema: { response: { 200: z.array(looseEntitySchema), 401: errorResponse } },
    },
    async (req) => procurementService.listCollectionReceipts(tenantIdOf(req)),
  );

  app.get(
    '/import-reports',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: { response: { 200: z.array(looseEntitySchema), 401: errorResponse, 403: errorResponse } },
    },
    async (req) => procurementService.listImportReports(tenantIdOf(req)),
  );
};

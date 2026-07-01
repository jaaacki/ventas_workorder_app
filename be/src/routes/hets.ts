import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as hetService from '../services/hetService.js';
import * as inventoryTraceService from '../services/inventoryTraceService.js';

const errorResponse = z.object({ error: z.string() });

const hetSchema = z
  .object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    createdById: z.string().nullable(),
    updatedById: z.string().nullable(),
    usedById: z.string().nullable(),
    finishedById: z.string().nullable(),
    deleted: z.boolean(),
  })
  .passthrough();

const hetLinkBodySchema = z.object({
  workOrderId: z.string().min(1),
});

const inventoryTraceSchema = z
  .object({
    subject: z.object({ type: z.string(), id: z.string(), label: z.string().nullable().optional() }),
    lots: z.array(z.object({ id: z.string() }).passthrough()),
    transactions: z.array(z.object({ id: z.string() }).passthrough()),
    consumptions: z.array(z.object({ id: z.string() }).passthrough()),
    genealogy: z.array(z.object({ id: z.string() }).passthrough()),
    hets: z.array(z.object({ id: z.string() }).passthrough()),
    workOrders: z.array(z.object({ id: z.string() }).passthrough()),
  })
  .passthrough();

function actorIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).id;
}

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export const hetRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['HETs'],
        summary: 'List HETs',
        description: 'Read non-deleted HET records available to production.',
        operationId: 'listHets',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: z.array(hetSchema), 401: errorResponse },
      },
    },
    async (req) => {
      return hetService.listHets(tenantIdOf(req));
    },
  );

  app.get(
    '/:id/inventory-trace',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['HETs', 'Inventory'],
        summary: 'Get HET inventory trace',
        description: 'Read inventory lots, movements, consumptions, genealogy, collection-unit links, and work orders associated with a HET. Example: GET /api/hets/HET-1001/inventory-trace.',
        operationId: 'getHetInventoryTrace',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: inventoryTraceSchema, 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const trace = await inventoryTraceService.getHetInventoryTrace(req.params.id, tenantIdOf(req));
      if (!trace) return reply.status(404).send({ error: 'HET not found' });
      return trace;
    },
  );

  app.post(
    '/:id/use',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['HETs'],
        summary: 'Mark HET in use',
        description: 'Link a HET to the work order currently using it. Admin or owner role required.',
        operationId: 'useHet',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: hetLinkBodySchema,
        response: {
          200: hetSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await hetService.useHet(req.params.id, {
          workOrderId: req.body.workOrderId,
          actorId: actorIdOf(req),
          tenantId: tenantIdOf(req),
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'HET or work order not found' });
          }
          if (err.code === 'P2003') {
            return reply.status(400).send({ error: 'Referenced work order does not exist' });
          }
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/finish',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['HETs'],
        summary: 'Mark HET finished',
        description: 'Link a HET to the work order that finished consuming or producing it. Admin or owner role required.',
        operationId: 'finishHet',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: hetLinkBodySchema,
        response: {
          200: hetSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await hetService.finishHet(req.params.id, {
          workOrderId: req.body.workOrderId,
          actorId: actorIdOf(req),
          tenantId: tenantIdOf(req),
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'HET not found' });
          }
        }
        throw err;
      }
    },
  );
};

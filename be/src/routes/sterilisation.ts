import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as sterilisationService from '../services/sterilisationService.js';

const errorResponse = z.object({ error: z.string() });

const hetRefSchema = z.object({
  hetId: z.string(),
  het: z.object({
    id: z.string(),
    hetNumber: z.string().nullable(),
  }),
});

const steriliseDetailSchema = z
  .object({
    id: z.string(),
    workOrderId: z.string(),
    manuId: z.string().nullable(),
    direction: z.string().nullable(),
    result: z.boolean().nullable(),
    signById: z.string().nullable(),
    createdById: z.string().nullable(),
    updatedById: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
    batchHets: z.array(hetRefSchema),
  })
  .passthrough();

const createBodySchema = z.object({
  workOrderId: z.string().min(1),
  direction: z.enum(['OUT', 'IN']),
  result: z.boolean().optional(),
  signById: z.string().optional(),
  hetIds: z.array(z.string()).optional(),
});

const patchBodySchema = z.object({
  result: z.boolean(),
});

function actorIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).id;
}

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export const sterilisationRoutes: FastifyPluginAsyncZod = async function (app) {
  app.post(
    '/',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        body: createBodySchema,
        response: {
          201: steriliseDetailSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await sterilisationService.createSterilisation(
          req.body,
          actorIdOf(req),
          tenantIdOf(req),
        );
        return reply.status(201).send(created);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'Work order not found' });
          }
          if (err.code === 'P2003') {
            return reply.status(400).send({ error: 'Referenced het or work order does not exist' });
          }
        }
        throw err;
      }
    },
  );

  app.get(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        querystring: z.object({ workOrderId: z.string().min(1) }),
        response: {
          200: z.array(steriliseDetailSchema),
          401: errorResponse,
        },
      },
    },
    async (req) => {
      return sterilisationService.listSterilisations(req.query.workOrderId, tenantIdOf(req));
    },
  );

  app.patch(
    '/:id',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        params: z.object({ id: z.string() }),
        body: patchBodySchema,
        response: {
          200: steriliseDetailSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await sterilisationService.setSterilisationResult(
          req.params.id,
          req.body.result,
          actorIdOf(req),
          tenantIdOf(req),
        );
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'Sterilise not found' });
          }
        }
        throw err;
      }
    },
  );
};

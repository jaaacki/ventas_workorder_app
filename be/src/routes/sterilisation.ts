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
        tags: ['Sterilisation'],
        summary: 'Create sterilisation record',
        description: 'Create an IN/OUT sterilisation or BET record linked to a work order. Admin or owner role required.',
        operationId: 'createSterilisation',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
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
        tags: ['Sterilisation'],
        summary: 'List sterilisation records',
        description: 'Read sterilisation and BET records for a specific work order.',
        operationId: 'listSterilisations',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
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
        tags: ['Sterilisation'],
        summary: 'Set sterilisation result',
        description: 'Update the pass/fail result for a sterilisation or BET record. Admin or owner role required.',
        operationId: 'setSterilisationResult',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
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

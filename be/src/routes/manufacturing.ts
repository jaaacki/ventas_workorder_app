import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as manufacturingService from '../services/manufacturingService.js';

const errorResponse = z.object({ error: z.string() });

const manufacturerSchema = z
  .object({
    id: z.string(),
    manuNumber: z.string().nullable(),
    manuName: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .passthrough();

const generateBodySchema = z.object({
  workOrderId: z.string().min(1),
});

function actorIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).id;
}

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export const manufacturingRoutes: FastifyPluginAsyncZod = async function (app) {
  app.post(
    '/generate',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Manufacturing'],
        summary: 'Generate batch record',
        description: 'Create and link the manufacturing batch record for a work order. Admin or owner role required.',
        operationId: 'generateBatchRecord',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        body: generateBodySchema,
        response: {
          201: manufacturerSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await manufacturingService.generateBatchRecord(
          req.body.workOrderId,
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
            return reply.status(400).send({ error: 'Referenced work order does not exist' });
          }
        }
        throw err;
      }
    },
  );

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Manufacturing'],
        summary: 'Get batch record',
        description: 'Read one manufacturing batch record by id.',
        operationId: 'getBatchRecord',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        params: z.object({ id: z.string() }),
        response: {
          200: manufacturerSchema,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const manufacturer = await manufacturingService.getBatchRecord(req.params.id, tenantIdOf(req));
      if (!manufacturer) {
        return reply.status(404).send({ error: 'Manufacturer not found' });
      }
      return manufacturer;
    },
  );
};

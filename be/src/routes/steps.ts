import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { tenantIdOf, actorIdOf } from './requestContext.js';
import * as stepService from '../services/stepService.js';

const errorResponse = z.object({ error: z.string() });
const successResponse = z.object({ success: z.literal(true) });

const stepSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  phaseId: z.string().nullable(),
  sortOrder: z.number(),
  code: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
});

const updateStepBodySchema = z.object({
  code: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().nullable().optional(),
});

const placeStepBodySchema = z.object({
  phaseId: z.string().trim().min(1),
  sortOrder: z.number().int().min(0).nullable().optional(),
});

export const stepRoutes: FastifyPluginAsyncZod = async function (app) {
  app.patch(
    '/:id',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Update step',
        description: 'Update one workflow-owned step (code, name, description). Admin or owner role required.',
        operationId: 'updateStep',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: updateStepBodySchema,
        response: {
          200: stepSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await stepService.updateStep(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Step not found' });
        }
        throw err;
      }
    },
  );

  app.delete(
    '/:id',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Delete step',
        description: 'Delete one workflow-owned step. Admin or owner role required.',
        operationId: 'deleteStep',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        response: {
          200: successResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await stepService.deleteStep(req.params.id, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Step not found' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/place',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Place step in phase',
        description: 'Place a step into a phase of the same workflow. Appends to the end of the phase unless an explicit sortOrder is supplied. Admin or owner role required.',
        operationId: 'placeStep',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: placeStepBodySchema,
        response: {
          200: stepSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await stepService.placeStep(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Step or phase not found' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/unplace',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Unplace step',
        description: 'Move a step back to the workflow unplaced pool (phaseId set null). Admin or owner role required.',
        operationId: 'unplaceStep',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        response: {
          200: stepSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await stepService.unplaceStep(req.params.id, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Step not found' });
        }
        throw err;
      }
    },
  );
};

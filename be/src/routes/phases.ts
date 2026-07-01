import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as phaseService from '../services/phaseService.js';

const errorResponse = z.object({ error: z.string() });

const phaseCatalogSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  phaseName: z.string().nullable(),
  phaseShort: z.string().nullable(),
  phaseOrder: z.number().nullable(),
  description: z.string().nullable(),
  bomId: z.string().nullable(),
  keyText: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const phaseMutationBodySchema = z.object({
  phaseName: z.string().trim().min(1).nullable().optional(),
  phaseShort: z.string().trim().min(1).nullable().optional(),
  phaseOrder: z.number().int().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  bomId: z.string().trim().min(1).nullable().optional(),
  keyText: z.string().trim().nullable().optional(),
});

function actorIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).id;
}

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export const phaseRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Workflows'],
        summary: 'List phases',
        description: 'Read the tenant phase catalog for workflow phase binding. This is currently a read model over imported/admin-managed phase master data.',
        operationId: 'listPhases',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'authenticated',
        response: { 200: z.array(phaseCatalogSchema), 401: errorResponse },
      },
    },
    async (req) => phaseService.listPhases(tenantIdOf(req)),
  );

  app.post(
    '/',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Create phase',
        description: 'Create a tenant phase catalog entry that workflows can bind into ordered production routes.',
        operationId: 'createPhase',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        body: phaseMutationBodySchema,
        response: {
          201: phaseCatalogSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await phaseService.createPhase(req.body, actorIdOf(req), tenantIdOf(req));
        return reply.status(201).send(created);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
          return reply.status(400).send({ error: 'Referenced BOM does not exist' });
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
        tags: ['Workflows'],
        summary: 'Get phase',
        description: 'Read one tenant phase catalog entry by id.',
        operationId: 'getPhase',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: phaseCatalogSchema, 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const phase = await phaseService.getPhase(req.params.id, tenantIdOf(req));
      if (!phase) {
        return reply.status(404).send({ error: 'Phase not found' });
      }
      return phase;
    },
  );

  app.patch(
    '/:id',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Update phase',
        description: 'Update tenant phase catalog metadata used by workflow phase bindings.',
        operationId: 'updatePhase',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: phaseMutationBodySchema,
        response: {
          200: phaseCatalogSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await phaseService.updatePhase(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') return reply.status(404).send({ error: 'Phase not found' });
          if (err.code === 'P2003') return reply.status(400).send({ error: 'Referenced BOM does not exist' });
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
        summary: 'Delete phase',
        description: 'Delete an unused tenant phase catalog entry. Referenced phases are protected by database constraints.',
        operationId: 'deletePhase',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({ success: z.literal(true) }),
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await phaseService.deletePhase(req.params.id, tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') return reply.status(404).send({ error: 'Phase not found' });
          if (err.code === 'P2003') return reply.status(409).send({ error: 'Phase is in use and cannot be deleted' });
        }
        throw err;
      }
    },
  );
};

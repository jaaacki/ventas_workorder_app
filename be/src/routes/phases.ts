import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { tenantIdOf, actorIdOf } from './requestContext.js';
import * as phaseService from '../services/phaseService.js';
import * as stepService from '../services/stepService.js';

const errorResponse = z.object({ error: z.string() });
const successResponse = z.object({ success: z.literal(true) });

const phaseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  workflowId: z.string(),
  phaseName: z.string().nullable(),
  phaseShort: z.string().nullable(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  isGate: z.boolean(),
  blocksCombine: z.boolean(),
  // Read side is a plain nullable string (the DB column is free-form); only the
  // write path (phaseMutationBodySchema) constrains the value to 'COLLECTION' | null.
  processType: z.string().nullable(),
  bomId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const phaseMutationBodySchema = z.object({
  phaseName: z.string().trim().min(1).nullable().optional(),
  phaseShort: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().nullable().optional(),
  isGate: z.boolean().optional(),
  blocksCombine: z.boolean().optional(),
  // Only 'COLLECTION' or null (production) — the phase's process lever (#186).
  processType: z.enum(['COLLECTION']).nullable().optional(),
  bomId: z.string().trim().min(1).nullable().optional(),
});

const reorderStepsBodySchema = z.object({
  stepIds: z.array(z.string().min(1)),
});

const phaseEquipmentBindingSchema = z.object({
  phaseId: z.string(),
  phaseEquipId: z.string(),
  phaseEquip: z.object({
    id: z.string(),
    equipId: z.string().nullable(),
    name: z.string().nullable(),
    description: z.string().nullable(),
  }),
});

const bindEquipmentBodySchema = z.object({ phaseEquipId: z.string().trim().min(1) });

export const phaseRoutes: FastifyPluginAsyncZod = async function (app) {
  app.patch(
    '/:id',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Update phase',
        description: 'Update one workflow-owned phase (label, gate/combine flags, BOM).',
        operationId: 'updatePhase',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: phaseMutationBodySchema,
        response: {
          200: phaseSchema,
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
        description: 'Delete one workflow-owned phase. Its steps are kept and returned to the workflow unplaced pool (phaseId set null).',
        operationId: 'deletePhase',
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
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await phaseService.deletePhase(req.params.id, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') return reply.status(404).send({ error: 'Phase not found' });
          if (err.code === 'P2003') return reply.status(409).send({ error: 'Phase is referenced by a work order and cannot be deleted' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/steps/reorder',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Reorder phase steps',
        description: 'Set each step sortOrder to its index in the supplied stepIds ordering within one phase. Admin or owner role required.',
        operationId: 'reorderPhaseSteps',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: reorderStepsBodySchema,
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
        return await stepService.reorderPhaseSteps(req.params.id, req.body.stepIds, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Phase not found' });
        }
        throw err;
      }
    },
  );

  app.get(
    '/:id/equipment',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Workflows', 'Master Data'],
        summary: 'List phase equipment',
        description: 'Read allowed equipment master-data bindings for one tenant phase.',
        operationId: 'listPhaseEquipmentBindings',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: z.array(phaseEquipmentBindingSchema), 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        return await phaseService.listPhaseEquipmentBindings(req.params.id, tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Phase not found' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/equipment',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows', 'Master Data'],
        summary: 'Bind phase equipment',
        description: 'Add an allowed-equipment binding to one tenant phase. Repeated adds are idempotent.',
        operationId: 'addPhaseEquipment',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: bindEquipmentBodySchema,
        response: { 201: phaseEquipmentBindingSchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        const binding = await phaseService.addPhaseEquipment(req.params.id, req.body.phaseEquipId, actorIdOf(req), tenantIdOf(req));
        return reply.status(201).send(binding);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Phase or equipment not found' });
        }
        throw err;
      }
    },
  );

  app.delete(
    '/:id/equipment/:phaseEquipId',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows', 'Master Data'],
        summary: 'Unbind phase equipment',
        description: 'Remove an equipment binding from one tenant phase without deleting the equipment master-data row.',
        operationId: 'deletePhaseEquipmentBinding',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string(), phaseEquipId: z.string() }),
        response: { 200: successResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        return await phaseService.deletePhaseEquipment(req.params.id, req.params.phaseEquipId, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Phase equipment binding not found' });
        }
        throw err;
      }
    },
  );
};

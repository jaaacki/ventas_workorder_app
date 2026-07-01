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

const phaseProcedureBindingSchema = z.object({
  phaseId: z.string(),
  procedureId: z.string(),
  procedure: z.object({
    id: z.string(),
    procedureName: z.string().nullable(),
    procedureShort: z.string().nullable(),
    procedureDesc: z.string().nullable(),
  }),
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

const bindProcedureBodySchema = z.object({ procedureId: z.string().trim().min(1) });
const bindEquipmentBodySchema = z.object({ phaseEquipId: z.string().trim().min(1) });

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
    '/:id/procedures',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Workflows', 'Master Data'],
        summary: 'List phase procedures',
        description: 'Read procedure master-data bindings for one tenant phase.',
        operationId: 'listPhaseProcedures',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: z.array(phaseProcedureBindingSchema), 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        return await phaseService.listPhaseProcedures(req.params.id, tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Phase not found' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/procedures',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows', 'Master Data'],
        summary: 'Bind phase procedure',
        description: 'Add a procedure master-data binding to one tenant phase. Repeated adds are idempotent.',
        operationId: 'addPhaseProcedure',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: bindProcedureBodySchema,
        response: { 201: phaseProcedureBindingSchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        const binding = await phaseService.addPhaseProcedure(req.params.id, req.body.procedureId, tenantIdOf(req));
        return reply.status(201).send(binding);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Phase or procedure not found' });
        }
        throw err;
      }
    },
  );

  app.delete(
    '/:id/procedures/:procedureId',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows', 'Master Data'],
        summary: 'Unbind phase procedure',
        description: 'Remove a procedure binding from one tenant phase without deleting the procedure master-data row.',
        operationId: 'deletePhaseProcedure',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string(), procedureId: z.string() }),
        response: { 200: z.object({ success: z.literal(true) }), 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        return await phaseService.deletePhaseProcedure(req.params.id, req.params.procedureId, tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Phase procedure binding not found' });
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
        const binding = await phaseService.addPhaseEquipment(req.params.id, req.body.phaseEquipId, tenantIdOf(req));
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
        response: { 200: z.object({ success: z.literal(true) }), 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        return await phaseService.deletePhaseEquipment(req.params.id, req.params.phaseEquipId, tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Phase equipment binding not found' });
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

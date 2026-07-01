import { Prisma } from '@prisma/client';
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { JwtPayload } from '../plugins/auth.js';
import * as masterDataService from '../services/masterDataService.js';

const errorResponse = z.object({ error: z.string() });
const successResponse = z.object({ success: z.literal(true) });
const decimalish = z.union([z.number(), z.string(), z.custom<Prisma.Decimal>()]);

const counted = z.object({
  _count: z.record(z.string(), z.number()).optional(),
});

const procedureSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  procedureName: z.string().nullable(),
  procedureDesc: z.string().nullable(),
  procedureShort: z.string().nullable(),
  keyText: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const procedureMutationSchema = z.object({
  procedureName: z.string().trim().min(1).nullable().optional(),
  procedureDesc: z.string().trim().nullable().optional(),
  procedureShort: z.string().trim().min(1).nullable().optional(),
  keyText: z.string().trim().nullable().optional(),
});

const bomSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  bomName: z.string().nullable(),
  keyText: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).merge(counted);

const bomMutationSchema = z.object({
  bomName: z.string().trim().min(1).nullable().optional(),
  keyText: z.string().trim().nullable().optional(),
});

const bomLineSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  bomId: z.string(),
  bomName: z.string().nullable(),
  description: z.string().nullable(),
  quantity: decimalish.nullable(),
  uom: z.string().nullable(),
  hasSerial: z.boolean(),
  deleted: z.boolean(),
  keyText: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const bomLineMutationSchema = z.object({
  bomId: z.string().trim().min(1).optional(),
  bomName: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  quantity: decimalish.nullable().optional(),
  uom: z.string().trim().nullable().optional(),
  hasSerial: z.boolean().optional(),
  keyText: z.string().trim().nullable().optional(),
});

const createBomLineSchema = bomLineMutationSchema.extend({
  bomId: z.string().trim().min(1),
});

const phaseEquipmentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  equipId: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  keyText: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).merge(counted);

const phaseEquipmentMutationSchema = z.object({
  equipId: z.string().trim().nullable().optional(),
  name: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().nullable().optional(),
  keyText: z.string().trim().nullable().optional(),
});

function actorIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).id;
}

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

function handleKnownError(reply: any, err: unknown, labels: { notFound: string; conflict?: string }): any {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return reply.status(404).send({ error: labels.notFound });
    if (err.code === 'P2003') return reply.status(409).send({ error: labels.conflict ?? 'Record is in use and cannot be deleted' });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return reply.status(409).send({ error: 'Record conflicts with an existing value' });
  }
  return undefined;
}

export const masterDataRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get('/procedures', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'List procedures',
      description: 'Read tenant procedure master data used by phase procedure bindings.',
      operationId: 'listProcedures',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'authenticated',
      response: { 200: z.array(procedureSchema), 401: errorResponse },
    },
  }, async (req) => masterDataService.listProcedures(tenantIdOf(req)));

  app.post('/procedures', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Create procedure',
      description: 'Create a tenant procedure master-data entry for controlled production instructions.',
      operationId: 'createProcedure',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      body: procedureMutationSchema,
      response: { 201: procedureSchema, 401: errorResponse, 403: errorResponse },
    },
  }, async (req, reply) => reply.status(201).send(await masterDataService.createProcedure(req.body, actorIdOf(req), tenantIdOf(req))));

  app.get('/procedures/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Get procedure',
      description: 'Read one tenant procedure master-data entry by id.',
      operationId: 'getProcedure',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'authenticated',
      params: z.object({ id: z.string() }),
      response: { 200: procedureSchema, 401: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    const procedure = await masterDataService.getProcedure(req.params.id, tenantIdOf(req));
    return procedure ?? reply.status(404).send({ error: 'Procedure not found' });
  });

  app.patch('/procedures/:id', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Update procedure',
      description: 'Update tenant procedure master-data metadata.',
      operationId: 'updateProcedure',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      params: z.object({ id: z.string() }),
      body: procedureMutationSchema,
      response: { 200: procedureSchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.updateProcedure(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'Procedure not found' });
      if (handled) return handled;
      throw err;
    }
  });

  app.delete('/procedures/:id', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Delete procedure',
      description: 'Delete an unused tenant procedure. Phase-bound procedures are protected by database constraints.',
      operationId: 'deleteProcedure',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      params: z.object({ id: z.string() }),
      response: { 200: successResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.deleteProcedure(req.params.id, tenantIdOf(req));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'Procedure not found', conflict: 'Procedure is in use and cannot be deleted' });
      if (handled) return handled;
      throw err;
    }
  });

  app.get('/boms', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'List BOMs',
      description: 'Read tenant bill-of-materials headers available for phase setup and serial requirements.',
      operationId: 'listBoms',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'authenticated',
      response: { 200: z.array(bomSchema), 401: errorResponse },
    },
  }, async (req) => masterDataService.listBoms(tenantIdOf(req)));

  app.post('/boms', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Create BOM',
      description: 'Create a tenant bill-of-materials header.',
      operationId: 'createBom',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      body: bomMutationSchema,
      response: { 201: bomSchema, 401: errorResponse, 403: errorResponse },
    },
  }, async (req, reply) => reply.status(201).send(await masterDataService.createBom(req.body, actorIdOf(req), tenantIdOf(req))));

  app.get('/boms/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Get BOM',
      description: 'Read one tenant bill-of-materials header by id.',
      operationId: 'getBom',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'authenticated',
      params: z.object({ id: z.string() }),
      response: { 200: bomSchema, 401: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    const bom = await masterDataService.getBom(req.params.id, tenantIdOf(req));
    return bom ?? reply.status(404).send({ error: 'BOM not found' });
  });

  app.patch('/boms/:id', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Update BOM',
      description: 'Update tenant bill-of-materials metadata.',
      operationId: 'updateBom',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      params: z.object({ id: z.string() }),
      body: bomMutationSchema,
      response: { 200: bomSchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.updateBom(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'BOM not found' });
      if (handled) return handled;
      throw err;
    }
  });

  app.delete('/boms/:id', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Delete BOM',
      description: 'Delete an unused tenant BOM. Referenced BOMs are protected by database constraints.',
      operationId: 'deleteBom',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      params: z.object({ id: z.string() }),
      response: { 200: successResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.deleteBom(req.params.id, tenantIdOf(req));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'BOM not found', conflict: 'BOM is in use and cannot be deleted' });
      if (handled) return handled;
      throw err;
    }
  });

  app.get('/bom-lines', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'List BOM lines',
      description: 'Read active tenant BOM lines, optionally filtered by bomId. Deleted lines are hidden unless includeDeleted=true.',
      operationId: 'listBomLines',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'authenticated',
      querystring: z.object({ bomId: z.string().optional(), includeDeleted: z.coerce.boolean().optional() }),
      response: { 200: z.array(bomLineSchema), 401: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.listBomLines({ tenantId: tenantIdOf(req), bomId: req.query.bomId, includeDeleted: req.query.includeDeleted });
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'BOM not found' });
      if (handled) return handled;
      throw err;
    }
  });

  app.post('/bom-lines', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Create BOM line',
      description: 'Create a BOM line used for phase serial and material requirements.',
      operationId: 'createBomLine',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      body: createBomLineSchema,
      response: { 201: bomLineSchema, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return reply.status(201).send(await masterDataService.createBomLine(req.body, actorIdOf(req), tenantIdOf(req)));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'BOM not found' });
      if (handled) return handled;
      if (err instanceof Error && err.message === 'Invalid BOM line quantity') return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  app.get('/bom-lines/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Get BOM line',
      description: 'Read one active tenant BOM line by id.',
      operationId: 'getBomLine',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'authenticated',
      params: z.object({ id: z.string() }),
      response: { 200: bomLineSchema, 401: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    const bomLine = await masterDataService.getBomLine(req.params.id, tenantIdOf(req));
    return bomLine ?? reply.status(404).send({ error: 'BOM line not found' });
  });

  app.patch('/bom-lines/:id', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Update BOM line',
      description: 'Update an active tenant BOM line while preserving referenced serial evidence.',
      operationId: 'updateBomLine',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      params: z.object({ id: z.string() }),
      body: bomLineMutationSchema,
      response: { 200: bomLineSchema, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.updateBomLine(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'BOM line not found' });
      if (handled) return handled;
      if (err instanceof Error && err.message === 'Invalid BOM line quantity') return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/bom-lines/:id', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Delete BOM line',
      description: 'Soft-delete an active tenant BOM line so serial evidence can retain historical references.',
      operationId: 'deleteBomLine',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      params: z.object({ id: z.string() }),
      response: { 200: successResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.deleteBomLine(req.params.id, actorIdOf(req), tenantIdOf(req));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'BOM line not found' });
      if (handled) return handled;
      throw err;
    }
  });

  app.get('/phase-equipment', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'List phase equipment',
      description: 'Read tenant equipment catalog entries available for phase allowed-equipment binding.',
      operationId: 'listPhaseEquipment',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'authenticated',
      response: { 200: z.array(phaseEquipmentSchema), 401: errorResponse },
    },
  }, async (req) => masterDataService.listPhaseEquipment(tenantIdOf(req)));

  app.post('/phase-equipment', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Create phase equipment',
      description: 'Create a tenant equipment catalog entry that phases can allow during execution.',
      operationId: 'createPhaseEquipment',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      body: phaseEquipmentMutationSchema,
      response: { 201: phaseEquipmentSchema, 401: errorResponse, 403: errorResponse },
    },
  }, async (req, reply) => reply.status(201).send(await masterDataService.createPhaseEquipment(req.body, actorIdOf(req), tenantIdOf(req))));

  app.get('/phase-equipment/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Get phase equipment',
      description: 'Read one tenant equipment catalog entry by id.',
      operationId: 'getPhaseEquipment',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'authenticated',
      params: z.object({ id: z.string() }),
      response: { 200: phaseEquipmentSchema, 401: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    const phaseEquipment = await masterDataService.getPhaseEquipment(req.params.id, tenantIdOf(req));
    return phaseEquipment ?? reply.status(404).send({ error: 'Phase equipment not found' });
  });

  app.patch('/phase-equipment/:id', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Update phase equipment',
      description: 'Update tenant equipment catalog metadata.',
      operationId: 'updatePhaseEquipment',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      params: z.object({ id: z.string() }),
      body: phaseEquipmentMutationSchema,
      response: { 200: phaseEquipmentSchema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.updatePhaseEquipment(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'Phase equipment not found' });
      if (handled) return handled;
      throw err;
    }
  });

  app.delete('/phase-equipment/:id', {
    onRequest: [app.requireRole('admin', 'owner')],
    schema: {
      tags: ['Workflows', 'Master Data'],
      summary: 'Delete phase equipment',
      description: 'Delete unused tenant phase equipment. Referenced equipment is protected by database constraints.',
      operationId: 'deletePhaseEquipment',
      security: [{ bearerAuth: [] }],
      'x-route-kind': 'resource-crud',
      'x-auth': 'role',
      'x-required-roles': ['admin', 'owner'],
      params: z.object({ id: z.string() }),
      response: { 200: successResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
  }, async (req, reply) => {
    try {
      return await masterDataService.deletePhaseEquipment(req.params.id, tenantIdOf(req));
    } catch (err) {
      const handled = handleKnownError(reply, err, { notFound: 'Phase equipment not found', conflict: 'Phase equipment is in use and cannot be deleted' });
      if (handled) return handled;
      throw err;
    }
  });
};

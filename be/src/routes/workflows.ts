import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as workflowService from '../services/workflowService.js';

const errorResponse = z.object({ error: z.string() });

const phaseBindingSchema = z.object({
  phaseId: z.string().min(1),
  sortOrder: z.number().int().min(0),
});

const phaseDetailSchema = z.object({
  workflowId: z.string(),
  phaseId: z.string(),
  sortOrder: z.number(),
  phase: z.object({
    id: z.string(),
    phaseName: z.string().nullable(),
    phaseShort: z.string().nullable(),
    phaseOrder: z.number().nullable(),
  }),
});

const workflowSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
    description: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    _count: z.object({ phases: z.number(), workOrders: z.number() }),
  })
  .passthrough();

const workflowDetailSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
    description: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    phases: z.array(phaseDetailSchema),
  })
  .passthrough();

const createBodySchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, digits, underscore or dash'),
  description: z.string().nullable().optional(),
  phases: z.array(phaseBindingSchema).optional(),
});

const updateBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  phases: z.array(phaseBindingSchema).optional(),
});

function actorIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).id;
}

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export const workflowRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Workflows'],
        summary: 'List workflows',
        description: 'Read configured product workflows. Optional active=true narrows the read model to active workflows.',
        operationId: 'listWorkflows',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'authenticated',
        querystring: z.object({ active: z.string().optional() }),
        response: { 200: z.array(workflowSummarySchema), 401: errorResponse },
      },
    },
    async (req) => {
      const activeOnly = req.query.active === 'true';
      return workflowService.listWorkflows({ activeOnly }, tenantIdOf(req));
    },
  );

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Workflows'],
        summary: 'Get workflow',
        description: 'Read one workflow with its ordered phase bindings.',
        operationId: 'getWorkflow',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: workflowDetailSchema, 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const workflow = await workflowService.getWorkflow(req.params.id, tenantIdOf(req));
      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }
      return workflow;
    },
  );

  app.post(
    '/',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Create workflow',
        description: 'Create a product workflow and, when supplied, its initial ordered phase bindings. Admin or owner role required.',
        operationId: 'createWorkflow',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        body: createBodySchema,
        response: {
          201: workflowDetailSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await workflowService.createWorkflow(req.body, actorIdOf(req), tenantIdOf(req));
        return reply.status(201).send(created);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2002') {
            return reply.status(409).send({ error: 'Workflow code already exists' });
          }
          if (err.code === 'P2003') {
            return reply.status(400).send({ error: 'Referenced phase does not exist' });
          }
        }
        throw err;
      }
    },
  );

  app.patch(
    '/:id',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Update workflow',
        description: 'Patch workflow metadata and optionally replace ordered phase bindings atomically. Admin or owner role required.',
        operationId: 'updateWorkflow',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: updateBodySchema,
        response: {
          200: workflowDetailSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const updated = await workflowService.updateWorkflow(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
        return updated;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'Workflow not found' });
          }
          if (err.code === 'P2002') {
            return reply.status(409).send({ error: 'Duplicate phase order or binding for this workflow' });
          }
          if (err.code === 'P2003') {
            return reply.status(400).send({ error: 'Referenced phase does not exist' });
          }
        }
        throw err;
      }
    },
  );
};

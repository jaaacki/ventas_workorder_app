import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { tenantIdOf, actorIdOf } from './requestContext.js';
import * as workflowService from '../services/workflowService.js';
import * as stepService from '../services/stepService.js';

const errorResponse = z.object({ error: z.string() });
const successResponse = z.object({ success: z.literal(true) });

const codeSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, digits, underscore or dash');

const stepSchema = z.object({
  id: z.string(),
  code: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  phaseId: z.string().nullable(),
});

const unplacedStepSchema = z.object({
  id: z.string(),
  code: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  sortOrder: z.number(),
});

const phaseSummarySchema = z.object({
  id: z.string(),
  phaseShort: z.string().nullable(),
  phaseName: z.string().nullable(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  isGate: z.boolean(),
  blocksCombine: z.boolean(),
  bomId: z.string().nullable(),
});

const phaseWithStepsSchema = phaseSummarySchema.extend({
  steps: z.array(stepSchema),
});

const workflowSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  phaseCount: z.number(),
  stepCount: z.number(),
});

const workflowDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  phases: z.array(phaseWithStepsSchema),
  unplacedSteps: z.array(unplacedStepSchema),
});

const createBodySchema = z.object({
  name: z.string().min(1),
  code: codeSchema,
  description: z.string().nullable().optional(),
});

const updateBodySchema = z.object({
  name: z.string().min(1).optional(),
  code: codeSchema.optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

const addPhaseBodySchema = z.object({
  phaseShort: z.string().trim().min(1).nullable().optional(),
  phaseName: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().nullable().optional(),
  isGate: z.boolean().optional(),
  blocksCombine: z.boolean().optional(),
  bomId: z.string().trim().min(1).nullable().optional(),
});

const reorderPhasesBodySchema = z.object({
  phaseIds: z.array(z.string().min(1)),
});

const addStepBodySchema = z.object({
  code: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().nullable().optional(),
  phaseId: z.string().trim().min(1).nullable().optional(),
});

export const workflowRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Workflows'],
        summary: 'List workflows',
        description: 'Read configured product workflows with phase and step counts. Optional active=true narrows the read model to active workflows.',
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
        description: 'Read one workflow with its ordered phases, each phase\'s ordered steps, and the unplaced step pool.',
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
        description: 'Create a product workflow. Phases and steps are added through the workflow configurator endpoints. Admin or owner role required.',
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
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return reply.status(409).send({ error: 'Workflow code already exists' });
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
        description: 'Patch workflow metadata (name, code, description, active). Admin or owner role required.',
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
        return await workflowService.updateWorkflow(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') return reply.status(404).send({ error: 'Workflow not found' });
          if (err.code === 'P2002') return reply.status(409).send({ error: 'Workflow code already exists' });
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
        summary: 'Delete workflow',
        description: 'Delete a workflow and cascade-delete its owned phases and steps. Admin or owner role required.',
        operationId: 'deleteWorkflow',
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
        return await workflowService.deleteWorkflow(req.params.id, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') return reply.status(404).send({ error: 'Workflow not found' });
          if (err.code === 'P2003') return reply.status(409).send({ error: 'Workflow is referenced by a work order and cannot be deleted' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/phases',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Add workflow phase',
        description: 'Append a new phase to a workflow (sortOrder = current max + 1). Admin or owner role required.',
        operationId: 'addPhase',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: addPhaseBodySchema,
        response: {
          201: phaseSummarySchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await workflowService.addPhase(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
        return reply.status(201).send(created);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') return reply.status(404).send({ error: 'Workflow not found' });
          if (err.code === 'P2003') return reply.status(400).send({ error: 'Referenced BOM does not exist' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/phases/reorder',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Reorder workflow phases',
        description: 'Set each phase sortOrder to its index in the supplied phaseIds ordering. Admin or owner role required.',
        operationId: 'reorderPhases',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: reorderPhasesBodySchema,
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
        return await workflowService.reorderPhases(req.params.id, req.body.phaseIds, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Workflow not found' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/steps',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Workflows'],
        summary: 'Add workflow step',
        description: 'Create a step for a workflow. Unplaced (pool) unless a phaseId is supplied. Admin or owner role required.',
        operationId: 'addWorkflowStep',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: addStepBodySchema,
        response: {
          201: stepSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await stepService.createStep(req.params.id, req.body, actorIdOf(req), tenantIdOf(req));
        return reply.status(201).send(created);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Workflow or phase not found' });
        }
        throw err;
      }
    },
  );
};

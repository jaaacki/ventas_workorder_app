import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as workOrderService from '../services/workOrderService.js';

const errorResponse = z.object({ error: z.string() });

const workflowRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
}).passthrough();

const phaseRefSchema = z.object({
  id: z.string(),
  phaseName: z.string().nullable(),
  phaseShort: z.string().nullable(),
  phaseOrder: z.number().nullable(),
});

const workOrderSummarySchema = z
  .object({
    id: z.string(),
    woNumber: z.string().nullable(),
    workflowId: z.string().nullable(),
    phaseOrder: z.number().nullable(),
    prodStart: z.date().nullable(),
    prodEnd: z.date().nullable(),
    workflow: workflowRefSchema.nullable(),
  })
  .passthrough();

const workOrderDetailSchema = z
  .object({
    id: z.string(),
    woNumber: z.string().nullable(),
    workflowId: z.string().nullable(),
    hetId: z.string().nullable(),
    phaseId: z.string().nullable(),
    phaseOrder: z.number().nullable(),
    prodStart: z.date().nullable(),
    prodEnd: z.date().nullable(),
    workflow: workflowRefSchema.nullable(),
    phase: phaseRefSchema.nullable(),
  })
  .passthrough();

const createBodySchema = z.object({
  workflowId: z.string().min(1),
  hetId: z.string().optional(),
});

const phaseSignoffBodySchema = z.object({
  signatureDataUrl: z.string().min(1).optional(),
}).optional();

function actorIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).id;
}

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export const workOrderRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'List work orders',
        description: 'Read active production work orders with workflow summaries for the production board.',
        operationId: 'listWorkOrders',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: z.array(workOrderSummarySchema), 401: errorResponse },
      },
    },
    async (req) => {
      return workOrderService.listWorkOrders(tenantIdOf(req));
    },
  );

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Get work order',
        description: 'Read one production work order with its workflow and current phase summary.',
        operationId: 'getWorkOrder',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: workOrderDetailSchema, 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const workOrder = await workOrderService.getWorkOrder(req.params.id, tenantIdOf(req));
      if (!workOrder) {
        return reply.status(404).send({ error: 'Work order not found' });
      }
      return workOrder;
    },
  );

  app.post(
    '/',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Work Orders'],
        summary: 'Create work order',
        description: 'Create a new production run at the first phase of the selected workflow. Admin or owner role required.',
        operationId: 'createWorkOrder',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        body: createBodySchema,
        response: {
          201: workOrderDetailSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await workOrderService.createWorkOrder(req.body, actorIdOf(req), tenantIdOf(req));
        return reply.status(201).send(created);
      } catch (err) {
        if (err instanceof Error && err.message === 'workflow has no phases configured') {
          return reply.status(400).send({ error: 'workflow has no phases configured' });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'Workflow not found' });
          }
          if (err.code === 'P2003') {
            return reply.status(400).send({ error: 'Referenced workflow or het does not exist' });
          }
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/start',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Start work order phase',
        description: 'Sign and mark the current work-order phase as started.',
        operationId: 'startWorkOrderPhase',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        body: phaseSignoffBodySchema,
        response: {
          200: workOrderDetailSchema,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await workOrderService.startWorkOrderPhase(req.params.id, actorIdOf(req), req.body?.signatureDataUrl, tenantIdOf(req));
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot start:')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Work order not found' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/finish',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Finish work order phase',
        description: 'Sign and mark the current work-order phase as finished.',
        operationId: 'finishWorkOrderPhase',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        body: phaseSignoffBodySchema,
        response: {
          200: workOrderDetailSchema,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await workOrderService.finishWorkOrderPhase(req.params.id, actorIdOf(req), req.body?.signatureDataUrl, tenantIdOf(req));
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot finish:')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Work order not found' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/advance',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Advance work order',
        description: 'Move a production run to the next workflow phase when lifecycle gates are satisfied.',
        operationId: 'advanceWorkOrder',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: {
          200: workOrderDetailSchema,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await workOrderService.advanceWorkOrder(req.params.id, actorIdOf(req), tenantIdOf(req));
      } catch (err) {
        if (err instanceof Error && err.message === 'work order is at its final phase') {
          return reply.status(409).send({ error: 'work order is at its final phase' });
        }
        if (err instanceof Error && err.message.startsWith('sterilisation/BET gate')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Error && err.message.startsWith('cannot advance:')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'Work order not found' });
          }
        }
        throw err;
      }
    },
  );
};

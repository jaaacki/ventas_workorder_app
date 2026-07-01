import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import * as workOrderService from '../services/workOrderService.js';
import * as inventoryTraceService from '../services/inventoryTraceService.js';
import { inventoryTraceSchema } from './inventoryTraceSchemas.js';

const errorResponse = z.object({ error: z.string() });
const decimalish = z.union([z.number(), z.string(), z.custom<Prisma.Decimal>()]);

const workflowRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  phases: z
    .array(
      z.object({
        sortOrder: z.number(),
        phase: z.object({
          id: z.string(),
          phaseName: z.string().nullable(),
          phaseShort: z.string().nullable(),
          phaseOrder: z.number().nullable(),
        }),
      }),
    )
    .optional(),
});

const phaseRefSchema = z.object({
  id: z.string(),
  phaseName: z.string().nullable(),
  phaseShort: z.string().nullable(),
  phaseOrder: z.number().nullable(),
});

const workOrderPhaseTimelineSchema = z.object({
  id: z.string(),
  phaseName: z.string().nullable(),
  phaseShort: z.string().nullable(),
  phaseOrder: z.number().nullable(),
  sortOrder: z.number(),
  state: z.string(),
});

const workOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdById: z.string().nullable(),
  updatedById: z.string().nullable(),
  hetId: z.string().nullable(),
  phaseId: z.string().nullable(),
  phaseOrder: z.number().nullable(),
  phaseShort: z.string().nullable(),
  prodStart: z.date().nullable(),
  startSignPath: z.string().nullable(),
  startSignById: z.string().nullable(),
  prodEnd: z.date().nullable(),
  endSignPath: z.string().nullable(),
  endSignById: z.string().nullable(),
  prodDuration: decimalish.nullable(),
  outputQuantity: decimalish.nullable(),
  imagePath: z.string().nullable(),
  releaseStatus: z.string().nullable(),
  releaseDecisionAt: z.date().nullable(),
  releaseDecisionById: z.string().nullable(),
  releaseRemarks: z.string().nullable(),
  manuId: z.string().nullable(),
  manuNumber: z.string().nullable(),
  woNumber: z.string().nullable(),
  reportPdfPath: z.string().nullable(),
  deleted: z.boolean(),
  forceField: z.number().nullable(),
  keyText: z.string().nullable(),
  previousWoId: z.string().nullable(),
  steralisationCurrentId: z.string().nullable(),
  nextPhaseId: z.string().nullable(),
  workflowId: z.string().nullable(),
  workflow: workflowRefSchema.nullable(),
  phase: phaseRefSchema.nullable(),
  nextPhase: phaseRefSchema.nullable(),
  het: z.object({ id: z.string(), hetNumber: z.string().nullable(), clinicName: z.string().nullable(), quantity: z.number().nullable() }).nullable(),
  manufacturer: z.object({ id: z.string(), manuNumber: z.string().nullable(), manuName: z.string().nullable() }).nullable(),
  steralisationCurrent: z.object({ id: z.string(), result: z.boolean().nullable(), createdAt: z.date() }).nullable(),
  sterilises: z.array(z.object({ id: z.string(), direction: z.string().nullable(), result: z.boolean().nullable(), betReading: decimalish.nullable(), quantity: z.number().nullable(), createdAt: z.date() })),
  woSerials: z.array(z.object({ id: z.string(), serialNumber: z.string().nullable(), bomRef: z.object({ id: z.string(), description: z.string().nullable(), quantity: decimalish.nullable(), uom: z.string().nullable(), hasSerial: z.boolean() }) })),
  phaseEquips: z.array(z.object({ phaseEquip: z.object({ id: z.string(), equipId: z.string().nullable(), name: z.string().nullable() }) })),
  batchHets: z.array(z.object({ hetId: z.string() })),
  lifecycleState: z.string(),
  operationalStatus: z.string(),
  readinessBlockers: z.array(z.string()),
  currentPhaseLabel: z.string(),
  phaseOrderCurrent: z.number().nullable(),
  legacyProductionState: z.string(),
  legacyStateBucket: z.string(),
  canAdvanceLegacy: z.boolean(),
  advanceRequirements: z.array(z.object({ key: z.string(), label: z.string(), met: z.boolean(), parityGap: z.boolean().optional() })),
  missingAdvanceRequirements: z.array(z.string()),
  parityGaps: z.array(z.string()),
  serialCheckDone: z.boolean(),
  serialRequiredCount: z.number(),
  requiredSerials: z.array(z.object({
    bomRefId: z.string(),
    description: z.string().nullable(),
    quantity: decimalish.nullable(),
    uom: z.string().nullable(),
    serialNumber: z.string().nullable(),
  })),
  allowedEquipment: z.array(z.object({
    phaseEquipId: z.string(),
    equipId: z.string().nullable(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    recorded: z.boolean(),
  })),
  combinedHetCheck: z.boolean(),
  phaseTimeline: z.array(workOrderPhaseTimelineSchema),
  counts: z.object({ serials: z.number(), equipment: z.number(), sterilisationRecords: z.number() }),
});

const workOrderSummarySchema = workOrderSchema;
const workOrderDetailSchema = workOrderSchema;
const qaWorkOrderQueueSchema = z.object({
  counts: z.object({
    sterilisation: z.number(),
    quarantine: z.number(),
    release: z.number(),
  }),
  sterilisation: z.array(workOrderSummarySchema),
  quarantine: z.array(workOrderSummarySchema),
  release: z.array(workOrderSummarySchema),
});

const auditStateSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  workflowId: z.string().nullable(),
  phaseId: z.string().nullable(),
  phaseOrder: z.number().nullable(),
  hetId: z.string().nullable(),
  prodStart: z.string().nullable(),
  prodEnd: z.string().nullable(),
  prodDurationMinutes: z.string().nullable(),
  outputQuantity: z.string().nullable(),
  releaseStatus: z.string().nullable(),
  releaseDecisionAt: z.string().nullable(),
  imageCaptured: z.boolean().nullable().optional(),
  equipmentCount: z.number().nullable().optional(),
  serialCount: z.number().nullable().optional(),
}).nullable();

const workOrderAuditEventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  workOrderId: z.string(),
  action: z.string(),
  actorId: z.string().nullable(),
  source: z.string(),
  previousState: auditStateSchema,
  newState: auditStateSchema,
  createdAt: z.date(),
});

const createBodySchema = z.object({
  workflowId: z.string().min(1),
  hetId: z.string().optional(),
});

const phaseSignoffBodySchema = z.object({
  signatureDataUrl: z.string().min(1).optional(),
}).optional();

const serialBodySchema = z.object({
  bomRefId: z.string().min(1),
  serialNumber: z.string().trim().min(1),
});

const outputQuantityBodySchema = z.object({
  outputQuantity: z.union([z.number().positive(), z.string().trim().min(1)]),
});

const equipmentBodySchema = z.object({
  phaseEquipId: z.string().min(1),
});

const photoEvidenceBodySchema = z.object({
  imageDataUrl: z.string().trim().min(1),
});

const releaseBodySchema = z.object({
  releaseStatus: z.enum(['released', 'quarantined', 'rejected']),
  remarks: z.string().trim().max(2000).optional(),
});

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
    '/qa-queue',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders', 'Sterilisation'],
        summary: 'List QA and release work-order queues',
        description: 'Read focused QA queues for sterilisation/BET gate work, quarantine review, and final release readiness.',
        operationId: 'listQaWorkOrderQueue',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: qaWorkOrderQueueSchema, 401: errorResponse },
      },
    },
    async (req) => {
      return workOrderService.listQaWorkOrderQueue(tenantIdOf(req));
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

  app.get(
    '/:id/inventory-trace',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders', 'Inventory'],
        summary: 'Get work order inventory trace',
        description: 'Read inventory lots, movements, consumptions, genealogy, and HET links associated with a work order. Example: GET /api/work-orders/WO-1001/inventory-trace.',
        operationId: 'getWorkOrderInventoryTrace',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: inventoryTraceSchema, 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const trace = await inventoryTraceService.getWorkOrderInventoryTrace(req.params.id, tenantIdOf(req));
      if (!trace) return reply.status(404).send({ error: 'Work order not found' });
      return trace;
    },
  );

  app.get(
    '/:id/audit-events',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'List work order audit events',
        description: 'Read the append-only audit trail for controlled work-order lifecycle actions. Example: GET /api/work-orders/WO-1001/audit-events.',
        operationId: 'listWorkOrderAuditEvents',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        response: { 200: z.array(workOrderAuditEventSchema), 401: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const events = await workOrderService.listWorkOrderAuditEvents(req.params.id, tenantIdOf(req));
      if (!events) {
        return reply.status(404).send({ error: 'Work order not found' });
      }
      return events;
    },
  );

  app.post(
    '/:id/equipment',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Record work order equipment',
        description: 'Capture equipment used for the current work-order phase from the phase allowed-equipment catalog.',
        operationId: 'recordWorkOrderEquipment',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        body: equipmentBodySchema,
        response: {
          200: workOrderDetailSchema,
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await workOrderService.recordWorkOrderEquipment(
          req.params.id,
          { phaseEquipId: req.body.phaseEquipId },
          actorIdOf(req),
          tenantIdOf(req),
        );
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot record equipment:')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'Work order not found' });
          }
          if (err.code === 'P2003') {
            return reply.status(400).send({ error: 'Referenced equipment does not exist' });
          }
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/photo-evidence',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Record work order photo evidence',
        description: 'Capture required image/photo evidence for the current work order before phase advancement.',
        operationId: 'recordWorkOrderPhotoEvidence',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        body: photoEvidenceBodySchema,
        response: {
          200: workOrderDetailSchema,
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await workOrderService.recordWorkOrderPhotoEvidence(
          req.params.id,
          { imageDataUrl: req.body.imageDataUrl },
          actorIdOf(req),
          tenantIdOf(req),
        );
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot record photo evidence:')) {
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
    '/:id/output-quantity',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Record work order output quantity',
        description: 'Capture or replace the produced output quantity for a work order phase as controlled production evidence.',
        operationId: 'recordWorkOrderOutputQuantity',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        body: outputQuantityBodySchema,
        response: {
          200: workOrderDetailSchema,
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await workOrderService.recordWorkOrderOutputQuantity(
          req.params.id,
          { outputQuantity: req.body.outputQuantity },
          actorIdOf(req),
          tenantIdOf(req),
        );
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot record output quantity:')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Work order not found' });
        }
        if (err instanceof Error && err.name === 'Error' && err.message.includes('Invalid argument')) {
          return reply.status(400).send({ error: 'Invalid output quantity' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/:id/release',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Record work order release disposition',
        description: 'Record final QA release disposition for a final-phase work order that has finished production.',
        operationId: 'recordWorkOrderRelease',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        body: releaseBodySchema,
        response: {
          200: workOrderDetailSchema,
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await workOrderService.recordWorkOrderRelease(
          req.params.id,
          { releaseStatus: req.body.releaseStatus, remarks: req.body.remarks },
          actorIdOf(req),
          tenantIdOf(req),
        );
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot release:')) {
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
    '/:id/serials',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Work Orders'],
        summary: 'Record work order serial',
        description: 'Capture or replace one serial value for a serial-required BOM line on the work order current phase.',
        operationId: 'recordWorkOrderSerial',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'lifecycle-action',
        'x-auth': 'authenticated',
        params: z.object({ id: z.string() }),
        body: serialBodySchema,
        response: {
          200: workOrderDetailSchema,
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await workOrderService.recordWorkOrderSerial(
          req.params.id,
          {
            bomRefId: req.body.bomRefId,
            serialNumber: req.body.serialNumber,
          },
          actorIdOf(req),
          tenantIdOf(req),
        );
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot record serial:')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply.status(404).send({ error: 'Work order not found' });
          }
          if (err.code === 'P2003') {
            return reply.status(400).send({ error: 'Referenced BOM line does not exist' });
          }
        }
        throw err;
      }
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

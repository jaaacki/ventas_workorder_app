import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { tenantIdOf } from './requestContext.js';
import { getBatchRecord, listFinishedGoodsLots, renderBatchRecordPdf } from '../services/batchRecordService.js';

const errorResponse = z.object({ error: z.string() });
const decimalish = z.union([z.number(), z.string(), z.custom<Prisma.Decimal>()]);

// Roles allowed to read the full batch record. Fine-grained permission keys are
// epic #208; the LOT list itself is any-authenticated so it can back an
// all-roles nav entry.
const BATCH_RECORD_ROLES = ['admin', 'owner', 'qa_manager', 'production_manager'] as const;

const finishedGoodLotSchema = z.object({
  id: z.string(),
  lotNumber: z.string().nullable(),
  status: z.string(),
  quantity: decimalish.nullable(),
  uom: z.string().nullable(),
  product: z.string().nullable(),
  releaseStatus: z.string().nullable(),
  releasedAt: z.date().nullable(),
  workOrderId: z.string().nullable(),
  hetNumber: z.string().nullable(),
  clinicName: z.string().nullable(),
  createdAt: z.date(),
});

const staffName = z.string().nullable();

const batchRecordSchema = z.object({
  lot: z.object({
    id: z.string(),
    lotNumber: z.string().nullable(),
    inventoryType: z.string(),
    status: z.string(),
    quantityInitial: decimalish.nullable(),
    quantityCurrent: decimalish.nullable(),
    uom: z.string().nullable(),
    createdAt: z.date(),
  }),
  manufacturer: z
    .object({ manuNumber: z.string().nullable(), manuName: z.string().nullable() })
    .nullable(),
  release: z
    .object({
      status: z.string().nullable(),
      decisionAt: z.date().nullable(),
      decidedBy: staffName,
      remarks: z.string().nullable(),
    })
    .nullable(),
  hetOrigin: z
    .object({
      hetId: z.string(),
      hetNumber: z.string().nullable(),
      clinicName: z.string().nullable(),
      HCICode: z.string().nullable(),
    })
    .nullable(),
  genealogyParents: z.array(
    z.object({
      id: z.string(),
      lotNumber: z.string().nullable(),
      inventoryType: z.string(),
      hetId: z.string().nullable(),
      relationshipType: z.string(),
    }),
  ),
  phases: z.array(
    z.object({
      workOrderId: z.string(),
      woNumber: z.string().nullable(),
      phase: z
        .object({
          id: z.string(),
          phaseName: z.string().nullable(),
          phaseShort: z.string().nullable(),
          sortOrder: z.number().nullable(),
          isGate: z.boolean(),
        })
        .nullable(),
      prodStart: z.date().nullable(),
      prodEnd: z.date().nullable(),
      prodDuration: decimalish.nullable(),
      outputQuantity: decimalish.nullable(),
      photoDataUrl: z.string().nullable(),
      startSignature: z
        .object({ dataUrl: z.string(), signer: staffName, at: z.date().nullable() })
        .nullable(),
      endSignature: z
        .object({ dataUrl: z.string(), signer: staffName, at: z.date().nullable() })
        .nullable(),
      serials: z.array(
        z.object({
          id: z.string(),
          serialNumber: z.string().nullable(),
          bomLine: z
            .object({
              id: z.string(),
              description: z.string().nullable(),
              quantity: decimalish.nullable(),
              uom: z.string().nullable(),
              inventorySku: z
                .object({ id: z.string(), sku: z.string().nullable(), description: z.string().nullable() })
                .nullable(),
            })
            .nullable(),
        }),
      ),
      equipment: z.array(
        z.object({
          phaseEquipId: z.string(),
          equipId: z.string().nullable(),
          name: z.string().nullable(),
        }),
      ),
      sterilisations: z.array(
        z.object({
          id: z.string(),
          direction: z.string().nullable(),
          result: z.boolean().nullable(),
          betReading: decimalish.nullable(),
          signOn: z.date().nullable(),
          signer: staffName,
          signatureDataUrl: z.string().nullable(),
        }),
      ),
    }),
  ),
});

export const lotRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Inventory'],
        summary: 'List finished-goods lots',
        description: 'Read the finished-goods LOT list: lot number, product, released date, quantity, HET/clinic origin, and status.',
        operationId: 'listFinishedGoodsLots',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: {
          200: z.array(finishedGoodLotSchema),
          401: errorResponse,
        },
      },
    },
    async (req) => {
      return listFinishedGoodsLots(tenantIdOf(req));
    },
  );

  app.get(
    '/:lotNumber/batch-record',
    {
      onRequest: [app.requireRole(...BATCH_RECORD_ROLES)],
      schema: {
        tags: ['Manufacturing'],
        summary: 'Get finished-goods batch record',
        description: 'Assemble the full phase-by-phase batch record for a finished-goods lot: run chain, evidence, signatures, sterilisation/BET, HET origin, and genealogy. Read-only.',
        operationId: 'getLotBatchRecord',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'role',
        'x-required-roles': [...BATCH_RECORD_ROLES],
        params: z.object({ lotNumber: z.string() }),
        response: {
          200: batchRecordSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return await getBatchRecord(req.params.lotNumber, tenantIdOf(req));
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot assemble batch record:')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Finished-goods lot not found' });
        }
        throw err;
      }
    },
  );

  app.get(
    '/:lotNumber/batch-record.pdf',
    {
      onRequest: [app.requireRole(...BATCH_RECORD_ROLES)],
      // Binary stream: hidden from the JSON OpenAPI contract (it has no JSON
      // response body). Params are still validated at runtime.
      schema: { hide: true, params: z.object({ lotNumber: z.string() }) },
    },
    async (req, reply) => {
      try {
        const record = await getBatchRecord(req.params.lotNumber, tenantIdOf(req));
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `inline; filename="batch-record-${req.params.lotNumber}.pdf"`);
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        renderBatchRecordPdf(doc, record);
        doc.end();
        return reply.send(doc);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('cannot assemble batch record:')) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.status(404).send({ error: 'Finished-goods lot not found' });
        }
        throw err;
      }
    },
  );
};

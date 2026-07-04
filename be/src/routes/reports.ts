import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { tenantIdOf } from './requestContext.js';
import { getCollectionReport } from '../services/collectionReportService.js';

const errorResponse = z.object({ error: z.string() });

// Same coarse manager gate as the metrics read model (epic #208 will unify onto
// fine-grained metrics.* / workOrder.* keys).
const REPORT_ROLES = ['owner', 'admin', 'production_manager', 'qa_manager'] as const;

const collectionReportSchema = z.object({
  from: z.date().nullable(),
  to: z.date().nullable(),
  clinicId: z.string().nullable(),
  groupBy: z.enum(['week', 'month']),
  generatedAt: z.date(),
  total: z.number(),
  byClinic: z.array(
    z.object({
      clinicId: z.string().nullable(),
      clinicName: z.string().nullable(),
      hciCode: z.string().nullable(),
      count: z.number(),
    }),
  ),
  byPeriod: z.array(z.object({ period: z.string(), count: z.number() })),
});

export const reportRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/collections',
    {
      onRequest: [app.requireRole(...REPORT_ROLES)],
      schema: {
        tags: ['Reports'],
        summary: 'Get collections report per clinic and period',
        description:
          'Manager collection report: minted/collected HETs counted per clinic and per week/month period. Filter by clinic (clinicId) and date window (from/to, on HET collection date). Tenant-scoped, role-gated, read-only. Example: GET /api/reports/collections?groupBy=month&from=2026-01-01.',
        operationId: 'getCollectionReport',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'role',
        'x-required-roles': [...REPORT_ROLES],
        querystring: z.object({
          clinicId: z.string().optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
          groupBy: z.enum(['week', 'month']).optional(),
        }),
        response: {
          200: collectionReportSchema,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req) => {
      return getCollectionReport({
        tenantId: tenantIdOf(req),
        clinicId: req.query.clinicId ?? null,
        from: req.query.from ?? null,
        to: req.query.to ?? null,
        groupBy: req.query.groupBy,
      });
    },
  );
};

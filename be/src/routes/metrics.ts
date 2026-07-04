import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { tenantIdOf } from './requestContext.js';
import { getMetricsOverview } from '../services/metricsService.js';

const errorResponse = z.object({ error: z.string() });

// Coarse role gate for manager metrics. Fine-grained metrics.* / workOrder.*
// permission keys are a follow-up under epic #208 (RBAC unification).
const METRICS_ROLES = ['owner', 'admin', 'production_manager', 'qa_manager'] as const;

const throughputPointSchema = z.object({
  period: z.string(),
  released: z.number(),
  lotsMinted: z.number(),
});

const metricsOverviewSchema = z.object({
  windowDays: z.number(),
  stalledDays: z.number(),
  generatedAt: z.date(),
  cycleTimeByPhase: z.array(
    z.object({
      phaseShort: z.string(),
      count: z.number(),
      avgMinutes: z.number(),
      p50Minutes: z.number(),
      p90Minutes: z.number(),
    }),
  ),
  wipByPhase: z.array(z.object({ phaseShort: z.string().nullable(), count: z.number() })),
  throughput: z.object({
    weekly: z.array(throughputPointSchema),
    monthly: z.array(throughputPointSchema),
  }),
  stalledRuns: z.array(
    z.object({
      id: z.string(),
      woNumber: z.string().nullable(),
      phaseShort: z.string().nullable(),
      ageDays: z.number(),
      updatedAt: z.date(),
    }),
  ),
  collectionPipeline: z.array(z.object({ status: z.string(), count: z.number() })),
});

export const metricsRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/overview',
    {
      onRequest: [app.requireRole(...METRICS_ROLES)],
      schema: {
        tags: ['Metrics'],
        summary: 'Get manager metrics overview',
        description:
          'Production-manager line-health read model: cycle time per phase (avg/p50/p90), WIP by phase, weekly/monthly throughput (released runs and minted finished-goods lots), stalled runs, and collection pipeline counts. Tenant-scoped and windowed by windowDays/stalledDays. Read-only.',
        operationId: 'getMetricsOverview',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'role',
        'x-required-roles': [...METRICS_ROLES],
        querystring: z.object({
          windowDays: z.coerce.number().int().min(1).max(730).optional(),
          stalledDays: z.coerce.number().int().min(1).max(365).optional(),
        }),
        response: {
          200: metricsOverviewSchema,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req) => {
      return getMetricsOverview({
        tenantId: tenantIdOf(req),
        windowDays: req.query.windowDays,
        stalledDays: req.query.stalledDays,
      });
    },
  );
};

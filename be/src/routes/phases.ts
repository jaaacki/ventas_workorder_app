import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
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
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: { 200: z.array(phaseCatalogSchema), 401: errorResponse },
      },
    },
    async (req) => phaseService.listPhases(tenantIdOf(req)),
  );
};

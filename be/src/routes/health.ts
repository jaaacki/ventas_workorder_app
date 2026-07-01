import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const healthRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/',
    {
      schema: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns a small liveness payload used by CI, Docker, and reverse-proxy health checks.',
        operationId: 'getHealth',
        'x-route-kind': 'health',
        'x-auth': 'anonymous',
        response: {
          200: z.object({ status: z.literal('ok') }),
        },
      },
    },
    async () => ({ status: 'ok' as const }),
  );
};

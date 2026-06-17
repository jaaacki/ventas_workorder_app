import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const healthRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get('/', async () => ({ status: 'ok' }));
};

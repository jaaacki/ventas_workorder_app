import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { parseEnv } from './config/env.js';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './auth/routes.js';
import { oauthRoutes } from './auth/oauth.js';
import { healthRoutes } from './routes/health.js';

async function buildServer() {
  const config = parseEnv();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('config', config);

  await app.register(cookie, {
    secret: config.JWT_SECRET,
    parseOptions: {},
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN || true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
  });

  await app.register(authPlugin);

  await app.register(healthRoutes, { prefix: '/api/health' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(oauthRoutes, { prefix: '/api/auth/oauth' });

  return app;
}

async function start() {
  const app = await buildServer();
  const port = Number(app.config.PORT || 3001);
  await app.listen({ port, host: '0.0.0.0' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { buildServer };

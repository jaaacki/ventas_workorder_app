import swagger from '@fastify/swagger';
import type { FastifyInstance, FastifySchema } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

type OpenApiFastifyInstance = FastifyInstance & {
  swagger: () => unknown;
};

const hiddenSchema = { hide: true } as unknown as FastifySchema;

export async function registerOpenApi(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Ventas Work Order API',
        description:
          'MES-lite API for Ventas/AmGraft work orders, workflow configuration, HET tracking, sterilisation gates, manufacturing batch records, and user administration.',
        version: '0.1.0',
      },
      servers: [
        { url: 'http://localhost:3001', description: 'Local Docker backend' },
        { url: 'https://stg-workorder.ventas.bio', description: 'Staging' },
      ],
      tags: [
        { name: 'Health', description: 'Service health checks.' },
        { name: 'Auth', description: 'Local login, staff, role, and OAuth endpoints.' },
        { name: 'Workflows', description: 'Controlled workflow configuration resource endpoints.' },
        { name: 'Work Orders', description: 'Production-run read and lifecycle action endpoints.' },
        { name: 'Sterilisation', description: 'Sterilisation and BET gate records.' },
        { name: 'Manufacturing', description: 'Manufacturing batch-record actions and reads.' },
        { name: 'HETs', description: 'HET register reads and lifecycle linkage actions.' },
        { name: 'Procurement', description: 'Read models for collection-unit procurement traceability and import audit records.' },
        { name: 'Inventory', description: 'Read models for inventory lots, transactions, locations, genealogy, and import audit records.' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  app.get('/api/openapi.json', { schema: hiddenSchema }, async (_req, reply) => {
    return reply.send((app as OpenApiFastifyInstance).swagger());
  });

  app.get('/api/docs', { schema: hiddenSchema }, async (_req, reply) => {
    return reply.type('text/html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ventas Work Order API</title>
  </head>
  <body>
    <main>
      <h1>Ventas Work Order API</h1>
      <p>The machine-readable OpenAPI contract is available at <a href="/api/openapi.json">/api/openapi.json</a>.</p>
      <p>Routes are classified with OpenAPI tags and <code>x-route-kind</code> metadata so follow-up work can distinguish resource CRUD, lifecycle actions, auth, and health endpoints.</p>
    </main>
  </body>
</html>`);
  });
}

import { describe, expect, it, afterEach, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';

function stubRequiredEnv() {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgresql://workorder:workorder@localhost:5432/workorder_test');
  vi.stubEnv('JWT_SECRET', 'test-secret-at-least-16-chars');
  vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
}

function normalizedPaths(doc: OpenAPIV3.Document) {
  return Object.keys(doc.paths).map((path) => path.replace(/\/$/, ''));
}

function pathItem(doc: OpenAPIV3.Document, path: string) {
  return doc.paths[path] ?? doc.paths[`${path}/`];
}

describe('OpenAPI contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('exposes the current API inventory with route classification and auth metadata', async () => {
    stubRequiredEnv();
    const { buildServer } = await import('../server.js');
    const app = await buildServer();

    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const doc = JSON.parse(response.body) as OpenAPIV3.Document;
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('Ventas Work Order API');
    expect(doc.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });

    expect(normalizedPaths(doc)).toEqual(
      expect.arrayContaining([
        '/api/health',
        '/api/auth/login',
        '/api/auth/me',
        '/api/auth/oauth/{provider}/authorize',
        '/api/workflows',
        '/api/workflows/{id}',
        '/api/work-orders',
        '/api/work-orders/{id}',
        '/api/work-orders/{id}/advance',
        '/api/sterilisation',
        '/api/manufacturing/generate',
        '/api/manufacturing/{id}',
        '/api/hets',
        '/api/hets/{id}/use',
        '/api/hets/{id}/finish',
        '/api/procurement/overview',
        '/api/procurement/supply-entities',
        '/api/procurement/collection-points',
        '/api/procurement/collection-units',
        '/api/procurement/collection-units/{id}',
        '/api/procurement/issuance-orders',
        '/api/procurement/collection-orders',
        '/api/procurement/collection-receipts',
        '/api/procurement/import-reports',
        '/api/inventory/overview',
        '/api/inventory/skus',
        '/api/inventory/lots',
        '/api/inventory/transactions',
        '/api/inventory/locations',
        '/api/inventory/genealogy/{lotId}',
        '/api/inventory/import-reports',
      ]),
    );

    const login = doc.paths['/api/auth/login']?.post;
    expect(login?.tags).toEqual(['Auth']);
    expect(login?.security).toBeUndefined();
    expect(login?.['x-route-kind']).toBe('auth');

    const listWorkflows = pathItem(doc, '/api/workflows')?.get;
    expect(listWorkflows?.tags).toEqual(['Workflows']);
    expect(listWorkflows?.security).toEqual([{ bearerAuth: [] }]);
    expect(listWorkflows?.['x-route-kind']).toBe('resource-crud');

    const advanceWorkOrder = pathItem(doc, '/api/work-orders/{id}/advance')?.post;
    expect(advanceWorkOrder?.tags).toEqual(['Work Orders']);
    expect(advanceWorkOrder?.security).toEqual([{ bearerAuth: [] }]);
    expect(advanceWorkOrder?.['x-route-kind']).toBe('lifecycle-action');

    const listCollectionUnits = pathItem(doc, '/api/procurement/collection-units')?.get;
    expect(listCollectionUnits?.tags).toEqual(['Procurement']);
    expect(listCollectionUnits?.security).toEqual([{ bearerAuth: [] }]);
    expect(listCollectionUnits?.['x-route-kind']).toBe('read-model');
    expect(listCollectionUnits?.description).toContain('status=received');

    const procurementReports = pathItem(doc, '/api/procurement/import-reports')?.get;
    expect(procurementReports?.tags).toEqual(['Procurement']);
    expect(procurementReports?.['x-route-kind']).toBe('import-admin');

    const listInventoryLots = pathItem(doc, '/api/inventory/lots')?.get;
    expect(listInventoryLots?.tags).toEqual(['Inventory']);
    expect(listInventoryLots?.security).toEqual([{ bearerAuth: [] }]);
    expect(listInventoryLots?.['x-route-kind']).toBe('read-model');
    expect(listInventoryLots?.description).toContain('inventoryType=HET');

    const inventoryGenealogy = pathItem(doc, '/api/inventory/genealogy/{lotId}')?.get;
    expect(inventoryGenealogy?.operationId).toBe('getInventoryGenealogy');
    expect(inventoryGenealogy?.['x-route-kind']).toBe('read-model');
  });

  it('serves a human-readable docs landing page that points to the JSON contract', async () => {
    stubRequiredEnv();
    const { buildServer } = await import('../server.js');
    const app = await buildServer();

    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/docs' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('/api/openapi.json');
  });
});

import { describe, expect, it, afterEach, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';

type RouteKind = 'auth' | 'health' | 'import-admin' | 'lifecycle-action' | 'read-model' | 'resource-crud';
type AuthKind = 'anonymous' | 'authenticated' | 'role';

type ExpectedOperation = {
  method: OpenAPIV3.HttpMethods;
  path: string;
  operationId: string;
  routeKind: RouteKind;
  auth: AuthKind;
  requiredRoles?: string[];
};

const expectedOperations: ExpectedOperation[] = [
  { method: 'get', path: '/api/health', operationId: 'getHealth', routeKind: 'health', auth: 'anonymous' },
  { method: 'post', path: '/api/auth/login', operationId: 'login', routeKind: 'auth', auth: 'anonymous' },
  { method: 'post', path: '/api/auth/register', operationId: 'registerStaff', routeKind: 'auth', auth: 'role', requiredRoles: ['owner'] },
  { method: 'get', path: '/api/auth/me', operationId: 'getCurrentUser', routeKind: 'auth', auth: 'authenticated' },
  { method: 'post', path: '/api/auth/logout', operationId: 'logout', routeKind: 'auth', auth: 'authenticated' },
  { method: 'get', path: '/api/auth/roles', operationId: 'listRoles', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'patch', path: '/api/auth/roles/{id}', operationId: 'updateRole', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['owner'] },
  { method: 'get', path: '/api/auth/staff', operationId: 'listStaff', routeKind: 'read-model', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'patch', path: '/api/auth/staff/{id}/role', operationId: 'updateStaffRole', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['owner'] },
  { method: 'patch', path: '/api/auth/staff/{id}/active', operationId: 'updateStaffActive', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/auth/oauth/{provider}/authorize', operationId: 'authorizeOAuthProvider', routeKind: 'auth', auth: 'anonymous' },
  { method: 'get', path: '/api/auth/oauth/{provider}/callback', operationId: 'handleOAuthCallback', routeKind: 'auth', auth: 'anonymous' },
  { method: 'get', path: '/api/workflows', operationId: 'listWorkflows', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'post', path: '/api/workflows', operationId: 'createWorkflow', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/workflows/{id}', operationId: 'getWorkflow', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'patch', path: '/api/workflows/{id}', operationId: 'updateWorkflow', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/work-orders', operationId: 'listWorkOrders', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders', operationId: 'createWorkOrder', routeKind: 'lifecycle-action', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/work-orders/{id}', operationId: 'getWorkOrder', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/work-orders/{id}/audit-events', operationId: 'listWorkOrderAuditEvents', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/work-orders/{id}/inventory-trace', operationId: 'getWorkOrderInventoryTrace', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders/{id}/start', operationId: 'startWorkOrderPhase', routeKind: 'lifecycle-action', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders/{id}/finish', operationId: 'finishWorkOrderPhase', routeKind: 'lifecycle-action', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders/{id}/advance', operationId: 'advanceWorkOrder', routeKind: 'lifecycle-action', auth: 'authenticated' },
  { method: 'post', path: '/api/sterilisation', operationId: 'createSterilisation', routeKind: 'lifecycle-action', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/sterilisation', operationId: 'listSterilisations', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'patch', path: '/api/sterilisation/{id}', operationId: 'setSterilisationResult', routeKind: 'lifecycle-action', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'post', path: '/api/manufacturing/generate', operationId: 'generateBatchRecord', routeKind: 'lifecycle-action', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/manufacturing/{id}', operationId: 'getBatchRecord', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/hets', operationId: 'listHets', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/hets/{id}/inventory-trace', operationId: 'getHetInventoryTrace', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'post', path: '/api/hets/{id}/use', operationId: 'useHet', routeKind: 'lifecycle-action', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'post', path: '/api/hets/{id}/finish', operationId: 'finishHet', routeKind: 'lifecycle-action', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/procurement/overview', operationId: 'getProcurementOverview', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/supply-entities', operationId: 'listSupplyEntities', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/collection-points', operationId: 'listCollectionPoints', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/collection-units', operationId: 'listCollectionUnits', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/collection-units/{id}', operationId: 'getCollectionUnit', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/collection-units/{id}/inventory-trace', operationId: 'getCollectionUnitInventoryTrace', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/issuance-orders', operationId: 'listIssuanceOrders', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/collection-orders', operationId: 'listCollectionOrders', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/collection-receipts', operationId: 'listCollectionReceipts', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/procurement/import-reports', operationId: 'listProcurementImportReports', routeKind: 'import-admin', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/inventory/overview', operationId: 'getInventoryOverview', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/inventory/skus', operationId: 'listInventorySkus', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/inventory/lots', operationId: 'listInventoryLots', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/inventory/lots/{id}', operationId: 'getInventoryLot', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/inventory/transactions', operationId: 'listInventoryTransactions', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/inventory/locations', operationId: 'listInventoryLocations', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/inventory/genealogy/{lotId}', operationId: 'getInventoryGenealogy', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/inventory/import-reports', operationId: 'listInventoryImportReports', routeKind: 'import-admin', auth: 'role', requiredRoles: ['admin', 'owner'] },
];

const httpMethods = new Set<OpenAPIV3.HttpMethods>(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']);

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

function operationInventory(doc: OpenAPIV3.Document) {
  return Object.entries(doc.paths)
    .flatMap(([path, item]) => {
      const normalizedPath = path.replace(/\/$/, '');
      return Object.entries(item ?? {})
        .filter(([method]) => httpMethods.has(method as OpenAPIV3.HttpMethods))
        .map(([method, operation]) => ({
          method: method as OpenAPIV3.HttpMethods,
          path: normalizedPath,
          operation: operation as OpenAPIV3.OperationObject,
        }));
    })
    .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function concreteUrl(path: string) {
  return path.replace(/\{provider\}/g, 'google').replace(/\{[^}]+\}/g, 'test-id');
}

function responseObject(response: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject | undefined) {
  if (!response || '$ref' in response) return undefined;
  return response;
}

function jsonMedia(response: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject | undefined) {
  return responseObject(response)?.content?.['application/json'];
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

    expect(new Set(normalizedPaths(doc))).toEqual(new Set(expectedOperations.map((route) => route.path)));

    const actualOperations = operationInventory(doc);
    expect(actualOperations.map(({ method, path }) => ({ method, path }))).toEqual(
      expectedOperations
        .map(({ method, path }) => ({ method, path }))
        .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`)),
    );

    for (const expected of expectedOperations) {
      const operation = pathItem(doc, expected.path)?.[expected.method] as OpenAPIV3.OperationObject | undefined;
      expect(operation, `${expected.method.toUpperCase()} ${expected.path}`).toBeDefined();
      expect(operation?.operationId).toBe(expected.operationId);
      expect(operation?.summary).toBeTruthy();
      expect(operation?.tags?.length).toBeGreaterThan(0);
      expect(operation?.['x-route-kind']).toBe(expected.routeKind);
      expect(operation?.['x-auth']).toBe(expected.auth);
      expect(operation?.['x-method-policy'], `${expected.operationId} method policy`).toMatchObject({
        resource: expect.any(String),
        completeness: expect.any(String),
        allowedMethods: expect.any(Array),
        notes: expect.any(String),
      });

      if (expected.auth === 'anonymous') {
        expect(operation?.security).toBeUndefined();
        expect(operation?.['x-required-roles']).toBeUndefined();
      } else {
        expect(operation?.security).toEqual([{ bearerAuth: [] }]);
      }

      if (expected.requiredRoles) {
        expect(operation?.['x-required-roles']).toEqual(expected.requiredRoles);
      }
    }

    const login = doc.paths['/api/auth/login']?.post;
    expect(login?.tags).toEqual(['Auth']);
    expect(login?.security).toBeUndefined();
    expect(login?.['x-route-kind']).toBe('auth');

    const listWorkflows = pathItem(doc, '/api/workflows')?.get;
    expect(listWorkflows?.tags).toEqual(['Workflows']);
    expect(listWorkflows?.security).toEqual([{ bearerAuth: [] }]);
    expect(listWorkflows?.['x-route-kind']).toBe('resource-crud');
    expect(listWorkflows?.['x-method-policy']).toMatchObject({
      resource: 'Workflow',
      completeness: 'controlled-crud-no-delete',
      destructiveDeletes: 'not-exposed',
    });
    expect(JSON.stringify(listWorkflows?.['x-method-policy'])).toContain('active=false');

    const advanceWorkOrder = pathItem(doc, '/api/work-orders/{id}/advance')?.post;
    expect(advanceWorkOrder?.tags).toEqual(['Work Orders']);
    expect(advanceWorkOrder?.security).toEqual([{ bearerAuth: [] }]);
    expect(advanceWorkOrder?.['x-route-kind']).toBe('lifecycle-action');
    expect(advanceWorkOrder?.['x-method-policy']).toMatchObject({
      resource: 'Work order phase execution',
      completeness: 'lifecycle-action',
      destructiveDeletes: 'not-exposed',
    });
    expect(JSON.stringify(advanceWorkOrder?.['x-method-policy'])).toContain('guarded by lifecycle checks');

    const workOrderAudit = pathItem(doc, '/api/work-orders/{id}/audit-events')?.get;
    expect(workOrderAudit?.tags).toEqual(['Work Orders']);
    expect(workOrderAudit?.operationId).toBe('listWorkOrderAuditEvents');
    expect(workOrderAudit?.description).toContain('audit trail');
    expect(workOrderAudit?.['x-method-policy']).toMatchObject({
      resource: 'Work order audit trail',
      completeness: 'read-only-audit',
      destructiveDeletes: 'not-exposed',
    });

    const workOrderTrace = pathItem(doc, '/api/work-orders/{id}/inventory-trace')?.get;
    expect(workOrderTrace?.tags).toEqual(['Work Orders', 'Inventory']);
    expect(workOrderTrace?.operationId).toBe('getWorkOrderInventoryTrace');
    expect(workOrderTrace?.description).toContain('inventory lots');
    expect(workOrderTrace?.['x-method-policy']).toMatchObject({
      resource: 'Inventory trace',
      completeness: 'read-only-trace',
      destructiveDeletes: 'not-exposed',
    });

    const listCollectionUnits = pathItem(doc, '/api/procurement/collection-units')?.get;
    expect(listCollectionUnits?.tags).toEqual(['Procurement']);
    expect(listCollectionUnits?.security).toEqual([{ bearerAuth: [] }]);
    expect(listCollectionUnits?.['x-route-kind']).toBe('read-model');
    expect(listCollectionUnits?.description).toContain('status=received');
    expect(listCollectionUnits?.['x-method-policy']).toMatchObject({
      resource: 'Procurement read model',
      completeness: 'read-model-operational-mutations-deferred',
      destructiveDeletes: 'not-exposed',
    });
    expect(JSON.stringify(listCollectionUnits?.['x-method-policy'])).toContain('mutation workflows are not implemented yet');

    const procurementReports = pathItem(doc, '/api/procurement/import-reports')?.get;
    expect(procurementReports?.tags).toEqual(['Procurement']);
    expect(procurementReports?.['x-route-kind']).toBe('import-admin');
    expect(procurementReports?.['x-method-policy']).toMatchObject({
      resource: 'Import report',
      completeness: 'read-only-admin-audit',
    });

    const collectionUnitTrace = pathItem(doc, '/api/procurement/collection-units/{id}/inventory-trace')?.get;
    expect(collectionUnitTrace?.tags).toEqual(['Procurement', 'Inventory']);
    expect(collectionUnitTrace?.operationId).toBe('getCollectionUnitInventoryTrace');

    const hetTrace = pathItem(doc, '/api/hets/{id}/inventory-trace')?.get;
    expect(hetTrace?.tags).toEqual(['HETs', 'Inventory']);
    expect(hetTrace?.operationId).toBe('getHetInventoryTrace');

    const listInventoryLots = pathItem(doc, '/api/inventory/lots')?.get;
    expect(listInventoryLots?.tags).toEqual(['Inventory']);
    expect(listInventoryLots?.security).toEqual([{ bearerAuth: [] }]);
    expect(listInventoryLots?.['x-route-kind']).toBe('read-model');
    expect(listInventoryLots?.description).toContain('inventoryType=HET');
    expect(listInventoryLots?.['x-method-policy']).toMatchObject({
      resource: 'Inventory read model',
      completeness: 'read-model-operational-mutations-deferred',
      destructiveDeletes: 'not-exposed',
    });
    expect(JSON.stringify(listInventoryLots?.['x-method-policy'])).toContain('controlled stock actions');

    const getInventoryLot = pathItem(doc, '/api/inventory/lots/{id}')?.get;
    expect(getInventoryLot?.operationId).toBe('getInventoryLot');
    expect(getInventoryLot?.description).toContain('lot-1001');
    expect(getInventoryLot?.['x-route-kind']).toBe('read-model');
    expect(getInventoryLot?.['x-method-policy']).toMatchObject({
      resource: 'Inventory read model',
      completeness: 'read-model-operational-mutations-deferred',
    });

    const inventoryGenealogy = pathItem(doc, '/api/inventory/genealogy/{lotId}')?.get;
    expect(inventoryGenealogy?.operationId).toBe('getInventoryGenealogy');
    expect(inventoryGenealogy?.['x-route-kind']).toBe('read-model');
    expect(inventoryGenealogy?.['x-method-policy']).toMatchObject({
      resource: 'Inventory trace',
      completeness: 'read-only-trace',
    });
  });

  it('adds useful examples and standard JSON error examples to the generated contract', async () => {
    stubRequiredEnv();
    const { buildServer } = await import('../server.js');
    const app = await buildServer();

    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const doc = JSON.parse(response.body) as OpenAPIV3.Document;
    expect(doc.info.description).toContain('{ "error": "message" }');
    expect(doc.info.description).toContain('take');

    for (const { method, path, operation } of operationInventory(doc)) {
      const successStatus = Object.keys(operation.responses).find((status) => /^[23]/.test(status));
      expect(successStatus, `${method.toUpperCase()} ${path} has a 2xx/3xx response`).toBeDefined();
      const successResponse = responseObject(operation.responses[successStatus!]);
      const successExample = jsonMedia(successResponse)?.example ?? successResponse?.headers?.Location;
      expect(successExample, `${method.toUpperCase()} ${path} success example`).toBeDefined();

      if (operation.requestBody && !('$ref' in operation.requestBody)) {
        const requestExample = operation.requestBody.content?.['application/json']?.example;
        expect(requestExample, `${method.toUpperCase()} ${path} request example`).toBeDefined();
      }

      for (const [status, responseObject] of Object.entries(operation.responses)) {
        if (!/^[45]/.test(status)) continue;
        const examples = jsonMedia(responseObject)?.examples;
        expect(examples, `${method.toUpperCase()} ${path} ${status} error example`).toBeDefined();
        expect(JSON.stringify(examples)).toContain('"error"');
      }
    }

    const createWorkOrder = pathItem(doc, '/api/work-orders')?.post;
    expect(createWorkOrder?.requestBody && !('$ref' in createWorkOrder.requestBody)
      ? createWorkOrder.requestBody.content?.['application/json']?.example
      : undefined).toEqual({ workflowId: 'wf-amgraft', hetId: 'het-1001' });

    const listInventoryLots = pathItem(doc, '/api/inventory/lots')?.get;
    expect(jsonMedia(listInventoryLots?.responses['200'])?.example).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'lot-1001', inventoryType: 'HET' })]),
    );
    expect(jsonMedia(listInventoryLots?.responses['401'])?.examples).toBeDefined();

    const getInventoryLot = pathItem(doc, '/api/inventory/lots/{id}')?.get;
    expect(jsonMedia(getInventoryLot?.responses['200'])?.example).toEqual(
      expect.objectContaining({ id: 'lot-1001', inventoryType: 'HET' }),
    );
    expect(jsonMedia(getInventoryLot?.responses['404'])?.examples).toBeDefined();
  });

  it('documents method policy decisions for every generated operation', async () => {
    stubRequiredEnv();
    const { buildServer } = await import('../server.js');
    const app = await buildServer();

    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const doc = JSON.parse(response.body) as OpenAPIV3.Document;
    expect(doc.info.description).toContain('x-method-policy');
    expect(doc.info.description).toContain('avoids generic destructive deletes');

    for (const { method, path, operation } of operationInventory(doc)) {
      const policy = operation['x-method-policy'] as Record<string, unknown> | undefined;
      expect(policy, `${method.toUpperCase()} ${path} x-method-policy`).toBeDefined();
      expect(policy?.resource, `${method.toUpperCase()} ${path} resource`).toEqual(expect.any(String));
      expect(policy?.completeness, `${method.toUpperCase()} ${path} completeness`).toEqual(expect.any(String));
      expect(policy?.allowedMethods, `${method.toUpperCase()} ${path} allowedMethods`).toEqual(expect.any(Array));
      expect(policy?.notes, `${method.toUpperCase()} ${path} notes`).toEqual(expect.any(String));

      if (operation['x-route-kind'] !== 'auth' && operation['x-route-kind'] !== 'health') {
        expect(JSON.stringify(policy), `${method.toUpperCase()} ${path} omitted/destructive policy`).toContain('DELETE');
      }
    }

    const productionOperations = operationInventory(doc).filter(({ path }) =>
      path.startsWith('/api/work-orders') ||
      path.startsWith('/api/hets') ||
      path.startsWith('/api/sterilisation') ||
      path.startsWith('/api/manufacturing')
    );
    for (const { method, path, operation } of productionOperations) {
      const policy = operation['x-method-policy'] as Record<string, unknown>;
      expect(policy.destructiveDeletes, `${method.toUpperCase()} ${path}`).toBe('not-exposed');
    }
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

  it('enforces anonymous and role-gated access according to the generated contract metadata', async () => {
    stubRequiredEnv();
    const { buildServer } = await import('../server.js');
    const app = await buildServer();

    await app.ready();
    const openApiResponse = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    const doc = JSON.parse(openApiResponse.body) as OpenAPIV3.Document;
    const operations = operationInventory(doc);

    for (const { method, path, operation } of operations) {
      if (operation['x-auth'] === 'anonymous') continue;

      const response = await app.inject({ method: method.toUpperCase(), url: concreteUrl(path) });
      expect(response.statusCode, `${method.toUpperCase()} ${path}`).toBe(401);
    }

    const userToken = app.jwt.sign({
      id: 'staff-user',
      role: 'user',
      email: 'user@example.test',
      tenantId: 'tenant-a',
    });

    for (const { method, path, operation } of operations) {
      if (operation['x-auth'] !== 'role') continue;

      const response = await app.inject({
        method: method.toUpperCase(),
        url: concreteUrl(path),
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(response.statusCode, `${method.toUpperCase()} ${path}`).toBe(403);
    }

    await app.close();
  });
});

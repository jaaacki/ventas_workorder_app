import { describe, expect, it, afterEach, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';

type RouteKind = 'auth' | 'health' | 'import-admin' | 'lifecycle-action' | 'read-model' | 'resource-crud';
type AuthKind = 'anonymous' | 'authenticated' | 'permission' | 'role';

type ExpectedOperation = {
  method: OpenAPIV3.HttpMethods;
  path: string;
  operationId: string;
  routeKind: RouteKind;
  auth: AuthKind;
  requiredRoles?: string[];
  requiredPermissions?: string[];
};

type CrudExpectedResource = {
  basePath: string;
  suffix: string;
  permissionResource: string;
  skipList?: boolean;
  skipDetail?: boolean;
  skipCreate?: boolean;
  skipUpdate?: boolean;
};

function crudExpectedOperations(resources: CrudExpectedResource[]): ExpectedOperation[] {
  return resources.flatMap((resource) => {
    const operations: ExpectedOperation[] = [];
    const permission = (action: string) => [`${resource.permissionResource}.${action}`];
    if (!resource.skipList) {
      operations.push({
        method: 'get',
        path: resource.basePath,
        operationId: `list${resource.suffix}`,
        routeKind: 'resource-crud',
        auth: 'permission',
        requiredPermissions: permission('read'),
      });
    }
    if (!resource.skipDetail) {
      operations.push({
        method: 'get',
        path: `${resource.basePath}/{id}`,
        operationId: `get${resource.suffix}`,
        routeKind: 'resource-crud',
        auth: 'permission',
        requiredPermissions: permission('read'),
      });
    }
    if (!resource.skipCreate) {
      operations.push({
        method: 'post',
        path: resource.basePath,
        operationId: `create${resource.suffix}`,
        routeKind: 'resource-crud',
        auth: 'permission',
        requiredPermissions: permission('create'),
      });
    }
    if (!resource.skipUpdate) {
      operations.push({
        method: 'patch',
        path: `${resource.basePath}/{id}`,
        operationId: `update${resource.suffix}`,
        routeKind: 'resource-crud',
        auth: 'permission',
        requiredPermissions: permission('update'),
      });
    }
    operations.push(
      {
        method: 'delete',
        path: `${resource.basePath}/{id}`,
        operationId: `archive${resource.suffix}`,
        routeKind: 'resource-crud',
        auth: 'permission',
        requiredPermissions: permission('delete'),
      },
      {
        method: 'patch',
        path: `${resource.basePath}/{id}/restore`,
        operationId: `restore${resource.suffix}`,
        routeKind: 'resource-crud',
        auth: 'permission',
        requiredPermissions: permission('restore'),
      },
      {
        method: 'get',
        path: `${resource.basePath}/{id}/audit`,
        operationId: `list${resource.suffix}Audit`,
        routeKind: 'resource-crud',
        auth: 'permission',
        requiredPermissions: permission('readAudit'),
      },
    );
    return operations;
  });
}

const procurementCrudExpectedResources: CrudExpectedResource[] = [
  { basePath: '/api/procurement/supply-entities', suffix: 'SupplyEntities', permissionResource: 'procurement.supplyEntity', skipList: true },
  { basePath: '/api/procurement/collection-points', suffix: 'CollectionPoints', permissionResource: 'procurement.collectionPoint', skipList: true },
  { basePath: '/api/procurement/collection-units', suffix: 'CollectionUnits', permissionResource: 'procurement.collectionUnit', skipList: true, skipDetail: true },
  { basePath: '/api/procurement/issuance-orders', suffix: 'IssuanceOrders', permissionResource: 'procurement.issuanceOrder', skipList: true },
  { basePath: '/api/procurement/issuance-order-lines', suffix: 'IssuanceOrderLines', permissionResource: 'procurement.issuanceOrderLine' },
  { basePath: '/api/procurement/collection-unit-fulfilments', suffix: 'CollectionUnitFulfilments', permissionResource: 'procurement.collectionUnitFulfilment' },
  { basePath: '/api/procurement/collection-orders', suffix: 'CollectionOrders', permissionResource: 'procurement.collectionOrder', skipList: true },
  { basePath: '/api/procurement/collection-receipts', suffix: 'CollectionReceipts', permissionResource: 'procurement.collectionReceipt', skipList: true },
  { basePath: '/api/procurement/collection-receipt-lines', suffix: 'CollectionReceiptLines', permissionResource: 'procurement.collectionReceiptLine' },
  { basePath: '/api/procurement/import-reports', suffix: 'ProcurementImportReports', permissionResource: 'procurement.importReport', skipList: true, skipCreate: true, skipUpdate: true },
];

const inventoryCrudExpectedResources: CrudExpectedResource[] = [
  { basePath: '/api/inventory/references', suffix: 'References', permissionResource: 'inventory.reference' },
  { basePath: '/api/inventory/locations', suffix: 'Locations', permissionResource: 'inventory.location', skipList: true },
  { basePath: '/api/inventory/skus', suffix: 'Skus', permissionResource: 'inventory.sku', skipList: true },
  { basePath: '/api/inventory/lots', suffix: 'Lots', permissionResource: 'inventory.lot', skipList: true, skipDetail: true },
  { basePath: '/api/inventory/transactions', suffix: 'Transactions', permissionResource: 'inventory.transaction', skipList: true },
  { basePath: '/api/inventory/balances', suffix: 'Balances', permissionResource: 'inventory.balance' },
  { basePath: '/api/inventory/genealogy', suffix: 'Genealogy', permissionResource: 'inventory.genealogy' },
  { basePath: '/api/inventory/work-order-consumptions', suffix: 'WorkOrderConsumptions', permissionResource: 'inventory.workOrderConsumption' },
  { basePath: '/api/inventory/import-reports', suffix: 'InventoryImportReports', permissionResource: 'inventory.importReport', skipList: true, skipCreate: true, skipUpdate: true },
];

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
  { method: 'get', path: '/api/phases', operationId: 'listPhases', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'post', path: '/api/phases', operationId: 'createPhase', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/phases/{id}/equipment', operationId: 'listPhaseEquipmentBindings', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'post', path: '/api/phases/{id}/equipment', operationId: 'addPhaseEquipment', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'delete', path: '/api/phases/{id}/equipment/{phaseEquipId}', operationId: 'deletePhaseEquipmentBinding', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/phases/{id}/procedures', operationId: 'listPhaseProcedures', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'post', path: '/api/phases/{id}/procedures', operationId: 'addPhaseProcedure', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'delete', path: '/api/phases/{id}/procedures/{procedureId}', operationId: 'deletePhaseProcedure', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/phases/{id}', operationId: 'getPhase', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'patch', path: '/api/phases/{id}', operationId: 'updatePhase', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'delete', path: '/api/phases/{id}', operationId: 'deletePhase', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/master-data/procedures', operationId: 'listProcedures', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'post', path: '/api/master-data/procedures', operationId: 'createProcedure', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/master-data/procedures/{id}', operationId: 'getProcedure', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'patch', path: '/api/master-data/procedures/{id}', operationId: 'updateProcedure', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'delete', path: '/api/master-data/procedures/{id}', operationId: 'deleteProcedure', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/master-data/boms', operationId: 'listBoms', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'post', path: '/api/master-data/boms', operationId: 'createBom', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/master-data/boms/{id}', operationId: 'getBom', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'patch', path: '/api/master-data/boms/{id}', operationId: 'updateBom', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'delete', path: '/api/master-data/boms/{id}', operationId: 'deleteBom', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/master-data/bom-lines', operationId: 'listBomLines', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'post', path: '/api/master-data/bom-lines', operationId: 'createBomLine', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/master-data/bom-lines/{id}', operationId: 'getBomLine', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'patch', path: '/api/master-data/bom-lines/{id}', operationId: 'updateBomLine', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'delete', path: '/api/master-data/bom-lines/{id}', operationId: 'deleteBomLine', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/master-data/phase-equipment', operationId: 'listPhaseEquipment', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'post', path: '/api/master-data/phase-equipment', operationId: 'createPhaseEquipment', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/master-data/phase-equipment/{id}', operationId: 'getPhaseEquipment', routeKind: 'resource-crud', auth: 'authenticated' },
  { method: 'patch', path: '/api/master-data/phase-equipment/{id}', operationId: 'updatePhaseEquipment', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'delete', path: '/api/master-data/phase-equipment/{id}', operationId: 'deletePhaseEquipment', routeKind: 'resource-crud', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/work-orders', operationId: 'listWorkOrders', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders', operationId: 'createWorkOrder', routeKind: 'lifecycle-action', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'get', path: '/api/work-orders/qa-queue', operationId: 'listQaWorkOrderQueue', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/work-orders/{id}', operationId: 'getWorkOrder', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/work-orders/{id}/audit-events', operationId: 'listWorkOrderAuditEvents', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'get', path: '/api/work-orders/{id}/inventory-trace', operationId: 'getWorkOrderInventoryTrace', routeKind: 'read-model', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders/{id}/equipment', operationId: 'recordWorkOrderEquipment', routeKind: 'lifecycle-action', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders/{id}/output-quantity', operationId: 'recordWorkOrderOutputQuantity', routeKind: 'lifecycle-action', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders/{id}/photo-evidence', operationId: 'recordWorkOrderPhotoEvidence', routeKind: 'lifecycle-action', auth: 'authenticated' },
  { method: 'post', path: '/api/work-orders/{id}/release', operationId: 'recordWorkOrderRelease', routeKind: 'lifecycle-action', auth: 'role', requiredRoles: ['admin', 'owner'] },
  { method: 'post', path: '/api/work-orders/{id}/serials', operationId: 'recordWorkOrderSerial', routeKind: 'lifecycle-action', auth: 'authenticated' },
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
  { method: 'get', path: '/api/procurement/overview', operationId: 'getProcurementOverview', routeKind: 'read-model', auth: 'permission', requiredPermissions: ['procurement.supplyEntity.read'] },
  { method: 'get', path: '/api/procurement/supply-entities', operationId: 'listSupplyEntities', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['procurement.supplyEntity.read'] },
  { method: 'get', path: '/api/procurement/collection-points', operationId: 'listCollectionPoints', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['procurement.collectionPoint.read'] },
  { method: 'get', path: '/api/procurement/collection-units', operationId: 'listCollectionUnits', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['procurement.collectionUnit.read'] },
  { method: 'get', path: '/api/procurement/collection-units/{id}', operationId: 'getCollectionUnit', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['procurement.collectionUnit.read'] },
  { method: 'get', path: '/api/procurement/collection-units/{id}/inventory-trace', operationId: 'getCollectionUnitInventoryTrace', routeKind: 'read-model', auth: 'permission', requiredPermissions: ['procurement.issuanceOrder.read'] },
  { method: 'get', path: '/api/procurement/issuance-orders', operationId: 'listIssuanceOrders', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['procurement.issuanceOrder.read'] },
  { method: 'get', path: '/api/procurement/collection-orders', operationId: 'listCollectionOrders', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['procurement.collectionOrder.read'] },
  { method: 'get', path: '/api/procurement/collection-receipts', operationId: 'listCollectionReceipts', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['procurement.collectionReceipt.read'] },
  { method: 'get', path: '/api/procurement/import-reports', operationId: 'listProcurementImportReports', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['procurement.importReport.read'] },
  { method: 'get', path: '/api/inventory/overview', operationId: 'getInventoryOverview', routeKind: 'read-model', auth: 'permission', requiredPermissions: ['inventory.sku.read'] },
  { method: 'get', path: '/api/inventory/skus', operationId: 'listInventorySkus', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['inventory.sku.read'] },
  { method: 'get', path: '/api/inventory/lots', operationId: 'listInventoryLots', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['inventory.lot.read'] },
  { method: 'get', path: '/api/inventory/lots/{id}', operationId: 'getInventoryLot', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['inventory.lot.read'] },
  { method: 'get', path: '/api/inventory/transactions', operationId: 'listInventoryTransactions', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['inventory.transaction.read'] },
  { method: 'get', path: '/api/inventory/locations', operationId: 'listInventoryLocations', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['inventory.location.read'] },
  { method: 'get', path: '/api/inventory/lots/{lotId}/genealogy', operationId: 'getInventoryLotGenealogy', routeKind: 'read-model', auth: 'permission', requiredPermissions: ['inventory.genealogy.read'] },
  { method: 'get', path: '/api/inventory/import-reports', operationId: 'listInventoryImportReports', routeKind: 'resource-crud', auth: 'permission', requiredPermissions: ['inventory.importReport.read'] },
  ...crudExpectedOperations(procurementCrudExpectedResources),
  ...crudExpectedOperations(inventoryCrudExpectedResources),
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

      if (expected.requiredPermissions) {
        expect(operation?.['x-required-permissions']).toEqual(expected.requiredPermissions);
      }

      if (expected.auth === 'permission') {
        expect(expected.requiredPermissions, `${expected.operationId} expected requiredPermissions`).toBeDefined();
        expect(operation?.['x-required-permissions'], `${expected.operationId} x-required-permissions`).toEqual(expected.requiredPermissions);
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

    const qaQueue = pathItem(doc, '/api/work-orders/qa-queue')?.get;
    expect(qaQueue?.tags).toEqual(['Work Orders', 'Sterilisation']);
    expect(qaQueue?.operationId).toBe('listQaWorkOrderQueue');
    expect(qaQueue?.description).toContain('final release readiness');
    expect(qaQueue?.['x-method-policy']).toMatchObject({
      resource: 'Work order QA queue',
      completeness: 'read-model',
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

    const releaseAction = pathItem(doc, '/api/work-orders/{id}/release')?.post;
    expect(releaseAction?.operationId).toBe('recordWorkOrderRelease');
    expect(releaseAction?.['x-route-kind']).toBe('lifecycle-action');
    expect(releaseAction?.['x-method-policy']).toMatchObject({
      resource: 'Work order release disposition',
      completeness: 'controlled-release-action',
      destructiveDeletes: 'not-exposed',
    });

    const listCollectionUnits = pathItem(doc, '/api/procurement/collection-units')?.get;
    expect(listCollectionUnits?.tags).toEqual(['Procurement']);
    expect(listCollectionUnits?.security).toEqual([{ bearerAuth: [] }]);
    expect(listCollectionUnits?.['x-route-kind']).toBe('resource-crud');
    expect(listCollectionUnits?.description).toContain('status=received');
    expect(listCollectionUnits?.['x-auth']).toBe('permission');
    expect(listCollectionUnits?.['x-required-permissions']).toEqual(['procurement.collectionUnit.read']);
    expect(listCollectionUnits?.['x-method-policy']).toMatchObject({
      resource: 'Procurement',
      completeness: 'guarded-crud-soft-delete',
      destructiveDeletes: 'not-exposed',
    });
    expect(JSON.stringify(listCollectionUnits?.['x-method-policy'])).toContain('permission-gated CRUD');

    const procurementReports = pathItem(doc, '/api/procurement/import-reports')?.get;
    expect(procurementReports?.tags).toEqual(['Procurement']);
    expect(procurementReports?.['x-route-kind']).toBe('resource-crud');
    expect(procurementReports?.['x-auth']).toBe('permission');
    expect(procurementReports?.['x-required-permissions']).toEqual(['procurement.importReport.read']);
    expect(procurementReports?.['x-method-policy']).toMatchObject({
      resource: 'Import report',
      completeness: 'archive-restore-audit-only',
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
    expect(listInventoryLots?.['x-route-kind']).toBe('resource-crud');
    expect(listInventoryLots?.description).toContain('inventoryType=HET');
    expect(listInventoryLots?.['x-auth']).toBe('permission');
    expect(listInventoryLots?.['x-required-permissions']).toEqual(['inventory.lot.read']);
    expect(listInventoryLots?.['x-method-policy']).toMatchObject({
      resource: 'Inventory',
      completeness: 'guarded-crud-soft-delete',
      destructiveDeletes: 'not-exposed',
    });
    expect(JSON.stringify(listInventoryLots?.['x-method-policy'])).toContain('permission-gated CRUD');

    const getInventoryLot = pathItem(doc, '/api/inventory/lots/{id}')?.get;
    expect(getInventoryLot?.operationId).toBe('getInventoryLot');
    expect(getInventoryLot?.description).toContain('lot-1001');
    expect(getInventoryLot?.['x-route-kind']).toBe('resource-crud');
    expect(getInventoryLot?.['x-auth']).toBe('permission');
    expect(getInventoryLot?.['x-required-permissions']).toEqual(['inventory.lot.read']);
    expect(getInventoryLot?.['x-method-policy']).toMatchObject({
      resource: 'Inventory',
      completeness: 'guarded-crud-soft-delete',
    });

    const inventoryGenealogy = pathItem(doc, '/api/inventory/lots/{lotId}/genealogy')?.get;
    expect(inventoryGenealogy?.operationId).toBe('getInventoryLotGenealogy');
    expect(inventoryGenealogy?.['x-route-kind']).toBe('read-model');
    expect(inventoryGenealogy?.['x-auth']).toBe('permission');
    expect(inventoryGenealogy?.['x-required-permissions']).toEqual(['inventory.genealogy.read']);
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

    const generatedCrudExampleExpectations: Array<[string, string, Record<string, unknown>]> = [
      ['post', '/api/procurement/issuance-order-lines', { issuanceOrderId: 'issue-1001', collectionUnitId: 'cu-1001' }],
      ['post', '/api/procurement/collection-receipt-lines', { collectionReceiptId: 'receipt-1001', resultingHetId: 'het-1001' }],
      ['post', '/api/inventory/balances', { inventorySkuId: 'sku-graft', inventoryLocationId: 'loc-clean-room' }],
      ['post', '/api/inventory/genealogy', { parentInventoryLotId: 'lot-parent', childInventoryLotId: 'lot-child', relationshipType: 'consumed_into' }],
      ['post', '/api/inventory/work-order-consumptions', { workOrderId: 'WO-1001', inventorySkuId: 'sku-graft' }],
      ['patch', '/api/inventory/import-reports/{id}/restore', { source: 'inventory-legacy', report: { imported: 24, warnings: 2 } }],
    ];

    for (const [method, path, expectedExample] of generatedCrudExampleExpectations) {
      const operation = pathItem(doc, path)?.[method as OpenAPIV3.HttpMethods] as OpenAPIV3.OperationObject | undefined;
      const successStatus = Object.keys(operation?.responses ?? {}).find((status) => /^[23]/.test(status));
      const example = successStatus ? jsonMedia(operation?.responses[successStatus])?.example : undefined;
      expect(example, `${method.toUpperCase()} ${path} generated success example`).toEqual(expect.objectContaining(expectedExample));
    }
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

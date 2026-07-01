import swagger from '@fastify/swagger';
import type { FastifyInstance, FastifySchema } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import type { OpenAPIV3 } from 'openapi-types';

type OpenApiFastifyInstance = FastifyInstance & {
  swagger: () => unknown;
};

const hiddenSchema = { hide: true } as unknown as FastifySchema;

const userExample = {
  id: 'staff-operator-1',
  email: 'operator@example.test',
  name: 'Line Operator',
  active: true,
  role: {
    id: 'role-user',
    key: 'user',
    name: 'User',
    description: 'Production operator',
    builtIn: true,
    sortOrder: 30,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const workflowExample = {
  id: 'wf-amgraft',
  name: 'AmGraft Standard',
  code: 'AMGRAFT_STD',
  description: 'Standard AmGraft processing workflow',
  active: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  phases: [
    {
      workflowId: 'wf-amgraft',
      phaseId: 'phase-intake',
      sortOrder: 10,
      phase: { id: 'phase-intake', phaseName: 'Intake', phaseShort: 'INT', phaseOrder: 10 },
    },
  ],
};

const workOrderExample = {
  id: 'WO-1001',
  woNumber: 'WO-1001',
  workflowId: 'wf-amgraft',
  hetId: 'het-1001',
  phaseId: 'phase-intake',
  phaseOrder: 10,
  prodStart: '2026-07-01T09:00:00.000Z',
  prodEnd: null,
  workflow: { id: 'wf-amgraft', name: 'AmGraft Standard', code: 'AMGRAFT_STD' },
  phase: { id: 'phase-intake', phaseName: 'Intake', phaseShort: 'INT', phaseOrder: 10 },
};

const inventoryLotExample = {
  id: 'lot-1001',
  inventorySkuId: 'sku-graft',
  lotNumber: 'LOT-1001',
  inventoryType: 'HET',
  status: 'available',
  uom: 'ea',
  currentLocationId: 'loc-clean-room',
  collectionUnitId: 'cu-1001',
  hetId: 'het-1001',
  workOrderId: 'WO-1001',
  sourceSystem: 'legacy',
  legacyItemSerialId: 'legacy-serial-1001',
  legacyHetId: 'HET-1001',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const inventoryTraceExample = {
  subject: { type: 'workOrder', id: 'WO-1001', label: 'WO-1001' },
  lots: [inventoryLotExample],
  transactions: [
    {
      id: 'txn-1001',
      inventorySkuId: 'sku-graft',
      inventoryLotId: 'lot-1001',
      transactionType: 'CONSUME',
      direction: 'OUT',
      reason: 'Work order consumption',
      uom: 'ea',
      fromLocationId: 'loc-clean-room',
      toLocationId: null,
      workOrderId: 'WO-1001',
      occurredAt: '2026-07-01T10:00:00.000Z',
      actor: 'operator@example.test',
      signaturePath: null,
      remarks: null,
      legacyRefNumber: 'WO-1001',
      legacyRefNumberOut: null,
      sourceSystem: 'legacy',
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-01T10:00:00.000Z',
    },
  ],
  consumptions: [{ id: 'consumption-1001', workOrderId: 'WO-1001', inventoryLotId: 'lot-1001', quantity: '1', uom: 'ea' }],
  genealogy: [],
  hets: [{ id: 'het-1001', hetNumber: 'HET-1001', collectionUnitId: 'cu-1001', usedById: 'WO-1001', finishedById: null }],
  workOrders: [{ id: 'WO-1001', woNumber: 'WO-1001', hetId: 'het-1001', phaseOrder: 10 }],
};

const successExamples: Record<string, unknown> = {
  getHealth: { status: 'ok' },
  login: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example', user: userExample },
  registerStaff: userExample,
  getCurrentUser: userExample,
  logout: { success: true },
  listRoles: [userExample.role],
  updateRole: userExample.role,
  listStaff: [userExample],
  updateStaffRole: userExample,
  updateStaffActive: { ...userExample, active: false },
  authorizeOAuthProvider: 'https://accounts.google.com/o/oauth2/v2/auth?...',
  handleOAuthCallback: 'http://localhost:3000/auth/callback?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
  listWorkflows: [{
    id: workflowExample.id,
    name: workflowExample.name,
    code: workflowExample.code,
    description: workflowExample.description,
    active: workflowExample.active,
    createdAt: workflowExample.createdAt,
    updatedAt: workflowExample.updatedAt,
    _count: { phases: 8, workOrders: 12 },
  }],
  createWorkflow: workflowExample,
  getWorkflow: workflowExample,
  updateWorkflow: { ...workflowExample, description: 'Updated workflow description' },
  listWorkOrders: [workOrderExample],
  createWorkOrder: workOrderExample,
  getWorkOrder: workOrderExample,
  getWorkOrderInventoryTrace: inventoryTraceExample,
  startWorkOrderPhase: { ...workOrderExample, prodStart: '2026-07-01T09:00:00.000Z' },
  finishWorkOrderPhase: { ...workOrderExample, prodEnd: '2026-07-01T11:00:00.000Z' },
  advanceWorkOrder: { ...workOrderExample, phaseId: 'phase-sterilisation', phaseOrder: 20 },
  createSterilisation: {
    id: 'sterilise-1001',
    workOrderId: 'WO-1001',
    manuId: null,
    direction: 'OUT',
    result: true,
    signById: 'staff-operator-1',
    createdById: 'staff-admin-1',
    updatedById: 'staff-admin-1',
    createdAt: '2026-07-01T10:30:00.000Z',
    updatedAt: '2026-07-01T10:30:00.000Z',
    batchHets: [{ hetId: 'het-1001', het: { id: 'het-1001', hetNumber: 'HET-1001' } }],
  },
  listSterilisations: [],
  setSterilisationResult: {
    id: 'sterilise-1001',
    workOrderId: 'WO-1001',
    manuId: null,
    direction: 'OUT',
    result: true,
    signById: 'staff-operator-1',
    createdById: 'staff-admin-1',
    updatedById: 'staff-admin-1',
    createdAt: '2026-07-01T10:30:00.000Z',
    updatedAt: '2026-07-01T10:35:00.000Z',
    batchHets: [],
  },
  generateBatchRecord: { id: 'manu-1001', manuNumber: 'MANU-1001', manuName: 'AmGraft batch WO-1001', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
  getBatchRecord: { id: 'manu-1001', manuNumber: 'MANU-1001', manuName: 'AmGraft batch WO-1001', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
  listHets: [{ id: 'het-1001', hetNumber: 'HET-1001', usedById: 'WO-1001', finishedById: null, deleted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', createdById: null, updatedById: null }],
  getHetInventoryTrace: { ...inventoryTraceExample, subject: { type: 'het', id: 'het-1001', label: 'HET-1001' } },
  useHet: { id: 'het-1001', usedById: 'WO-1001', finishedById: null, deleted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T09:00:00.000Z', createdById: null, updatedById: null },
  finishHet: { id: 'het-1001', usedById: 'WO-1001', finishedById: 'WO-1001', deleted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T11:00:00.000Z', createdById: null, updatedById: null },
  getProcurementOverview: { supplyEntities: 3, collectionPoints: 12, unitsTotal: 140, unitsOperational: 132, unitsPlaceholder: 8, issuanceOrders: 25, collectionOrders: 18, collectionReceipts: 16, linkedHets: 118 },
  listSupplyEntities: [{ id: 'supply-1', name: 'Clinic Group A', legalName: 'Clinic Group A Pte Ltd', externalCode: 'CGA', sourceSystem: 'legacy', legacyClinicId: 'clinic-1', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
  listCollectionPoints: [{ id: 'point-1', supplyEntityId: 'supply-1', hciCode: 'HCI-001', displayName: 'Clinic A', licenseName: 'Clinic A License', address: '1 Example Road', postalCode: '000001', telephone: '+65 0000 0000', personInCharge: 'Ops Lead', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
  listCollectionUnits: [{ id: 'cu-1001', supplyEntityId: 'supply-1', collectionPointId: 'point-1', legacyHetId: 'HET-1001', unitNumber: 'CU-1001', parcelTrackingNumber: 'TRACK-1001', status: 'received', legacyUsedByWorkOrderId: 'WO-1001', legacyNextHetId: null, sourceSystem: 'legacy', linkCompleteness: 'linked', semanticConfidence: 'high', hiddenFromOperations: false, deleted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
  getCollectionUnit: { id: 'cu-1001', supplyEntityId: 'supply-1', collectionPointId: 'point-1', legacyHetId: 'HET-1001', unitNumber: 'CU-1001', parcelTrackingNumber: 'TRACK-1001', status: 'received', legacyUsedByWorkOrderId: 'WO-1001', legacyNextHetId: null, sourceSystem: 'legacy', linkCompleteness: 'linked', semanticConfidence: 'high', hiddenFromOperations: false, deleted: false, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', issuanceLines: [], fulfilments: [], receiptLines: [], hets: [{ id: 'het-1001', hetNumber: 'HET-1001', clinicName: 'Clinic A', usedById: 'WO-1001', finishedById: null }] },
  getCollectionUnitInventoryTrace: { ...inventoryTraceExample, subject: { type: 'collectionUnit', id: 'cu-1001', label: 'CU-1001' } },
  listIssuanceOrders: [{ id: 'issue-1001', supplyEntityId: 'supply-1', collectionPointId: 'point-1', issuedAt: '2026-07-01T08:00:00.000Z', issuedBy: 'Ops Lead', semanticConfidence: 'high', level: 'routine', remarks: null, createdAt: '2026-07-01T08:00:00.000Z', updatedAt: '2026-07-01T08:00:00.000Z' }],
  listCollectionOrders: [{ id: 'collect-1001', supplyEntityId: 'supply-1', collectionPointId: 'point-1', requestedAt: '2026-07-01T08:30:00.000Z', scheduledFor: '2026-07-01T12:00:00.000Z', requestedBy: 'Ops Lead', status: 'requested', semanticConfidence: 'high', legacyConflatedOrderReceipt: false, remarks: null, createdAt: '2026-07-01T08:30:00.000Z', updatedAt: '2026-07-01T08:30:00.000Z' }],
  listCollectionReceipts: [{ id: 'receipt-1001', collectionOrderId: 'collect-1001', receivedAt: '2026-07-01T13:00:00.000Z', receivedBy: 'Receiving Operator', signaturePath: null, remarks: null, legacyConflatedOrderReceipt: false, acceptanceState: 'accepted', createdAt: '2026-07-01T13:00:00.000Z', updatedAt: '2026-07-01T13:00:00.000Z' }],
  listProcurementImportReports: [{ id: 'proc-import-1001', source: 'legacy-procurement-csv', dryRun: false, startedAt: '2026-07-01T00:00:00.000Z', finishedAt: '2026-07-01T00:02:00.000Z', report: { rows: 140, warnings: 2 } }],
  getInventoryOverview: { skus: 250, lots: 1200, transactions: 4500, locations: 24, balances: 640, importReports: 4, hetLots: 118, finishedGoodLots: 32 },
  listInventorySkus: [{ id: 'sku-graft', sku: 'GRAFT-001', description: 'AmGraft tissue graft', category: 'Graft', brand: 'Ventas', size: '10x10', colour: null, uom: 'ea', serialisedMode: 'lot', sourceSystem: 'legacy', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
  listInventoryLots: [inventoryLotExample],
  listInventoryTransactions: inventoryTraceExample.transactions,
  listInventoryLocations: [{ id: 'loc-clean-room', locationType: 'ROOM', name: 'Clean Room', parentLocationId: null, description: 'Production clean room', imagePath: null, sourceSystem: 'legacy', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
  getInventoryGenealogy: { id: 'lot-1001', lot: inventoryLotExample, parents: [], children: [] },
  listInventoryImportReports: [{ id: 'inv-import-1001', source: 'legacy-inventory-csv', dryRun: false, startedAt: '2026-07-01T00:00:00.000Z', finishedAt: '2026-07-01T00:03:00.000Z', report: { rows: 4500, warnings: 3 } }],
};

const requestExamples: Record<string, unknown> = {
  login: { email: 'operator@example.test', password: 'correct horse battery staple' },
  registerStaff: { email: 'new.operator@example.test', password: 'change-me-after-invite', name: 'New Operator', roleId: 'role-user' },
  updateRole: { name: 'Production Operator', description: 'Can execute assigned production tasks' },
  updateStaffRole: { roleId: 'role-admin' },
  updateStaffActive: { active: false },
  createWorkflow: { name: 'AmGraft Standard', code: 'AMGRAFT_STD', description: 'Standard AmGraft processing workflow', phases: [{ phaseId: 'phase-intake', sortOrder: 10 }] },
  updateWorkflow: { description: 'Updated workflow description', active: true, phases: [{ phaseId: 'phase-intake', sortOrder: 10 }] },
  createWorkOrder: { workflowId: 'wf-amgraft', hetId: 'het-1001' },
  startWorkOrderPhase: { signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' },
  finishWorkOrderPhase: { signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' },
  createSterilisation: { workOrderId: 'WO-1001', direction: 'OUT', result: true, signById: 'staff-operator-1', hetIds: ['het-1001'] },
  setSterilisationResult: { result: true },
  generateBatchRecord: { workOrderId: 'WO-1001' },
  useHet: { workOrderId: 'WO-1001' },
  finishHet: { workOrderId: 'WO-1001' },
};

const parameterExamples: Record<string, unknown> = {
  id: 'test-id',
  lotId: 'lot-1001',
  provider: 'google',
  active: 'true',
  supplyEntityId: 'supply-1',
  includeHidden: 'false',
  status: 'received',
  q: 'HET-1001',
  take: 50,
  inventoryType: 'HET',
  workOrderId: 'WO-1001',
};

const errorExamples: Record<string, { summary: string; value: { error: string } }> = {
  '400': { summary: 'Bad request', value: { error: 'Referenced record does not exist' } },
  '401': { summary: 'Unauthorized', value: { error: 'Unauthorized' } },
  '403': { summary: 'Forbidden', value: { error: 'Forbidden' } },
  '404': { summary: 'Not found', value: { error: 'Record not found' } },
  '409': { summary: 'Conflict', value: { error: 'Requested state transition is not allowed' } },
  '500': { summary: 'Server error', value: { error: 'Unexpected server error' } },
  '501': { summary: 'Not implemented', value: { error: 'Provider is not configured' } },
  '502': { summary: 'Upstream error', value: { error: 'Upstream provider request failed' } },
};

function jsonContent(response: OpenAPIV3.ResponseObject) {
  response.content ??= {};
  response.content['application/json'] ??= {};
  return response.content['application/json'];
}

function addResponseExamples(operation: OpenAPIV3.OperationObject) {
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (!response || '$ref' in response) continue;
    if (status === '302') {
      const locationExample = operation.operationId ? successExamples[operation.operationId] : undefined;
      response.headers ??= {};
      response.headers.Location ??= {
        description: 'Redirect target.',
        schema: { type: 'string', format: 'uri' },
        example: typeof locationExample === 'string' ? locationExample : 'http://localhost:3000/login',
      };
    } else if (status.startsWith('2')) {
      const content = jsonContent(response);
      const successExample = operation.operationId ? successExamples[operation.operationId] : undefined;
      if (successExample !== undefined && content.example === undefined) content.example = successExample;
    } else if (errorExamples[status]) {
      const content = jsonContent(response);
      if (!content.examples) content.examples = { [errorExamples[status].summary]: errorExamples[status] };
    }
  }
}

function addRequestExample(operation: OpenAPIV3.OperationObject) {
  if (!operation.operationId || !operation.requestBody || '$ref' in operation.requestBody) return;
  const example = requestExamples[operation.operationId];
  if (example === undefined) return;
  const content = operation.requestBody.content?.['application/json'];
  if (content && content.example === undefined) content.example = example;
}

function addParameterExamples(operation: OpenAPIV3.OperationObject) {
  for (const parameter of operation.parameters ?? []) {
    if ('$ref' in parameter || parameter.example !== undefined) continue;
    const example = parameterExamples[parameter.name];
    if (example !== undefined) parameter.example = example;
  }
}

export function enrichOpenApiDocument(document: OpenAPIV3.Document): OpenAPIV3.Document {
  for (const item of Object.values(document.paths)) {
    if (!item) continue;
    for (const method of ['delete', 'get', 'patch', 'post', 'put'] as const) {
      const operation = item[method];
      if (!operation) continue;
      addParameterExamples(operation);
      addRequestExample(operation);
      addResponseExamples(operation);
    }
  }

  document.info.description = `${document.info.description}\n\nError responses use a consistent JSON shape: \`{ "error": "message" }\`. List endpoints use explicit query parameters such as \`q\`, \`take\`, \`status\`, and domain filters where implemented; endpoints without those parameters are intentionally unpaginated read models today.`;
  return document;
}

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
    return reply.send(enrichOpenApiDocument((app as OpenApiFastifyInstance).swagger() as OpenAPIV3.Document));
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

import swagger from '@fastify/swagger';
import type { FastifyInstance, FastifySchema } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import type { OpenAPIV3 } from 'openapi-types';

type OpenApiFastifyInstance = FastifyInstance & {
  swagger: () => unknown;
};

type MethodPolicy = {
  resource: string;
  completeness: string;
  allowedMethods: string[];
  omittedMethods?: Array<{ method: string; reason: string }>;
  destructiveDeletes?: 'not-exposed' | 'not-applicable';
  notes: string;
};

type OperationWithMethodPolicy = OpenAPIV3.OperationObject & {
  'x-method-policy'?: MethodPolicy;
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

const phaseExample = {
  id: 'phase-intake',
  tenantId: 'ventas',
  phaseName: 'Intake',
  phaseShort: 'INT',
  phaseOrder: 10,
  description: 'Initial HET intake and preparation.',
  bomId: 'bom-amgraft-intake',
  keyText: 'INTAKE',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
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
  prodDuration: null,
  workflow: { id: 'wf-amgraft', name: 'AmGraft Standard', code: 'AMGRAFT_STD' },
  phase: { id: 'phase-intake', phaseName: 'Intake', phaseShort: 'INT', phaseOrder: 10 },
};

const workOrderAuditEventExample = {
  id: 'audit-1001',
  tenantId: 'ventas',
  workOrderId: 'WO-1001',
  action: 'work_order.phase_started',
  actorId: 'staff-operator-1',
  source: 'workOrderService.startWorkOrderPhase',
  previousState: {
    id: 'WO-1001',
    tenantId: 'ventas',
    workflowId: 'wf-amgraft',
    phaseId: 'phase-intake',
    phaseOrder: 10,
    hetId: 'het-1001',
    prodStart: null,
    prodEnd: null,
    prodDurationMinutes: null,
  },
  newState: {
    id: 'WO-1001',
    tenantId: 'ventas',
    workflowId: 'wf-amgraft',
    phaseId: 'phase-intake',
    phaseOrder: 10,
    hetId: 'het-1001',
    prodStart: '2026-07-01T09:00:00.000Z',
    prodEnd: null,
    prodDurationMinutes: null,
  },
  createdAt: '2026-07-01T09:00:00.000Z',
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
  listPhases: [phaseExample],
  listWorkOrders: [workOrderExample],
  createWorkOrder: workOrderExample,
  getWorkOrder: workOrderExample,
  listWorkOrderAuditEvents: [workOrderAuditEventExample],
  getWorkOrderInventoryTrace: inventoryTraceExample,
  startWorkOrderPhase: { ...workOrderExample, prodStart: '2026-07-01T09:00:00.000Z' },
  finishWorkOrderPhase: { ...workOrderExample, prodEnd: '2026-07-01T11:00:00.000Z', prodDuration: '120' },
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
  getInventoryLot: inventoryLotExample,
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

const methodPolicies: Record<string, MethodPolicy> = {
  getHealth: {
    resource: 'Health',
    completeness: 'complete',
    allowedMethods: ['GET'],
    destructiveDeletes: 'not-applicable',
    notes: 'Liveness-only endpoint used by Docker, CI, and reverse proxies.',
  },
  login: {
    resource: 'Auth session',
    completeness: 'complete',
    allowedMethods: ['POST'],
    destructiveDeletes: 'not-applicable',
    notes: 'JWT sessions are stateless; logout is a client-side acknowledgement endpoint.',
  },
  logout: {
    resource: 'Auth session',
    completeness: 'complete',
    allowedMethods: ['POST'],
    destructiveDeletes: 'not-applicable',
    notes: 'JWT sessions are stateless; no server-side session delete is required.',
  },
  authorizeOAuthProvider: {
    resource: 'OAuth flow',
    completeness: 'complete',
    allowedMethods: ['GET'],
    destructiveDeletes: 'not-applicable',
    notes: 'Redirect action, not a persisted CRUD resource.',
  },
  handleOAuthCallback: {
    resource: 'OAuth flow',
    completeness: 'complete',
    allowedMethods: ['GET'],
    destructiveDeletes: 'not-applicable',
    notes: 'Callback action provisions or updates staff identity links through the auth flow.',
  },
  registerStaff: {
    resource: 'Staff',
    completeness: 'controlled-crud-partial',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'DELETE', reason: 'Staff records are deactivated, not deleted, to preserve ownership and audit history.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Owner-only create path for local staff users.',
  },
  getCurrentUser: {
    resource: 'Staff',
    completeness: 'read-model',
    allowedMethods: ['GET'],
    destructiveDeletes: 'not-applicable',
    notes: 'Self-profile read model for the authenticated user.',
  },
  listStaff: {
    resource: 'Staff',
    completeness: 'controlled-crud-partial',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'DELETE', reason: 'Use active-state changes instead of deleting staff rows.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Admin/owner staff read model; updates are split into role and active-state commands.',
  },
  updateStaffRole: {
    resource: 'Staff',
    completeness: 'controlled-crud-partial',
    allowedMethods: ['PATCH'],
    omittedMethods: [{ method: 'DELETE', reason: 'Staff lifecycle uses deactivation to keep historical references intact.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Owner-only role assignment command.',
  },
  updateStaffActive: {
    resource: 'Staff',
    completeness: 'controlled-crud-partial',
    allowedMethods: ['PATCH'],
    omittedMethods: [{ method: 'DELETE', reason: 'Deactivation/reactivation is the supported staff lifecycle path.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Admin/owner lifecycle command for active state.',
  },
  listRoles: {
    resource: 'Role',
    completeness: 'read-model',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'POST/DELETE', reason: 'Built-in role catalog is not currently user-created or deleted through the API.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Role catalog read model.',
  },
  updateRole: {
    resource: 'Role',
    completeness: 'controlled-crud-partial',
    allowedMethods: ['PATCH'],
    omittedMethods: [{ method: 'DELETE', reason: 'Role deletion is not exposed while staff may reference roles.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Owner-only role display metadata update.',
  },
  listWorkflows: {
    resource: 'Workflow',
    completeness: 'controlled-crud-no-delete',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'DELETE', reason: 'Workflows are retired with active=false rather than destructively deleted.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Workflow resource supports list/get/create/update; delete is intentionally omitted.',
  },
  getWorkflow: {
    resource: 'Workflow',
    completeness: 'controlled-crud-no-delete',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'DELETE', reason: 'Workflows may be referenced by work orders and are retired by active=false.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Workflow detail includes ordered phase bindings.',
  },
  createWorkflow: {
    resource: 'Workflow',
    completeness: 'controlled-crud-no-delete',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'DELETE', reason: 'Use active=false instead of deleting workflow history.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Admin/owner creation path with optional initial phase bindings.',
  },
  updateWorkflow: {
    resource: 'Workflow',
    completeness: 'controlled-crud-no-delete',
    allowedMethods: ['PATCH'],
    omittedMethods: [{ method: 'DELETE', reason: 'Use active=false instead of deleting workflow history.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Admin/owner metadata and phase-binding update path.',
  },
  listPhases: {
    resource: 'Phase',
    completeness: 'read-model-master-data',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'POST/PATCH/DELETE', reason: 'Phase catalog mutation UI/API is not completed yet; workflows can bind existing tenant phases.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Tenant-scoped phase catalog used by workflow configuration phase binding.',
  },
  listWorkOrders: {
    resource: 'Work order',
    completeness: 'lifecycle-not-generic-crud',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'PUT/PATCH/DELETE', reason: 'Production runs change through explicit lifecycle actions to protect traceability.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Board read model for active work orders.',
  },
  getWorkOrder: {
    resource: 'Work order',
    completeness: 'lifecycle-not-generic-crud',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'PUT/PATCH/DELETE', reason: 'Generic mutation/delete would bypass phase and signature controls.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Work-order detail read model.',
  },
  listWorkOrderAuditEvents: {
    resource: 'Work order audit trail',
    completeness: 'read-only-audit',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'POST/PATCH/DELETE', reason: 'Audit events are written by controlled lifecycle actions and are not directly user-mutated.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Tenant-scoped audit trail for controlled work-order lifecycle actions with actor, source, previous state, and new state.',
  },
  createWorkOrder: {
    resource: 'Work order',
    completeness: 'lifecycle-not-generic-crud',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'DELETE', reason: 'Work orders are controlled production records and should use soft-delete/admin correction policy if added later.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Creates a production run at the first configured workflow phase.',
  },
  startWorkOrderPhase: {
    resource: 'Work order phase execution',
    completeness: 'lifecycle-action',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'PATCH/DELETE', reason: 'Phase execution is append-like state transition behavior, not generic resource editing.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Starts the current phase with optional signature evidence.',
  },
  finishWorkOrderPhase: {
    resource: 'Work order phase execution',
    completeness: 'lifecycle-action',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'PATCH/DELETE', reason: 'Phase completion must remain a controlled transition.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Finishes the current phase with optional signature evidence.',
  },
  advanceWorkOrder: {
    resource: 'Work order phase execution',
    completeness: 'lifecycle-action',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'PATCH/DELETE', reason: 'Advancement is guarded by lifecycle checks and should not be replaced by generic mutation.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Moves a work order to the next configured phase when gates pass.',
  },
  createSterilisation: {
    resource: 'Sterilisation/BET record',
    completeness: 'lifecycle-action',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'DELETE', reason: 'Sterilisation records are controlled evidence and must not be destructively deleted.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Creates IN/OUT sterilisation or BET evidence linked to a work order.',
  },
  listSterilisations: {
    resource: 'Sterilisation/BET record',
    completeness: 'read-model-plus-controlled-update',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'DELETE', reason: 'Sterilisation records are retained as production evidence.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Work-order-scoped sterilisation/BET read model.',
  },
  setSterilisationResult: {
    resource: 'Sterilisation/BET record',
    completeness: 'controlled-update',
    allowedMethods: ['PATCH'],
    omittedMethods: [{ method: 'DELETE', reason: 'Changing pass/fail is controlled; destructive delete is not exposed.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Admin/owner result update command.',
  },
  generateBatchRecord: {
    resource: 'Manufacturing batch record',
    completeness: 'lifecycle-action',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'DELETE', reason: 'Batch records are production documents and should remain auditable.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Generates and links the batch record for a work order.',
  },
  getBatchRecord: {
    resource: 'Manufacturing batch record',
    completeness: 'read-model',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'DELETE', reason: 'Batch records are retained as controlled production records.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Batch-record read model.',
  },
  listHets: {
    resource: 'HET',
    completeness: 'lifecycle-not-generic-crud',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'PUT/PATCH/DELETE', reason: 'HETs are linked through use/finish lifecycle actions; destructive delete is not exposed.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'HET register read model.',
  },
  useHet: {
    resource: 'HET',
    completeness: 'lifecycle-action',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'PATCH/DELETE', reason: 'Use linkage is a controlled state transition.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Links a HET to the work order currently using it.',
  },
  finishHet: {
    resource: 'HET',
    completeness: 'lifecycle-action',
    allowedMethods: ['POST'],
    omittedMethods: [{ method: 'PATCH/DELETE', reason: 'Finish linkage is a controlled state transition.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Links a HET to the work order that finished it.',
  },
};

const readOnlyTracePolicy = {
  completeness: 'read-only-trace',
  allowedMethods: ['GET'],
  omittedMethods: [{ method: 'POST/PATCH/DELETE', reason: 'Trace and genealogy views are derived read models; mutations belong to controlled source workflows.' }],
  destructiveDeletes: 'not-exposed' as const,
};

for (const operationId of ['getWorkOrderInventoryTrace', 'getHetInventoryTrace', 'getCollectionUnitInventoryTrace', 'getInventoryGenealogy']) {
  methodPolicies[operationId] = {
    resource: 'Inventory trace',
    ...readOnlyTracePolicy,
    notes: 'Derived traceability read model spanning lots, transactions, genealogy, HETs, and work orders.',
  };
}

for (const operationId of ['getProcurementOverview', 'listSupplyEntities', 'listCollectionPoints', 'listCollectionUnits', 'getCollectionUnit', 'listIssuanceOrders', 'listCollectionOrders', 'listCollectionReceipts']) {
  methodPolicies[operationId] = {
    resource: 'Procurement read model',
    completeness: 'read-model-operational-mutations-deferred',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'POST/PATCH/DELETE', reason: 'Procurement mutation workflows are not implemented yet; imported operational records are exposed read-only.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Read-only procurement surface over imported collection-unit, issuance, order, and receipt records.',
  };
}

for (const operationId of ['getInventoryOverview', 'listInventorySkus', 'listInventoryLots', 'getInventoryLot', 'listInventoryTransactions', 'listInventoryLocations']) {
  methodPolicies[operationId] = {
    resource: 'Inventory read model',
    completeness: 'read-model-operational-mutations-deferred',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'POST/PATCH/DELETE', reason: 'Inventory transactions and balances are traceability records; mutation workflows require controlled stock actions.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Read-only inventory surface over imported lots, SKUs, locations, and immutable transactions.',
  };
}

for (const operationId of ['listProcurementImportReports', 'listInventoryImportReports']) {
  methodPolicies[operationId] = {
    resource: 'Import report',
    completeness: 'read-only-admin-audit',
    allowedMethods: ['GET'],
    omittedMethods: [{ method: 'POST/PATCH/DELETE', reason: 'Import reports are generated by import jobs and retained as audit evidence.' }],
    destructiveDeletes: 'not-exposed',
    notes: 'Admin/owner import audit read model.',
  };
}

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

function addMethodPolicy(operation: OpenAPIV3.OperationObject) {
  if (!operation.operationId) return;
  const policy = methodPolicies[operation.operationId];
  if (policy) (operation as OperationWithMethodPolicy)['x-method-policy'] = policy;
}

export function enrichOpenApiDocument(document: OpenAPIV3.Document): OpenAPIV3.Document {
  for (const item of Object.values(document.paths)) {
    if (!item) continue;
    for (const method of ['delete', 'get', 'patch', 'post', 'put'] as const) {
      const operation = item[method];
      if (!operation) continue;
      addMethodPolicy(operation);
      addParameterExamples(operation);
      addRequestExample(operation);
      addResponseExamples(operation);
    }
  }

  document.info.description = `${document.info.description}\n\nError responses use a consistent JSON shape: \`{ "error": "message" }\`. List endpoints use explicit query parameters such as \`q\`, \`take\`, \`status\`, and domain filters where implemented; endpoints without those parameters are intentionally unpaginated read models today.\n\nMethod policy is documented per operation in \`x-method-policy\`. The API intentionally avoids generic destructive deletes for production, procurement, inventory, HET, sterilisation, and import-audit records; those domains use lifecycle actions, read models, deactivation, or future controlled correction workflows instead of full generic CRUD.`;
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
      <p>Routes are classified with OpenAPI tags, <code>x-route-kind</code>, and <code>x-method-policy</code> metadata so follow-up work can distinguish controlled CRUD, lifecycle actions, read models, auth, omitted methods, and intentionally absent destructive deletes.</p>
    </main>
  </body>
</html>`);
  });
}

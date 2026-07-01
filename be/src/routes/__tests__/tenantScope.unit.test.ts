import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflowService: {
    listWorkflows: vi.fn(),
    getWorkflow: vi.fn(),
    createWorkflow: vi.fn(),
    updateWorkflow: vi.fn(),
  },
  phaseService: {
    listPhases: vi.fn(),
  },
  workOrderService: {
    listWorkOrders: vi.fn(),
    getWorkOrder: vi.fn(),
    listWorkOrderAuditEvents: vi.fn(),
    createWorkOrder: vi.fn(),
    recordWorkOrderEquipment: vi.fn(),
    recordWorkOrderPhotoEvidence: vi.fn(),
    recordWorkOrderOutputQuantity: vi.fn(),
    recordWorkOrderSerial: vi.fn(),
    startWorkOrderPhase: vi.fn(),
    finishWorkOrderPhase: vi.fn(),
    advanceWorkOrder: vi.fn(),
  },
  sterilisationService: {
    createSterilisation: vi.fn(),
    listSterilisations: vi.fn(),
    setSterilisationResult: vi.fn(),
  },
  manufacturingService: {
    generateBatchRecord: vi.fn(),
    getBatchRecord: vi.fn(),
  },
  hetService: {
    listHets: vi.fn(),
    useHet: vi.fn(),
    finishHet: vi.fn(),
  },
  procurementService: {
    getProcurementOverview: vi.fn(),
    listSupplyEntities: vi.fn(),
    listCollectionPoints: vi.fn(),
    listCollectionUnits: vi.fn(),
    getCollectionUnit: vi.fn(),
    listIssuanceOrders: vi.fn(),
    listCollectionOrders: vi.fn(),
    listCollectionReceipts: vi.fn(),
    listImportReports: vi.fn(),
  },
  inventoryService: {
    getInventoryOverview: vi.fn(),
    listSkus: vi.fn(),
    listLots: vi.fn(),
    getLot: vi.fn(),
    listTransactions: vi.fn(),
    listLocations: vi.fn(),
    getGenealogy: vi.fn(),
    listImportReports: vi.fn(),
  },
  inventoryTraceService: {
    getWorkOrderInventoryTrace: vi.fn(),
    getCollectionUnitInventoryTrace: vi.fn(),
    getHetInventoryTrace: vi.fn(),
  },
}));

vi.mock('../../services/workflowService.js', () => mocks.workflowService);
vi.mock('../../services/phaseService.js', () => mocks.phaseService);
vi.mock('../../services/workOrderService.js', () => mocks.workOrderService);
vi.mock('../../services/sterilisationService.js', () => mocks.sterilisationService);
vi.mock('../../services/manufacturingService.js', () => mocks.manufacturingService);
vi.mock('../../services/hetService.js', () => mocks.hetService);
vi.mock('../../services/procurementService.js', () => mocks.procurementService);
vi.mock('../../services/inventoryService.js', () => mocks.inventoryService);
vi.mock('../../services/inventoryTraceService.js', () => mocks.inventoryTraceService);

const tenantId = 'tenant-route-a';
const adminActorId = 'staff-route-admin';
const userActorId = 'staff-route-user';
const now = new Date('2026-07-01T00:00:00.000Z');

const workflowDetail = {
  id: 'workflow-1',
  tenantId,
  name: 'AmGraft',
  code: 'AMGRAFT',
  description: null,
  active: true,
  createdById: adminActorId,
  updatedById: adminActorId,
  createdAt: now,
  updatedAt: now,
  createdBy: null,
  updatedBy: null,
  phases: [],
};

const workOrderDetail = {
  id: 'wo-1',
  tenantId,
  createdAt: now,
  updatedAt: now,
  createdById: adminActorId,
  updatedById: adminActorId,
  hetId: null,
  phaseId: null,
  phaseOrder: null,
  phaseShort: null,
  prodStart: null,
  startSignPath: null,
  startSignById: null,
  prodEnd: null,
  endSignPath: null,
  endSignById: null,
  prodDuration: null,
  outputQuantity: null,
  imagePath: null,
  manuId: null,
  manuNumber: null,
  woNumber: 'WO-1',
  reportPdfPath: null,
  deleted: false,
  forceField: null,
  keyText: null,
  previousWoId: null,
  steralisationCurrentId: null,
  nextPhaseId: null,
  workflowId: 'workflow-1',
  workflow: null,
  phase: null,
  nextPhase: null,
  het: null,
  manufacturer: null,
  steralisationCurrent: null,
  sterilises: [],
  woSerials: [],
  phaseEquips: [],
  batchHets: [],
  lifecycleState: 'NotStarted',
  operationalStatus: 'NotStarted',
  readinessBlockers: [],
  currentPhaseLabel: 'Unassigned',
  phaseOrderCurrent: null,
  legacyProductionState: 'unassigned',
  legacyStateBucket: '1. In Progress',
  canAdvanceLegacy: false,
  advanceRequirements: [],
  missingAdvanceRequirements: [],
  parityGaps: [],
  serialCheckDone: false,
  serialRequiredCount: 0,
  requiredSerials: [],
  allowedEquipment: [],
  combinedHetCheck: false,
  phaseTimeline: [],
  counts: { serials: 0, equipment: 0, sterilisationRecords: 0 },
};

const sterilisationDetail = {
  id: 'ster-1',
  tenantId,
  createdAt: now,
  updatedAt: now,
  createdById: adminActorId,
  updatedById: adminActorId,
  workOrderId: 'wo-1',
  manuId: null,
  direction: 'OUT',
  result: true,
  betReading: null,
  quantity: null,
  comment: null,
  imagePath: null,
  signOn: null,
  signById: null,
  signaturePath: null,
  keyText: null,
  batchHets: [],
};

const manufacturerDetail = {
  id: 'manu-1',
  tenantId,
  createdAt: now,
  updatedAt: now,
  createdById: adminActorId,
  updatedById: adminActorId,
  manuName: 'Batch WO-1',
  manuNumber: 'MANU-1',
  keyText: null,
  workOrders: [],
};

const hetDetail = {
  id: 'het-1',
  tenantId,
  createdAt: now,
  updatedAt: now,
  createdById: adminActorId,
  updatedById: adminActorId,
  clinicId: null,
  HCICode: null,
  clinicName: null,
  licenseName: null,
  address: null,
  hetNumber: 'HET-1',
  parcelTrackingNumber: null,
  deliverId: null,
  collectId: null,
  usedById: 'wo-1',
  finishedById: null,
  quantity: null,
  deleted: false,
  forceField: null,
  keyText: null,
  b11Weight: null,
  collectionUnitId: null,
  collectionReceiptLineId: null,
  sourceSystem: null,
  legacyClinicId: null,
  legacyDeliverId: null,
  legacyCollectId: null,
  usedBy: null,
  finishedBy: null,
  workOrders: [],
};

function stubRequiredEnv() {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgresql://workorder:workorder@localhost:5432/workorder_test');
  vi.stubEnv('JWT_SECRET', 'test-secret-at-least-16-chars');
  vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
}

function resetServiceMocks() {
  vi.clearAllMocks();

  mocks.workflowService.listWorkflows.mockResolvedValue([]);
  mocks.workflowService.getWorkflow.mockResolvedValue(null);
  mocks.workflowService.createWorkflow.mockResolvedValue(workflowDetail);
  mocks.workflowService.updateWorkflow.mockResolvedValue(workflowDetail);
  mocks.phaseService.listPhases.mockResolvedValue([]);
  mocks.workOrderService.listWorkOrders.mockResolvedValue([]);
  mocks.workOrderService.getWorkOrder.mockResolvedValue(null);
  mocks.workOrderService.listWorkOrderAuditEvents.mockResolvedValue([]);
  mocks.workOrderService.createWorkOrder.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.recordWorkOrderEquipment.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.recordWorkOrderPhotoEvidence.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.recordWorkOrderOutputQuantity.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.recordWorkOrderSerial.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.startWorkOrderPhase.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.finishWorkOrderPhase.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.advanceWorkOrder.mockResolvedValue(workOrderDetail);
  mocks.sterilisationService.createSterilisation.mockResolvedValue(sterilisationDetail);
  mocks.sterilisationService.listSterilisations.mockResolvedValue([]);
  mocks.sterilisationService.setSterilisationResult.mockResolvedValue(sterilisationDetail);
  mocks.manufacturingService.generateBatchRecord.mockResolvedValue(manufacturerDetail);
  mocks.manufacturingService.getBatchRecord.mockResolvedValue(null);
  mocks.hetService.listHets.mockResolvedValue([]);
  mocks.hetService.useHet.mockResolvedValue(hetDetail);
  mocks.hetService.finishHet.mockResolvedValue(hetDetail);
  mocks.procurementService.getProcurementOverview.mockResolvedValue({
    supplyEntities: 0,
    collectionPoints: 0,
    unitsTotal: 0,
    unitsOperational: 0,
    unitsPlaceholder: 0,
    issuanceOrders: 0,
    collectionOrders: 0,
    collectionReceipts: 0,
    linkedHets: 0,
  });
  mocks.procurementService.listSupplyEntities.mockResolvedValue([]);
  mocks.procurementService.listCollectionPoints.mockResolvedValue([]);
  mocks.procurementService.listCollectionUnits.mockResolvedValue([]);
  mocks.procurementService.getCollectionUnit.mockResolvedValue(null);
  mocks.procurementService.listIssuanceOrders.mockResolvedValue([]);
  mocks.procurementService.listCollectionOrders.mockResolvedValue([]);
  mocks.procurementService.listCollectionReceipts.mockResolvedValue([]);
  mocks.procurementService.listImportReports.mockResolvedValue([]);
  mocks.inventoryService.getInventoryOverview.mockResolvedValue({
    skus: 0,
    lots: 0,
    transactions: 0,
    locations: 0,
    balances: 0,
    importReports: 0,
    hetLots: 0,
    finishedGoodLots: 0,
  });
  mocks.inventoryService.listSkus.mockResolvedValue([]);
  mocks.inventoryService.listLots.mockResolvedValue([]);
  mocks.inventoryService.getLot.mockResolvedValue(null);
  mocks.inventoryService.listTransactions.mockResolvedValue([]);
  mocks.inventoryService.listLocations.mockResolvedValue([]);
  mocks.inventoryService.getGenealogy.mockResolvedValue(null);
  mocks.inventoryService.listImportReports.mockResolvedValue([]);
  mocks.inventoryTraceService.getWorkOrderInventoryTrace.mockResolvedValue(null);
  mocks.inventoryTraceService.getCollectionUnitInventoryTrace.mockResolvedValue(null);
  mocks.inventoryTraceService.getHetInventoryTrace.mockResolvedValue(null);
}

describe('route tenant propagation', () => {
  beforeEach(() => {
    stubRequiredEnv();
    resetServiceMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes the authenticated JWT tenant into tenant-scoped read and trace services', async () => {
    const { buildServer } = await import('../../server.js');
    const app = await buildServer();
    await app.ready();

    try {
      const userToken = app.jwt.sign({
        id: 'staff-route-user',
        email: 'route-user@example.test',
        role: 'user',
        tenantId,
      });
      const adminToken = app.jwt.sign({
        id: 'staff-route-admin',
        email: 'route-admin@example.test',
        role: 'admin',
        tenantId,
      });

      const get = (url: string, token = userToken) =>
        app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

      await get('/api/workflows?active=true');
      expect(mocks.workflowService.listWorkflows).toHaveBeenCalledWith({ activeOnly: true }, tenantId);

      await get('/api/workflows/workflow-1');
      expect(mocks.workflowService.getWorkflow).toHaveBeenCalledWith('workflow-1', tenantId);

      await get('/api/phases');
      expect(mocks.phaseService.listPhases).toHaveBeenCalledWith(tenantId);

      await get('/api/work-orders');
      expect(mocks.workOrderService.listWorkOrders).toHaveBeenCalledWith(tenantId);

      await get('/api/work-orders/wo-1');
      expect(mocks.workOrderService.getWorkOrder).toHaveBeenCalledWith('wo-1', tenantId);

      await get('/api/work-orders/wo-1/audit-events');
      expect(mocks.workOrderService.listWorkOrderAuditEvents).toHaveBeenCalledWith('wo-1', tenantId);

      await get('/api/work-orders/wo-1/inventory-trace');
      expect(mocks.inventoryTraceService.getWorkOrderInventoryTrace).toHaveBeenCalledWith('wo-1', tenantId);

      await get('/api/sterilisation?workOrderId=wo-1');
      expect(mocks.sterilisationService.listSterilisations).toHaveBeenCalledWith('wo-1', tenantId);

      await get('/api/manufacturing/manu-1');
      expect(mocks.manufacturingService.getBatchRecord).toHaveBeenCalledWith('manu-1', tenantId);

      await get('/api/hets');
      expect(mocks.hetService.listHets).toHaveBeenCalledWith(tenantId);

      await get('/api/hets/het-1/inventory-trace');
      expect(mocks.inventoryTraceService.getHetInventoryTrace).toHaveBeenCalledWith('het-1', tenantId);

      await get('/api/procurement/overview');
      expect(mocks.procurementService.getProcurementOverview).toHaveBeenCalledWith(tenantId);

      await get('/api/procurement/supply-entities');
      expect(mocks.procurementService.listSupplyEntities).toHaveBeenCalledWith(tenantId);

      await get('/api/procurement/collection-points?supplyEntityId=supply-1');
      expect(mocks.procurementService.listCollectionPoints).toHaveBeenCalledWith(tenantId, 'supply-1');

      await get('/api/procurement/collection-units?includeHidden=true&status=received&q=HET&take=25');
      expect(mocks.procurementService.listCollectionUnits).toHaveBeenCalledWith({
        tenantId,
        includeHidden: true,
        status: 'received',
        q: 'HET',
        take: 25,
      });

      await get('/api/procurement/collection-units/unit-1');
      expect(mocks.procurementService.getCollectionUnit).toHaveBeenCalledWith('unit-1', tenantId);

      await get('/api/procurement/collection-units/unit-1/inventory-trace');
      expect(mocks.inventoryTraceService.getCollectionUnitInventoryTrace).toHaveBeenCalledWith('unit-1', tenantId);

      await get('/api/procurement/issuance-orders');
      expect(mocks.procurementService.listIssuanceOrders).toHaveBeenCalledWith(tenantId);

      await get('/api/procurement/collection-orders');
      expect(mocks.procurementService.listCollectionOrders).toHaveBeenCalledWith(tenantId);

      await get('/api/procurement/collection-receipts');
      expect(mocks.procurementService.listCollectionReceipts).toHaveBeenCalledWith(tenantId);

      await get('/api/procurement/import-reports', adminToken);
      expect(mocks.procurementService.listImportReports).toHaveBeenCalledWith(tenantId);

      await get('/api/inventory/overview');
      expect(mocks.inventoryService.getInventoryOverview).toHaveBeenCalledWith(tenantId);

      await get('/api/inventory/skus?q=graft&take=25');
      expect(mocks.inventoryService.listSkus).toHaveBeenCalledWith({ tenantId, q: 'graft', take: 25 });

      await get('/api/inventory/lots?q=lot&inventoryType=HET&status=available&take=50');
      expect(mocks.inventoryService.listLots).toHaveBeenCalledWith({
        tenantId,
        q: 'lot',
        inventoryType: 'HET',
        status: 'available',
        take: 50,
      });

      await get('/api/inventory/lots/lot-1');
      expect(mocks.inventoryService.getLot).toHaveBeenCalledWith('lot-1', tenantId);

      await get('/api/inventory/transactions?q=WO-1&take=75');
      expect(mocks.inventoryService.listTransactions).toHaveBeenCalledWith({ tenantId, q: 'WO-1', take: 75 });

      await get('/api/inventory/locations');
      expect(mocks.inventoryService.listLocations).toHaveBeenCalledWith(tenantId);

      await get('/api/inventory/genealogy/lot-1');
      expect(mocks.inventoryService.getGenealogy).toHaveBeenCalledWith('lot-1', tenantId);

      await get('/api/inventory/import-reports', adminToken);
      expect(mocks.inventoryService.listImportReports).toHaveBeenCalledWith(tenantId);
    } finally {
      await app.close();
    }
  });

  it('passes the authenticated JWT actor and tenant into mutation and lifecycle services', async () => {
    const { buildServer } = await import('../../server.js');
    const app = await buildServer();
    await app.ready();

    try {
      const adminToken = app.jwt.sign({
        id: adminActorId,
        email: 'route-admin@example.test',
        role: 'admin',
        tenantId,
      });
      const userToken = app.jwt.sign({
        id: userActorId,
        email: 'route-user@example.test',
        role: 'user',
        tenantId,
      });

      const injectJson = (
        method: 'PATCH' | 'POST',
        url: string,
        payload?: unknown,
        token = adminToken,
      ) =>
        app.inject({
          method,
          url,
          headers: { authorization: `Bearer ${token}` },
          payload,
        });

      await injectJson('POST', '/api/workflows', {
        name: 'AmGraft',
        code: 'AMGRAFT',
        phases: [{ phaseId: 'phase-1', sortOrder: 10 }],
      });
      expect(mocks.workflowService.createWorkflow).toHaveBeenCalledWith(
        { name: 'AmGraft', code: 'AMGRAFT', phases: [{ phaseId: 'phase-1', sortOrder: 10 }] },
        adminActorId,
        tenantId,
      );

      await injectJson('PATCH', '/api/workflows/workflow-1', {
        active: false,
        phases: [{ phaseId: 'phase-2', sortOrder: 20 }],
      });
      expect(mocks.workflowService.updateWorkflow).toHaveBeenCalledWith(
        'workflow-1',
        { active: false, phases: [{ phaseId: 'phase-2', sortOrder: 20 }] },
        adminActorId,
        tenantId,
      );

      await injectJson('POST', '/api/work-orders', { workflowId: 'workflow-1', hetId: 'het-1' });
      expect(mocks.workOrderService.createWorkOrder).toHaveBeenCalledWith(
        { workflowId: 'workflow-1', hetId: 'het-1' },
        adminActorId,
        tenantId,
      );

      await injectJson(
        'POST',
        '/api/work-orders/wo-1/start',
        { signatureDataUrl: 'data:image/png;base64,abc' },
        userToken,
      );
      expect(mocks.workOrderService.startWorkOrderPhase).toHaveBeenCalledWith(
        'wo-1',
        userActorId,
        'data:image/png;base64,abc',
        tenantId,
      );

      await injectJson(
        'POST',
        '/api/work-orders/wo-1/finish',
        { signatureDataUrl: 'data:image/png;base64,def' },
        userToken,
      );
      expect(mocks.workOrderService.finishWorkOrderPhase).toHaveBeenCalledWith(
        'wo-1',
        userActorId,
        'data:image/png;base64,def',
        tenantId,
      );

      await injectJson('POST', '/api/work-orders/wo-1/advance', undefined, userToken);
      expect(mocks.workOrderService.advanceWorkOrder).toHaveBeenCalledWith('wo-1', userActorId, tenantId);

      await injectJson(
        'POST',
        '/api/work-orders/wo-1/equipment',
        { phaseEquipId: 'equip-1' },
        userToken,
      );
      expect(mocks.workOrderService.recordWorkOrderEquipment).toHaveBeenCalledWith(
        'wo-1',
        { phaseEquipId: 'equip-1' },
        userActorId,
        tenantId,
      );

      await injectJson(
        'POST',
        '/api/work-orders/wo-1/output-quantity',
        { outputQuantity: '1.0000' },
        userToken,
      );
      expect(mocks.workOrderService.recordWorkOrderOutputQuantity).toHaveBeenCalledWith(
        'wo-1',
        { outputQuantity: '1.0000' },
        userActorId,
        tenantId,
      );

      await injectJson(
        'POST',
        '/api/work-orders/wo-1/photo-evidence',
        { imageDataUrl: 'data:image/png;base64,AAAA' },
        userToken,
      );
      expect(mocks.workOrderService.recordWorkOrderPhotoEvidence).toHaveBeenCalledWith(
        'wo-1',
        { imageDataUrl: 'data:image/png;base64,AAAA' },
        userActorId,
        tenantId,
      );

      await injectJson(
        'POST',
        '/api/work-orders/wo-1/serials',
        { bomRefId: 'bom-line-1', serialNumber: 'SER-001' },
        userToken,
      );
      expect(mocks.workOrderService.recordWorkOrderSerial).toHaveBeenCalledWith(
        'wo-1',
        { bomRefId: 'bom-line-1', serialNumber: 'SER-001' },
        userActorId,
        tenantId,
      );

      await injectJson('POST', '/api/sterilisation', {
        workOrderId: 'wo-1',
        direction: 'OUT',
        result: true,
        hetIds: ['het-1'],
      });
      expect(mocks.sterilisationService.createSterilisation).toHaveBeenCalledWith(
        { workOrderId: 'wo-1', direction: 'OUT', result: true, hetIds: ['het-1'] },
        adminActorId,
        tenantId,
      );

      await injectJson('PATCH', '/api/sterilisation/ster-1', { result: false });
      expect(mocks.sterilisationService.setSterilisationResult).toHaveBeenCalledWith(
        'ster-1',
        false,
        adminActorId,
        tenantId,
      );

      await injectJson('POST', '/api/manufacturing/generate', { workOrderId: 'wo-1' });
      expect(mocks.manufacturingService.generateBatchRecord).toHaveBeenCalledWith(
        'wo-1',
        adminActorId,
        tenantId,
      );

      await injectJson('POST', '/api/hets/het-1/use', { workOrderId: 'wo-1' });
      expect(mocks.hetService.useHet).toHaveBeenCalledWith('het-1', {
        workOrderId: 'wo-1',
        actorId: adminActorId,
        tenantId,
      });

      await injectJson('POST', '/api/hets/het-1/finish', { workOrderId: 'wo-1' });
      expect(mocks.hetService.finishHet).toHaveBeenCalledWith('het-1', {
        workOrderId: 'wo-1',
        actorId: adminActorId,
        tenantId,
      });
    } finally {
      await app.close();
    }
  });
});

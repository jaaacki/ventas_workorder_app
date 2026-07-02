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
    getPhase: vi.fn(),
    createPhase: vi.fn(),
    updatePhase: vi.fn(),
    deletePhase: vi.fn(),
    listPhaseProcedures: vi.fn(),
    addPhaseProcedure: vi.fn(),
    deletePhaseProcedure: vi.fn(),
    listPhaseEquipmentBindings: vi.fn(),
    addPhaseEquipment: vi.fn(),
    deletePhaseEquipment: vi.fn(),
  },
  masterDataService: {
    listProcedures: vi.fn(),
    getProcedure: vi.fn(),
    createProcedure: vi.fn(),
    updateProcedure: vi.fn(),
    deleteProcedure: vi.fn(),
    listBoms: vi.fn(),
    getBom: vi.fn(),
    createBom: vi.fn(),
    updateBom: vi.fn(),
    deleteBom: vi.fn(),
    listBomLines: vi.fn(),
    getBomLine: vi.fn(),
    createBomLine: vi.fn(),
    updateBomLine: vi.fn(),
    deleteBomLine: vi.fn(),
    listPhaseEquipment: vi.fn(),
    getPhaseEquipment: vi.fn(),
    createPhaseEquipment: vi.fn(),
    updatePhaseEquipment: vi.fn(),
    deletePhaseEquipment: vi.fn(),
  },
  workOrderService: {
    listWorkOrders: vi.fn(),
    getWorkOrder: vi.fn(),
    listWorkOrderAuditEvents: vi.fn(),
    createWorkOrder: vi.fn(),
    recordWorkOrderEquipment: vi.fn(),
    recordWorkOrderPhotoEvidence: vi.fn(),
    recordWorkOrderOutputQuantity: vi.fn(),
    recordWorkOrderRelease: vi.fn(),
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
    procurementCrudResources: {
      supplyEntities: { resource: 'procurement.supplyEntity' },
      collectionPoints: { resource: 'procurement.collectionPoint' },
      collectionUnits: { resource: 'procurement.collectionUnit' },
      issuanceOrders: { resource: 'procurement.issuanceOrder' },
      issuanceOrderLines: { resource: 'procurement.issuanceOrderLine' },
      collectionUnitFulfilments: { resource: 'procurement.collectionUnitFulfilment' },
      collectionOrders: { resource: 'procurement.collectionOrder' },
      collectionReceipts: { resource: 'procurement.collectionReceipt' },
      collectionReceiptLines: { resource: 'procurement.collectionReceiptLine' },
      importReports: { resource: 'procurement.importReport', archiveOnly: true },
    },
    getProcurementOverview: vi.fn(),
    listSupplyEntities: vi.fn(),
    listCollectionPoints: vi.fn(),
    listCollectionUnits: vi.fn(),
    getCollectionUnit: vi.fn(),
    listIssuanceOrders: vi.fn(),
    listCollectionOrders: vi.fn(),
    listCollectionReceipts: vi.fn(),
    listImportReports: vi.fn(),
    listProcurementResource: vi.fn(),
    getProcurementResource: vi.fn(),
    createProcurementResource: vi.fn(),
    updateProcurementResource: vi.fn(),
    archiveProcurementResource: vi.fn(),
    restoreProcurementResource: vi.fn(),
    listProcurementResourceAudit: vi.fn(),
  },
  inventoryService: {
    inventoryCrudResources: {
      references: { resource: 'inventory.reference' },
      locations: { resource: 'inventory.location' },
      skus: { resource: 'inventory.sku' },
      lots: { resource: 'inventory.lot' },
      transactions: { resource: 'inventory.transaction' },
      balances: { resource: 'inventory.balance' },
      genealogy: { resource: 'inventory.genealogy' },
      workOrderConsumptions: { resource: 'inventory.workOrderConsumption' },
      importReports: { resource: 'inventory.importReport', archiveOnly: true },
    },
    getInventoryOverview: vi.fn(),
    listSkus: vi.fn(),
    listLots: vi.fn(),
    getLot: vi.fn(),
    listTransactions: vi.fn(),
    listLocations: vi.fn(),
    getGenealogy: vi.fn(),
    listImportReports: vi.fn(),
    listInventoryResource: vi.fn(),
    getInventoryResource: vi.fn(),
    createInventoryResource: vi.fn(),
    updateInventoryResource: vi.fn(),
    archiveInventoryResource: vi.fn(),
    restoreInventoryResource: vi.fn(),
    listInventoryResourceAudit: vi.fn(),
  },
  inventoryTraceService: {
    getWorkOrderInventoryTrace: vi.fn(),
    getCollectionUnitInventoryTrace: vi.fn(),
    getHetInventoryTrace: vi.fn(),
  },
  prisma: {
    rolePermission: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../services/workflowService.js', () => mocks.workflowService);
vi.mock('../../services/phaseService.js', () => mocks.phaseService);
vi.mock('../../services/masterDataService.js', () => mocks.masterDataService);
vi.mock('../../services/workOrderService.js', () => mocks.workOrderService);
vi.mock('../../services/sterilisationService.js', () => mocks.sterilisationService);
vi.mock('../../services/manufacturingService.js', () => mocks.manufacturingService);
vi.mock('../../services/hetService.js', () => mocks.hetService);
vi.mock('../../services/procurementService.js', () => mocks.procurementService);
vi.mock('../../services/inventoryService.js', () => mocks.inventoryService);
vi.mock('../../services/inventoryTraceService.js', () => mocks.inventoryTraceService);
vi.mock('../../db/prisma.js', () => ({ prisma: mocks.prisma }));

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

const phaseDetail = {
  id: 'phase-1',
  tenantId,
  phaseName: 'Intake',
  phaseShort: 'INT',
  phaseOrder: 10,
  description: null,
  bomId: null,
  keyText: null,
  createdAt: now,
  updatedAt: now,
};

const procedureDetail = {
  id: 'procedure-1',
  tenantId,
  procedureName: 'Intake checklist',
  procedureDesc: null,
  procedureShort: 'INTAKE',
  keyText: null,
  createdAt: now,
  updatedAt: now,
};

const bomDetail = {
  id: 'bom-1',
  tenantId,
  bomName: 'Intake BOM',
  keyText: null,
  createdAt: now,
  updatedAt: now,
  _count: { lines: 0, phases: 0 },
};

const bomLineDetail = {
  id: 'bom-line-1',
  tenantId,
  bomId: 'bom-1',
  bomName: 'Intake BOM',
  description: 'Membrane',
  quantity: '1.0000',
  uom: 'ea',
  hasSerial: true,
  deleted: false,
  keyText: null,
  createdAt: now,
  updatedAt: now,
};

const phaseEquipmentDetail = {
  id: 'equip-1',
  tenantId,
  equipId: 'EQ-1',
  name: 'Heat sealer',
  description: null,
  keyText: null,
  createdAt: now,
  updatedAt: now,
  _count: { phases: 0, workOrders: 0 },
};

const phaseProcedureBinding = {
  phaseId: 'phase-1',
  procedureId: 'procedure-1',
  procedure: {
    id: 'procedure-1',
    procedureName: 'Intake checklist',
    procedureShort: 'INTAKE',
    procedureDesc: null,
  },
};

const phaseEquipmentBinding = {
  phaseId: 'phase-1',
  phaseEquipId: 'equip-1',
  phaseEquip: {
    id: 'equip-1',
    equipId: 'EQ-1',
    name: 'Heat sealer',
    description: null,
  },
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
  releaseStatus: null,
  releaseDecisionAt: null,
  releaseDecisionById: null,
  releaseRemarks: null,
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

  mocks.prisma.rolePermission.findFirst.mockResolvedValue({ roleId: 'role-route' });
  mocks.workflowService.listWorkflows.mockResolvedValue([]);
  mocks.workflowService.getWorkflow.mockResolvedValue(null);
  mocks.workflowService.createWorkflow.mockResolvedValue(workflowDetail);
  mocks.workflowService.updateWorkflow.mockResolvedValue(workflowDetail);
  mocks.phaseService.listPhases.mockResolvedValue([]);
  mocks.phaseService.getPhase.mockResolvedValue(null);
  mocks.phaseService.createPhase.mockResolvedValue(phaseDetail);
  mocks.phaseService.updatePhase.mockResolvedValue(phaseDetail);
  mocks.phaseService.deletePhase.mockResolvedValue({ success: true });
  mocks.phaseService.listPhaseProcedures.mockResolvedValue([]);
  mocks.phaseService.addPhaseProcedure.mockResolvedValue(phaseProcedureBinding);
  mocks.phaseService.deletePhaseProcedure.mockResolvedValue({ success: true });
  mocks.phaseService.listPhaseEquipmentBindings.mockResolvedValue([]);
  mocks.phaseService.addPhaseEquipment.mockResolvedValue(phaseEquipmentBinding);
  mocks.phaseService.deletePhaseEquipment.mockResolvedValue({ success: true });
  mocks.masterDataService.listProcedures.mockResolvedValue([]);
  mocks.masterDataService.getProcedure.mockResolvedValue(null);
  mocks.masterDataService.createProcedure.mockResolvedValue(procedureDetail);
  mocks.masterDataService.updateProcedure.mockResolvedValue(procedureDetail);
  mocks.masterDataService.deleteProcedure.mockResolvedValue({ success: true });
  mocks.masterDataService.listBoms.mockResolvedValue([]);
  mocks.masterDataService.getBom.mockResolvedValue(null);
  mocks.masterDataService.createBom.mockResolvedValue(bomDetail);
  mocks.masterDataService.updateBom.mockResolvedValue(bomDetail);
  mocks.masterDataService.deleteBom.mockResolvedValue({ success: true });
  mocks.masterDataService.listBomLines.mockResolvedValue([]);
  mocks.masterDataService.getBomLine.mockResolvedValue(null);
  mocks.masterDataService.createBomLine.mockResolvedValue(bomLineDetail);
  mocks.masterDataService.updateBomLine.mockResolvedValue(bomLineDetail);
  mocks.masterDataService.deleteBomLine.mockResolvedValue({ success: true });
  mocks.masterDataService.listPhaseEquipment.mockResolvedValue([]);
  mocks.masterDataService.getPhaseEquipment.mockResolvedValue(null);
  mocks.masterDataService.createPhaseEquipment.mockResolvedValue(phaseEquipmentDetail);
  mocks.masterDataService.updatePhaseEquipment.mockResolvedValue(phaseEquipmentDetail);
  mocks.masterDataService.deletePhaseEquipment.mockResolvedValue({ success: true });
  mocks.workOrderService.listWorkOrders.mockResolvedValue([]);
  mocks.workOrderService.getWorkOrder.mockResolvedValue(null);
  mocks.workOrderService.listWorkOrderAuditEvents.mockResolvedValue([]);
  mocks.workOrderService.createWorkOrder.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.recordWorkOrderEquipment.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.recordWorkOrderPhotoEvidence.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.recordWorkOrderOutputQuantity.mockResolvedValue(workOrderDetail);
  mocks.workOrderService.recordWorkOrderRelease.mockResolvedValue(workOrderDetail);
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
  mocks.procurementService.listProcurementResource.mockResolvedValue([]);
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
  mocks.inventoryService.listInventoryResource.mockResolvedValue([]);
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

      await get('/api/phases/phase-1');
      expect(mocks.phaseService.getPhase).toHaveBeenCalledWith('phase-1', tenantId);

      await get('/api/phases/phase-1/procedures');
      expect(mocks.phaseService.listPhaseProcedures).toHaveBeenCalledWith('phase-1', tenantId);

      await get('/api/phases/phase-1/equipment');
      expect(mocks.phaseService.listPhaseEquipmentBindings).toHaveBeenCalledWith('phase-1', tenantId);

      await get('/api/master-data/procedures');
      expect(mocks.masterDataService.listProcedures).toHaveBeenCalledWith(tenantId);

      await get('/api/master-data/procedures/procedure-1');
      expect(mocks.masterDataService.getProcedure).toHaveBeenCalledWith('procedure-1', tenantId);

      await get('/api/master-data/boms');
      expect(mocks.masterDataService.listBoms).toHaveBeenCalledWith(tenantId);

      await get('/api/master-data/boms/bom-1');
      expect(mocks.masterDataService.getBom).toHaveBeenCalledWith('bom-1', tenantId);

      await get('/api/master-data/bom-lines?bomId=bom-1&includeDeleted=true');
      expect(mocks.masterDataService.listBomLines).toHaveBeenCalledWith({
        tenantId,
        bomId: 'bom-1',
        includeDeleted: true,
      });

      await get('/api/master-data/bom-lines/bom-line-1');
      expect(mocks.masterDataService.getBomLine).toHaveBeenCalledWith('bom-line-1', tenantId);

      await get('/api/master-data/phase-equipment');
      expect(mocks.masterDataService.listPhaseEquipment).toHaveBeenCalledWith(tenantId);

      await get('/api/master-data/phase-equipment/equip-1');
      expect(mocks.masterDataService.getPhaseEquipment).toHaveBeenCalledWith('equip-1', tenantId);

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
      expect(mocks.procurementService.listProcurementResource).toHaveBeenCalledWith('supplyEntities', {
        tenantId,
        includeDeleted: undefined,
      });

      await get('/api/procurement/collection-points?supplyEntityId=supply-1');
      expect(mocks.procurementService.listProcurementResource).toHaveBeenCalledWith('collectionPoints', {
        tenantId,
        includeDeleted: undefined,
        filters: { supplyEntityId: 'supply-1' },
      });

      await get('/api/procurement/collection-units?includeHidden=true&status=received&q=HET&take=25');
      expect(mocks.procurementService.listCollectionUnits).toHaveBeenCalledWith({
        tenantId,
        includeHidden: true,
        status: 'received',
        q: 'HET',
        take: 25,
      });

      await get('/api/procurement/collection-units/unit-1');
      expect(mocks.procurementService.getCollectionUnit).toHaveBeenCalledWith('unit-1', tenantId, undefined);

      await get('/api/procurement/collection-units/unit-1/inventory-trace');
      expect(mocks.inventoryTraceService.getCollectionUnitInventoryTrace).toHaveBeenCalledWith('unit-1', tenantId);

      await get('/api/procurement/issuance-orders');
      expect(mocks.procurementService.listProcurementResource).toHaveBeenCalledWith('issuanceOrders', {
        tenantId,
        includeDeleted: undefined,
      });

      await get('/api/procurement/collection-orders');
      expect(mocks.procurementService.listProcurementResource).toHaveBeenCalledWith('collectionOrders', {
        tenantId,
        includeDeleted: undefined,
      });

      await get('/api/procurement/collection-receipts');
      expect(mocks.procurementService.listProcurementResource).toHaveBeenCalledWith('collectionReceipts', {
        tenantId,
        includeDeleted: undefined,
      });

      await get('/api/procurement/import-reports', adminToken);
      expect(mocks.procurementService.listImportReports).toHaveBeenCalledWith({
        tenantId,
        includeDeleted: undefined,
      });

      await get('/api/inventory/overview');
      expect(mocks.inventoryService.getInventoryOverview).toHaveBeenCalledWith(tenantId);

      await get('/api/inventory/skus?q=graft&take=25');
      expect(mocks.inventoryService.listSkus).toHaveBeenCalledWith({
        tenantId,
        q: 'graft',
        take: 25,
        includeDeleted: undefined,
      });

      await get('/api/inventory/lots?q=lot&inventoryType=HET&status=available&take=50');
      expect(mocks.inventoryService.listLots).toHaveBeenCalledWith({
        tenantId,
        q: 'lot',
        inventoryType: 'HET',
        status: 'available',
        take: 50,
        includeDeleted: undefined,
      });

      await get('/api/inventory/lots/lot-1');
      expect(mocks.inventoryService.getLot).toHaveBeenCalledWith('lot-1', tenantId, undefined);

      await get('/api/inventory/transactions?q=WO-1&take=75');
      expect(mocks.inventoryService.listTransactions).toHaveBeenCalledWith({
        tenantId,
        q: 'WO-1',
        take: 75,
        includeDeleted: undefined,
      });

      await get('/api/inventory/locations');
      expect(mocks.inventoryService.listLocations).toHaveBeenCalledWith({
        tenantId,
        includeDeleted: undefined,
      });

      await get('/api/inventory/lots/lot-1/genealogy');
      expect(mocks.inventoryService.getGenealogy).toHaveBeenCalledWith('lot-1', tenantId);

      await get('/api/inventory/import-reports', adminToken);
      expect(mocks.inventoryService.listImportReports).toHaveBeenCalledWith({
        tenantId,
        includeDeleted: undefined,
      });
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
        method: 'DELETE' | 'PATCH' | 'POST',
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

      await injectJson('POST', '/api/phases', {
        phaseName: 'Intake',
        phaseShort: 'INT',
        phaseOrder: 10,
      });
      expect(mocks.phaseService.createPhase).toHaveBeenCalledWith(
        { phaseName: 'Intake', phaseShort: 'INT', phaseOrder: 10 },
        adminActorId,
        tenantId,
      );

      await injectJson('PATCH', '/api/phases/phase-1', { description: 'Updated phase' });
      expect(mocks.phaseService.updatePhase).toHaveBeenCalledWith(
        'phase-1',
        { description: 'Updated phase' },
        adminActorId,
        tenantId,
      );

      await injectJson('DELETE', '/api/phases/phase-1');
      expect(mocks.phaseService.deletePhase).toHaveBeenCalledWith('phase-1', tenantId);

      await injectJson('POST', '/api/phases/phase-1/procedures', { procedureId: 'procedure-1' });
      expect(mocks.phaseService.addPhaseProcedure).toHaveBeenCalledWith('phase-1', 'procedure-1', tenantId);

      await injectJson('DELETE', '/api/phases/phase-1/procedures/procedure-1');
      expect(mocks.phaseService.deletePhaseProcedure).toHaveBeenCalledWith('phase-1', 'procedure-1', tenantId);

      await injectJson('POST', '/api/phases/phase-1/equipment', { phaseEquipId: 'equip-1' });
      expect(mocks.phaseService.addPhaseEquipment).toHaveBeenCalledWith('phase-1', 'equip-1', tenantId);

      await injectJson('DELETE', '/api/phases/phase-1/equipment/equip-1');
      expect(mocks.phaseService.deletePhaseEquipment).toHaveBeenCalledWith('phase-1', 'equip-1', tenantId);

      await injectJson('POST', '/api/master-data/procedures', {
        procedureName: 'Intake checklist',
        procedureShort: 'INTAKE',
      });
      expect(mocks.masterDataService.createProcedure).toHaveBeenCalledWith(
        { procedureName: 'Intake checklist', procedureShort: 'INTAKE' },
        adminActorId,
        tenantId,
      );

      await injectJson('PATCH', '/api/master-data/procedures/procedure-1', { procedureDesc: 'Updated' });
      expect(mocks.masterDataService.updateProcedure).toHaveBeenCalledWith(
        'procedure-1',
        { procedureDesc: 'Updated' },
        adminActorId,
        tenantId,
      );

      await injectJson('DELETE', '/api/master-data/procedures/procedure-1');
      expect(mocks.masterDataService.deleteProcedure).toHaveBeenCalledWith('procedure-1', tenantId);

      await injectJson('POST', '/api/master-data/boms', { bomName: 'Intake BOM' });
      expect(mocks.masterDataService.createBom).toHaveBeenCalledWith(
        { bomName: 'Intake BOM' },
        adminActorId,
        tenantId,
      );

      await injectJson('PATCH', '/api/master-data/boms/bom-1', { keyText: 'BOM' });
      expect(mocks.masterDataService.updateBom).toHaveBeenCalledWith(
        'bom-1',
        { keyText: 'BOM' },
        adminActorId,
        tenantId,
      );

      await injectJson('DELETE', '/api/master-data/boms/bom-1');
      expect(mocks.masterDataService.deleteBom).toHaveBeenCalledWith('bom-1', tenantId);

      await injectJson('POST', '/api/master-data/bom-lines', {
        bomId: 'bom-1',
        description: 'Membrane',
        quantity: '1.0000',
        hasSerial: true,
      });
      expect(mocks.masterDataService.createBomLine).toHaveBeenCalledWith(
        { bomId: 'bom-1', description: 'Membrane', quantity: '1.0000', hasSerial: true },
        adminActorId,
        tenantId,
      );

      await injectJson('PATCH', '/api/master-data/bom-lines/bom-line-1', { quantity: '2.0000' });
      expect(mocks.masterDataService.updateBomLine).toHaveBeenCalledWith(
        'bom-line-1',
        { quantity: '2.0000' },
        adminActorId,
        tenantId,
      );

      await injectJson('DELETE', '/api/master-data/bom-lines/bom-line-1');
      expect(mocks.masterDataService.deleteBomLine).toHaveBeenCalledWith('bom-line-1', adminActorId, tenantId);

      await injectJson('POST', '/api/master-data/phase-equipment', {
        equipId: 'EQ-1',
        name: 'Heat sealer',
      });
      expect(mocks.masterDataService.createPhaseEquipment).toHaveBeenCalledWith(
        { equipId: 'EQ-1', name: 'Heat sealer' },
        adminActorId,
        tenantId,
      );

      await injectJson('PATCH', '/api/master-data/phase-equipment/equip-1', { description: 'Updated' });
      expect(mocks.masterDataService.updatePhaseEquipment).toHaveBeenCalledWith(
        'equip-1',
        { description: 'Updated' },
        adminActorId,
        tenantId,
      );

      await injectJson('DELETE', '/api/master-data/phase-equipment/equip-1');
      expect(mocks.masterDataService.deletePhaseEquipment).toHaveBeenCalledWith('equip-1', tenantId);

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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflowService: {
    listWorkflows: vi.fn(),
    getWorkflow: vi.fn(),
  },
  workOrderService: {
    listWorkOrders: vi.fn(),
    getWorkOrder: vi.fn(),
  },
  sterilisationService: {
    listSterilisations: vi.fn(),
  },
  manufacturingService: {
    getBatchRecord: vi.fn(),
  },
  hetService: {
    listHets: vi.fn(),
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
vi.mock('../../services/workOrderService.js', () => mocks.workOrderService);
vi.mock('../../services/sterilisationService.js', () => mocks.sterilisationService);
vi.mock('../../services/manufacturingService.js', () => mocks.manufacturingService);
vi.mock('../../services/hetService.js', () => mocks.hetService);
vi.mock('../../services/procurementService.js', () => mocks.procurementService);
vi.mock('../../services/inventoryService.js', () => mocks.inventoryService);
vi.mock('../../services/inventoryTraceService.js', () => mocks.inventoryTraceService);

const tenantId = 'tenant-route-a';

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
  mocks.workOrderService.listWorkOrders.mockResolvedValue([]);
  mocks.workOrderService.getWorkOrder.mockResolvedValue(null);
  mocks.sterilisationService.listSterilisations.mockResolvedValue([]);
  mocks.manufacturingService.getBatchRecord.mockResolvedValue(null);
  mocks.hetService.listHets.mockResolvedValue([]);
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

      await get('/api/work-orders');
      expect(mocks.workOrderService.listWorkOrders).toHaveBeenCalledWith(tenantId);

      await get('/api/work-orders/wo-1');
      expect(mocks.workOrderService.getWorkOrder).toHaveBeenCalledWith('wo-1', tenantId);

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
});

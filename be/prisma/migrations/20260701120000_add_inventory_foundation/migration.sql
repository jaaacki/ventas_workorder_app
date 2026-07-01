CREATE TABLE "inventoryReference" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "refType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortCode" TEXT,
  "description" TEXT,
  "sourceSystem" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventoryReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventoryLocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "locationType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentLocationId" TEXT,
  "description" TEXT,
  "imagePath" TEXT,
  "sourceSystem" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventoryLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventorySku" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sku" TEXT,
  "description" TEXT,
  "category" TEXT,
  "brand" TEXT,
  "size" TEXT,
  "colour" TEXT,
  "uom" TEXT,
  "packQuantity" DECIMAL(18,4),
  "threshold" DECIMAL(18,4),
  "serialisedMode" TEXT,
  "qrImagePath" TEXT,
  "mediaUrl" TEXT,
  "qrPrintPath" TEXT,
  "sourceSystem" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventorySku_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventoryLot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inventorySkuId" TEXT,
  "lotNumber" TEXT,
  "inventoryType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "quantityInitial" DECIMAL(18,4),
  "quantityCurrent" DECIMAL(18,4),
  "uom" TEXT,
  "currentLocationId" TEXT,
  "collectionUnitId" TEXT,
  "hetId" TEXT,
  "workOrderId" TEXT,
  "sourceSystem" TEXT,
  "legacyItemSerialId" TEXT,
  "legacyCheckInOutId" TEXT,
  "legacyHetId" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventoryLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventoryTransaction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inventorySkuId" TEXT,
  "inventoryLotId" TEXT,
  "transactionType" TEXT NOT NULL,
  "direction" TEXT,
  "reason" TEXT,
  "quantity" DECIMAL(18,4),
  "uom" TEXT,
  "fromLocationId" TEXT,
  "toLocationId" TEXT,
  "workOrderId" TEXT,
  "occurredAt" TIMESTAMP(3),
  "actor" TEXT,
  "signaturePath" TEXT,
  "remarks" TEXT,
  "legacyRefNumber" TEXT,
  "legacyRefNumberOut" TEXT,
  "sourceSystem" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventoryTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventoryBalance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inventorySkuId" TEXT NOT NULL,
  "inventoryLotId" TEXT,
  "inventoryLocationId" TEXT,
  "quantity" DECIMAL(18,4),
  "sourceSystem" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventoryBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventoryGenealogy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "parentInventoryLotId" TEXT NOT NULL,
  "childInventoryLotId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "workOrderId" TEXT,
  "phaseId" TEXT,
  "sourceSystem" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventoryGenealogy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workOrderInventoryConsumption" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "inventoryLotId" TEXT,
  "inventorySkuId" TEXT,
  "bomLineId" TEXT,
  "quantity" DECIMAL(18,4),
  "uom" TEXT,
  "sourceSystem" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workOrderInventoryConsumption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventoryImportReport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "report" JSONB NOT NULL,
  CONSTRAINT "inventoryImportReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventoryReference_tenantId_refType_name_key" ON "inventoryReference"("tenantId", "refType", "name");
CREATE UNIQUE INDEX "inventoryLot_hetId_key" ON "inventoryLot"("hetId");
CREATE UNIQUE INDEX "inventoryBalance_tenantId_inventorySkuId_inventoryLotId_inventoryLocationId_key" ON "inventoryBalance"("tenantId", "inventorySkuId", "inventoryLotId", "inventoryLocationId");
CREATE UNIQUE INDEX "inventoryGenealogy_parentInventoryLotId_childInventoryLotId_relationshipType_key" ON "inventoryGenealogy"("parentInventoryLotId", "childInventoryLotId", "relationshipType");

CREATE INDEX "inventoryReference_tenantId_idx" ON "inventoryReference"("tenantId");
CREATE INDEX "inventoryReference_refType_idx" ON "inventoryReference"("refType");
CREATE INDEX "inventoryLocation_tenantId_idx" ON "inventoryLocation"("tenantId");
CREATE INDEX "inventoryLocation_locationType_idx" ON "inventoryLocation"("locationType");
CREATE INDEX "inventoryLocation_parentLocationId_idx" ON "inventoryLocation"("parentLocationId");
CREATE INDEX "inventorySku_tenantId_idx" ON "inventorySku"("tenantId");
CREATE INDEX "inventorySku_sku_idx" ON "inventorySku"("sku");
CREATE INDEX "inventorySku_category_idx" ON "inventorySku"("category");
CREATE INDEX "inventoryLot_tenantId_idx" ON "inventoryLot"("tenantId");
CREATE INDEX "inventoryLot_inventorySkuId_idx" ON "inventoryLot"("inventorySkuId");
CREATE INDEX "inventoryLot_collectionUnitId_idx" ON "inventoryLot"("collectionUnitId");
CREATE INDEX "inventoryLot_currentLocationId_idx" ON "inventoryLot"("currentLocationId");
CREATE INDEX "inventoryLot_legacyItemSerialId_idx" ON "inventoryLot"("legacyItemSerialId");
CREATE INDEX "inventoryLot_legacyHetId_idx" ON "inventoryLot"("legacyHetId");
CREATE INDEX "inventoryLot_inventoryType_idx" ON "inventoryLot"("inventoryType");
CREATE INDEX "inventoryLot_status_idx" ON "inventoryLot"("status");
CREATE INDEX "inventoryTransaction_tenantId_idx" ON "inventoryTransaction"("tenantId");
CREATE INDEX "inventoryTransaction_inventorySkuId_idx" ON "inventoryTransaction"("inventorySkuId");
CREATE INDEX "inventoryTransaction_inventoryLotId_idx" ON "inventoryTransaction"("inventoryLotId");
CREATE INDEX "inventoryTransaction_transactionType_idx" ON "inventoryTransaction"("transactionType");
CREATE INDEX "inventoryTransaction_occurredAt_idx" ON "inventoryTransaction"("occurredAt");
CREATE INDEX "inventoryTransaction_legacyRefNumber_idx" ON "inventoryTransaction"("legacyRefNumber");
CREATE INDEX "inventoryTransaction_legacyRefNumberOut_idx" ON "inventoryTransaction"("legacyRefNumberOut");
CREATE INDEX "inventoryBalance_tenantId_idx" ON "inventoryBalance"("tenantId");
CREATE INDEX "inventoryBalance_inventorySkuId_idx" ON "inventoryBalance"("inventorySkuId");
CREATE INDEX "inventoryBalance_inventoryLotId_idx" ON "inventoryBalance"("inventoryLotId");
CREATE INDEX "inventoryBalance_inventoryLocationId_idx" ON "inventoryBalance"("inventoryLocationId");
CREATE INDEX "inventoryGenealogy_tenantId_idx" ON "inventoryGenealogy"("tenantId");
CREATE INDEX "inventoryGenealogy_parentInventoryLotId_idx" ON "inventoryGenealogy"("parentInventoryLotId");
CREATE INDEX "inventoryGenealogy_childInventoryLotId_idx" ON "inventoryGenealogy"("childInventoryLotId");
CREATE INDEX "workOrderInventoryConsumption_tenantId_idx" ON "workOrderInventoryConsumption"("tenantId");
CREATE INDEX "workOrderInventoryConsumption_workOrderId_idx" ON "workOrderInventoryConsumption"("workOrderId");
CREATE INDEX "workOrderInventoryConsumption_inventoryLotId_idx" ON "workOrderInventoryConsumption"("inventoryLotId");
CREATE INDEX "workOrderInventoryConsumption_inventorySkuId_idx" ON "workOrderInventoryConsumption"("inventorySkuId");
CREATE INDEX "workOrderInventoryConsumption_bomLineId_idx" ON "workOrderInventoryConsumption"("bomLineId");
CREATE INDEX "inventoryImportReport_tenantId_idx" ON "inventoryImportReport"("tenantId");

ALTER TABLE "het" ADD CONSTRAINT "het_collectionUnitId_fkey" FOREIGN KEY ("collectionUnitId") REFERENCES "collectionUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "het" ADD CONSTRAINT "het_collectionReceiptLineId_fkey" FOREIGN KEY ("collectionReceiptLineId") REFERENCES "collectionReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventoryReference" ADD CONSTRAINT "inventoryReference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryLocation" ADD CONSTRAINT "inventoryLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryLocation" ADD CONSTRAINT "inventoryLocation_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "inventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventorySku" ADD CONSTRAINT "inventorySku_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryLot" ADD CONSTRAINT "inventoryLot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryLot" ADD CONSTRAINT "inventoryLot_inventorySkuId_fkey" FOREIGN KEY ("inventorySkuId") REFERENCES "inventorySku"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryLot" ADD CONSTRAINT "inventoryLot_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "inventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryLot" ADD CONSTRAINT "inventoryLot_collectionUnitId_fkey" FOREIGN KEY ("collectionUnitId") REFERENCES "collectionUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryLot" ADD CONSTRAINT "inventoryLot_hetId_fkey" FOREIGN KEY ("hetId") REFERENCES "het"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryLot" ADD CONSTRAINT "inventoryLot_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "workOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryTransaction" ADD CONSTRAINT "inventoryTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryTransaction" ADD CONSTRAINT "inventoryTransaction_inventorySkuId_fkey" FOREIGN KEY ("inventorySkuId") REFERENCES "inventorySku"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryTransaction" ADD CONSTRAINT "inventoryTransaction_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "inventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryTransaction" ADD CONSTRAINT "inventoryTransaction_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "inventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryTransaction" ADD CONSTRAINT "inventoryTransaction_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "inventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryBalance" ADD CONSTRAINT "inventoryBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryBalance" ADD CONSTRAINT "inventoryBalance_inventorySkuId_fkey" FOREIGN KEY ("inventorySkuId") REFERENCES "inventorySku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryBalance" ADD CONSTRAINT "inventoryBalance_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "inventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryBalance" ADD CONSTRAINT "inventoryBalance_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "inventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryGenealogy" ADD CONSTRAINT "inventoryGenealogy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryGenealogy" ADD CONSTRAINT "inventoryGenealogy_parentInventoryLotId_fkey" FOREIGN KEY ("parentInventoryLotId") REFERENCES "inventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventoryGenealogy" ADD CONSTRAINT "inventoryGenealogy_childInventoryLotId_fkey" FOREIGN KEY ("childInventoryLotId") REFERENCES "inventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workOrderInventoryConsumption" ADD CONSTRAINT "workOrderInventoryConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workOrderInventoryConsumption" ADD CONSTRAINT "workOrderInventoryConsumption_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "workOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workOrderInventoryConsumption" ADD CONSTRAINT "workOrderInventoryConsumption_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "inventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventoryImportReport" ADD CONSTRAINT "inventoryImportReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

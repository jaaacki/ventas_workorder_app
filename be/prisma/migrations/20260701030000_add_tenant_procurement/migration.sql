CREATE TABLE "tenant" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

INSERT INTO "tenant" ("id", "slug", "name", "active")
VALUES ('ventas', 'ventas', 'Ventas Bio', true)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "active" = EXCLUDED."active";

ALTER TABLE "staff" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "manufacturer" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "procedure" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "bom" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "bomLine" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "het" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "workflow" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "phase" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "phaseEquip" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "workOrder" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "woSerial" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "sterilise" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "printLabel" ADD COLUMN "tenantId" TEXT;

UPDATE "staff" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "manufacturer" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "procedure" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "bom" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "bomLine" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "het" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "workflow" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "phase" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "phaseEquip" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "workOrder" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "woSerial" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "sterilise" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;
UPDATE "printLabel" SET "tenantId" = 'ventas' WHERE "tenantId" IS NULL;

ALTER TABLE "het"
  ADD COLUMN "collectionUnitId" TEXT,
  ADD COLUMN "collectionReceiptLineId" TEXT,
  ADD COLUMN "sourceSystem" TEXT,
  ADD COLUMN "legacyClinicId" TEXT,
  ADD COLUMN "legacyDeliverId" TEXT,
  ADD COLUMN "legacyCollectId" TEXT;

CREATE TABLE "supplyEntity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT,
  "legalName" TEXT,
  "externalCode" TEXT,
  "sourceSystem" TEXT,
  "legacyGroupKey" TEXT,
  "legacyClinicId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplyEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collectionPoint" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplyEntityId" TEXT NOT NULL,
  "legacyClinicId" TEXT,
  "hciCode" TEXT,
  "displayName" TEXT,
  "licenseName" TEXT,
  "address" TEXT,
  "postalCode" TEXT,
  "telephone" TEXT,
  "personInCharge" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collectionPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collectionUnit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplyEntityId" TEXT,
  "collectionPointId" TEXT,
  "legacyHetId" TEXT,
  "unitNumber" TEXT,
  "parcelTrackingNumber" TEXT,
  "status" TEXT NOT NULL,
  "legacyDeliverId" TEXT,
  "legacyCollectId" TEXT,
  "legacyUsedByWorkOrderId" TEXT,
  "legacyNextHetId" TEXT,
  "sourceSystem" TEXT,
  "linkCompleteness" TEXT,
  "semanticConfidence" TEXT,
  "hiddenFromOperations" BOOLEAN NOT NULL DEFAULT false,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collectionUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "issuanceOrder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplyEntityId" TEXT,
  "collectionPointId" TEXT,
  "issuedAt" TIMESTAMP(3),
  "issuedBy" TEXT,
  "legacyDeliverCollectId" TEXT,
  "legacyDirection" TEXT,
  "semanticConfidence" TEXT,
  "level" TEXT,
  "remarks" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "issuanceOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "issuanceOrderLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "issuanceOrderId" TEXT NOT NULL,
  "collectionUnitId" TEXT,
  "legacyHetId" TEXT,
  "legacyHetNumber" TEXT,
  "parcelTrackingNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "issuanceOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collectionUnitFulfilment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "collectionUnitId" TEXT NOT NULL,
  "fulfilledAt" TIMESTAMP(3),
  "fulfilledBy" TEXT,
  "source" TEXT,
  "evidencePath" TEXT,
  "remarks" TEXT,
  "inferred" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collectionUnitFulfilment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collectionOrder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplyEntityId" TEXT,
  "collectionPointId" TEXT,
  "requestedAt" TIMESTAMP(3),
  "scheduledFor" TIMESTAMP(3),
  "requestedBy" TEXT,
  "status" TEXT NOT NULL,
  "legacyCollectDeliverCollectId" TEXT,
  "legacyDirection" TEXT,
  "semanticConfidence" TEXT,
  "legacyConflatedOrderReceipt" BOOLEAN NOT NULL DEFAULT false,
  "level" TEXT,
  "remarks" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collectionOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collectionReceipt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "collectionOrderId" TEXT,
  "receivedAt" TIMESTAMP(3),
  "receivedBy" TEXT,
  "signaturePath" TEXT,
  "remarks" TEXT,
  "legacyCollectDeliverCollectId" TEXT,
  "legacyConflatedOrderReceipt" BOOLEAN NOT NULL DEFAULT false,
  "acceptanceState" TEXT,
  "legacyRaw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collectionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collectionReceiptLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "collectionReceiptId" TEXT NOT NULL,
  "collectionUnitId" TEXT,
  "conditionStatus" TEXT,
  "acceptanceStatus" TEXT,
  "resultingHetId" TEXT,
  "discrepancyReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collectionReceiptLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurementImportReport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "report" JSONB NOT NULL,
  CONSTRAINT "procurementImportReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "issuanceOrderLine_issuanceOrderId_legacyHetId_key" ON "issuanceOrderLine"("issuanceOrderId", "legacyHetId");
CREATE UNIQUE INDEX "collectionUnitFulfilment_collectionUnitId_source_key" ON "collectionUnitFulfilment"("collectionUnitId", "source");
CREATE UNIQUE INDEX "collectionReceiptLine_collectionReceiptId_collectionUnitId_key" ON "collectionReceiptLine"("collectionReceiptId", "collectionUnitId");

CREATE INDEX "staff_tenantId_idx" ON "staff"("tenantId");
CREATE INDEX "manufacturer_tenantId_idx" ON "manufacturer"("tenantId");
CREATE INDEX "procedure_tenantId_idx" ON "procedure"("tenantId");
CREATE INDEX "bom_tenantId_idx" ON "bom"("tenantId");
CREATE INDEX "bomLine_tenantId_idx" ON "bomLine"("tenantId");
CREATE INDEX "het_tenantId_idx" ON "het"("tenantId");
CREATE INDEX "het_collectionUnitId_idx" ON "het"("collectionUnitId");
CREATE INDEX "het_collectionReceiptLineId_idx" ON "het"("collectionReceiptLineId");
CREATE INDEX "workflow_tenantId_idx" ON "workflow"("tenantId");
CREATE INDEX "phase_tenantId_idx" ON "phase"("tenantId");
CREATE INDEX "phaseEquip_tenantId_idx" ON "phaseEquip"("tenantId");
CREATE INDEX "workOrder_tenantId_idx" ON "workOrder"("tenantId");
CREATE INDEX "woSerial_tenantId_idx" ON "woSerial"("tenantId");
CREATE INDEX "sterilise_tenantId_idx" ON "sterilise"("tenantId");
CREATE INDEX "printLabel_tenantId_idx" ON "printLabel"("tenantId");
CREATE INDEX "supplyEntity_tenantId_idx" ON "supplyEntity"("tenantId");
CREATE INDEX "supplyEntity_legacyClinicId_idx" ON "supplyEntity"("legacyClinicId");
CREATE INDEX "collectionPoint_tenantId_idx" ON "collectionPoint"("tenantId");
CREATE INDEX "collectionPoint_supplyEntityId_idx" ON "collectionPoint"("supplyEntityId");
CREATE INDEX "collectionPoint_legacyClinicId_idx" ON "collectionPoint"("legacyClinicId");
CREATE INDEX "collectionUnit_tenantId_idx" ON "collectionUnit"("tenantId");
CREATE INDEX "collectionUnit_legacyHetId_idx" ON "collectionUnit"("legacyHetId");
CREATE INDEX "collectionUnit_collectionPointId_idx" ON "collectionUnit"("collectionPointId");
CREATE INDEX "collectionUnit_legacyUsedByWorkOrderId_idx" ON "collectionUnit"("legacyUsedByWorkOrderId");
CREATE INDEX "collectionUnit_status_idx" ON "collectionUnit"("status");
CREATE INDEX "issuanceOrder_tenantId_idx" ON "issuanceOrder"("tenantId");
CREATE INDEX "issuanceOrder_collectionPointId_idx" ON "issuanceOrder"("collectionPointId");
CREATE INDEX "issuanceOrder_legacyDeliverCollectId_idx" ON "issuanceOrder"("legacyDeliverCollectId");
CREATE INDEX "issuanceOrderLine_tenantId_idx" ON "issuanceOrderLine"("tenantId");
CREATE INDEX "issuanceOrderLine_collectionUnitId_idx" ON "issuanceOrderLine"("collectionUnitId");
CREATE INDEX "collectionUnitFulfilment_tenantId_idx" ON "collectionUnitFulfilment"("tenantId");
CREATE INDEX "collectionOrder_tenantId_idx" ON "collectionOrder"("tenantId");
CREATE INDEX "collectionOrder_collectionPointId_idx" ON "collectionOrder"("collectionPointId");
CREATE INDEX "collectionOrder_legacyCollectDeliverCollectId_idx" ON "collectionOrder"("legacyCollectDeliverCollectId");
CREATE INDEX "collectionReceipt_tenantId_idx" ON "collectionReceipt"("tenantId");
CREATE INDEX "collectionReceipt_collectionOrderId_idx" ON "collectionReceipt"("collectionOrderId");
CREATE INDEX "collectionReceipt_legacyCollectDeliverCollectId_idx" ON "collectionReceipt"("legacyCollectDeliverCollectId");
CREATE INDEX "collectionReceiptLine_tenantId_idx" ON "collectionReceiptLine"("tenantId");
CREATE INDEX "collectionReceiptLine_collectionUnitId_idx" ON "collectionReceiptLine"("collectionUnitId");
CREATE INDEX "collectionReceiptLine_resultingHetId_idx" ON "collectionReceiptLine"("resultingHetId");
CREATE INDEX "procurementImportReport_tenantId_idx" ON "procurementImportReport"("tenantId");

-- RBAC permissions for operational CRUD gates.
CREATE TABLE "permission" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rolePermission" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "auditLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");
CREATE UNIQUE INDEX "permission_resource_action_key" ON "permission"("resource", "action");
CREATE INDEX "permission_resource_idx" ON "permission"("resource");
CREATE INDEX "rolePermission_permissionId_idx" ON "rolePermission"("permissionId");
CREATE INDEX "auditLog_tenantId_entityType_entityId_createdAt_idx" ON "auditLog"("tenantId", "entityType", "entityId", "createdAt");
CREATE INDEX "auditLog_tenantId_action_createdAt_idx" ON "auditLog"("tenantId", "action", "createdAt");
CREATE INDEX "auditLog_actorId_idx" ON "auditLog"("actorId");

ALTER TABLE "rolePermission" ADD CONSTRAINT "rolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rolePermission" ADD CONSTRAINT "rolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplyEntity"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "supplyEntity_deleted_idx" ON "supplyEntity"("deleted");

ALTER TABLE "collectionPoint"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "collectionPoint_deleted_idx" ON "collectionPoint"("deleted");

ALTER TABLE "collectionUnit"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "collectionUnit_deleted_idx" ON "collectionUnit"("deleted");

ALTER TABLE "issuanceOrder"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "issuanceOrder_deleted_idx" ON "issuanceOrder"("deleted");

ALTER TABLE "issuanceOrderLine"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "issuanceOrderLine_deleted_idx" ON "issuanceOrderLine"("deleted");

ALTER TABLE "collectionUnitFulfilment"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "collectionUnitFulfilment_deleted_idx" ON "collectionUnitFulfilment"("deleted");

ALTER TABLE "collectionOrder"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "collectionOrder_deleted_idx" ON "collectionOrder"("deleted");

ALTER TABLE "collectionReceipt"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "collectionReceipt_deleted_idx" ON "collectionReceipt"("deleted");

ALTER TABLE "collectionReceiptLine"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "collectionReceiptLine_deleted_idx" ON "collectionReceiptLine"("deleted");

ALTER TABLE "procurementImportReport"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "procurementImportReport_deleted_idx" ON "procurementImportReport"("deleted");

ALTER TABLE "inventoryReference"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "inventoryReference_deleted_idx" ON "inventoryReference"("deleted");

ALTER TABLE "inventoryLocation"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "inventoryLocation_deleted_idx" ON "inventoryLocation"("deleted");

ALTER TABLE "inventorySku"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "inventorySku_deleted_idx" ON "inventorySku"("deleted");

ALTER TABLE "inventoryLot"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "inventoryLot_deleted_idx" ON "inventoryLot"("deleted");

ALTER TABLE "inventoryTransaction"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "inventoryTransaction_deleted_idx" ON "inventoryTransaction"("deleted");

ALTER TABLE "inventoryBalance"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "inventoryBalance_deleted_idx" ON "inventoryBalance"("deleted");

ALTER TABLE "inventoryGenealogy"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "inventoryGenealogy_deleted_idx" ON "inventoryGenealogy"("deleted");

ALTER TABLE "workOrderInventoryConsumption"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "workOrderInventoryConsumption_deleted_idx" ON "workOrderInventoryConsumption"("deleted");

ALTER TABLE "inventoryImportReport"
  ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
CREATE INDEX "inventoryImportReport_deleted_idx" ON "inventoryImportReport"("deleted");

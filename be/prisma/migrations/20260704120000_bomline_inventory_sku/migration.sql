-- Link BOM lines to the inventory catalog (BomLine ↔ InventorySku), and make the
-- existing WorkOrderInventoryConsumption.bomLineId a real FK. Additive + reversible:
-- new nullable column + FK constraints only; no data is changed here (backfill is
-- a separate idempotent script).

-- BomLine.inventorySkuId → InventorySku (nullable, SET NULL on delete).
ALTER TABLE "bomLine" ADD COLUMN "inventorySkuId" TEXT;
CREATE INDEX "bomLine_inventorySkuId_idx" ON "bomLine"("inventorySkuId");
ALTER TABLE "bomLine" ADD CONSTRAINT "bomLine_inventorySkuId_fkey" FOREIGN KEY ("inventorySkuId") REFERENCES "inventorySku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Promote the existing loose workOrderInventoryConsumption.bomLineId to a real FK
-- (column + index already exist from the inventory-foundation migration).
ALTER TABLE "workOrderInventoryConsumption" ADD CONSTRAINT "workOrderInventoryConsumption_bomLineId_fkey" FOREIGN KEY ("bomLineId") REFERENCES "bomLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

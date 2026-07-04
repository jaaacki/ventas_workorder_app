-- Phase.processType: the HET-collection process lever (epic #186 phase 0).
-- null = normal production phase, 'COLLECTION' = collection/logistics phase.
-- Additive and nullable, so every existing phase keeps its current behaviour.
ALTER TABLE "phase" ADD COLUMN "processType" TEXT;

-- WorkOrder <-> CollectionReceipt custody link, mirroring steralisationCurrentId:
-- a nullable unique FK so a work order references at most one collection receipt.
ALTER TABLE "workOrder" ADD COLUMN "collectionReceiptId" TEXT;

CREATE UNIQUE INDEX "workOrder_collectionReceiptId_key" ON "workOrder"("collectionReceiptId");

ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_collectionReceiptId_fkey" FOREIGN KEY ("collectionReceiptId") REFERENCES "collectionReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

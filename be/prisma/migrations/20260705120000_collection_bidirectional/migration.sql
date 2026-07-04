-- Bidirectional collection logistics (epic #186 phase 2, #189): the courier
-- round-trip deliver empty -> collect filled, recorded as distinct custody legs.
-- Additive + reversible: new nullable columns + one FK/index only; no existing
-- data is changed (imported CollectionUnit.status values are left untouched).

-- Deliver-empty leg: WorkOrder <-> IssuanceOrder custody link, mirroring
-- collectionReceiptId. A nullable unique FK so a work order references at most one
-- issued (empty-container) order.
ALTER TABLE "workOrder" ADD COLUMN "issuanceOrderId" TEXT;

CREATE UNIQUE INDEX "workOrder_issuanceOrderId_key" ON "workOrder"("issuanceOrderId");

ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_issuanceOrderId_fkey" FOREIGN KEY ("issuanceOrderId") REFERENCES "issuanceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custody signature captured on the deliver-empty leg (issuedAt is the sign date).
ALTER TABLE "issuanceOrder" ADD COLUMN "signaturePath" TEXT;

-- Collect-filled leg: the receipt points back to the prior deliver issuance for
-- unit continuity. Soft pointer (no FK), mirroring collectionReceipt.collectionOrderId.
ALTER TABLE "collectionReceipt" ADD COLUMN "issuanceOrderId" TEXT;

CREATE INDEX "collectionReceipt_issuanceOrderId_idx" ON "collectionReceipt"("issuanceOrderId");

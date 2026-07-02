ALTER TABLE "issuanceOrderLine"
  ADD COLUMN "itemCode" TEXT,
  ADD COLUMN "quantity" DECIMAL(18,4),
  ADD COLUMN "uom" TEXT;

ALTER TABLE "collectionReceiptLine"
  ADD COLUMN "itemCode" TEXT,
  ADD COLUMN "quantity" DECIMAL(18,4),
  ADD COLUMN "uom" TEXT;

ALTER TABLE "workOrder"
  ADD COLUMN "releaseStatus" TEXT,
  ADD COLUMN "releaseDecisionAt" TIMESTAMP(3),
  ADD COLUMN "releaseDecisionById" TEXT,
  ADD COLUMN "releaseRemarks" TEXT;

ALTER TABLE "workOrder"
  ADD CONSTRAINT "workOrder_releaseDecisionById_fkey"
  FOREIGN KEY ("releaseDecisionById") REFERENCES "staff"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

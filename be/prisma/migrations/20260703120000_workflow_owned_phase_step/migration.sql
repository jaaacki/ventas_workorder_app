-- Reshape the production recipe into a strict ownership hierarchy:
--   Workflow (1) -> Phase (N)  ordered, workflow-owned
--   Phase    (1) -> Step (N)   ordered, phase-owned (null phaseId = unplaced pool)
--
-- Replaces the shared M:N model (workflowPhase, phaseProcedure) and the
-- procedure catalog with owned phase + step tables, and adds isGate /
-- blocksCombine flags so per-line gate/combine behaviour is declared, not
-- inferred from hardcoded phaseOrder magic numbers.
--
-- Destructive: applied pre-cutover (no live production data). Existing recipe
-- rows are discarded and re-seeded. Work orders are detached from their phases.

-- 1. Detach work orders from phases about to be removed.
UPDATE "workOrder" SET "phaseId" = NULL, "nextPhaseId" = NULL, "phaseOrder" = NULL;

-- 2. Drop the shared M:N joins and the procedure catalog.
DROP TABLE "phaseProcedure";
DROP TABLE "workflowPhase";
DROP TABLE "procedure";

-- 3. Reshape phase into an ordered, workflow-owned entity.
DELETE FROM "phase";
ALTER TABLE "phase" DROP COLUMN "phaseOrder";
ALTER TABLE "phase" ADD COLUMN "workflowId" TEXT NOT NULL;
ALTER TABLE "phase" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "phase" ADD COLUMN "isGate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "phase" ADD COLUMN "blocksCombine" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "phase_workflowId_idx" ON "phase"("workflowId");
ALTER TABLE "phase" ADD CONSTRAINT "phase_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. New step entity, replaces procedure + phaseProcedure.
CREATE TABLE "step" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT 'ventas',
  "workflowId" TEXT NOT NULL,
  "phaseId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "code" TEXT,
  "name" TEXT,
  "description" TEXT,
  "keyText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "step_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "step_tenantId_idx" ON "step"("tenantId");
CREATE INDEX "step_workflowId_idx" ON "step"("workflowId");
CREATE INDEX "step_phaseId_idx" ON "step"("phaseId");

ALTER TABLE "step" ADD CONSTRAINT "step_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "step" ADD CONSTRAINT "step_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "step" ADD CONSTRAINT "step_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "step" ADD CONSTRAINT "step_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

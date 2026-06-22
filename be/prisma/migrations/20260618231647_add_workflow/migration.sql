-- CreateTable
CREATE TABLE "workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflowPhase" (
    "workflowId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "workflowPhase_pkey" PRIMARY KEY ("workflowId","phaseId")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_code_key" ON "workflow"("code");

-- CreateIndex
CREATE UNIQUE INDEX "workflowPhase_workflowId_sortOrder_key" ON "workflowPhase"("workflowId","sortOrder");

-- AlterTable
ALTER TABLE "workOrder" ADD COLUMN "workflowId" TEXT;

-- CreateIndex
CREATE INDEX "workOrder_workflowId_idx" ON "workOrder"("workflowId");

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflowPhase" ADD CONSTRAINT "workflowPhase_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflowPhase" ADD CONSTRAINT "workflowPhase_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

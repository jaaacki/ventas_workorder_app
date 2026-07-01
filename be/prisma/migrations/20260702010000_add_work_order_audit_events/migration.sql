CREATE TABLE "workOrderAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "source" TEXT NOT NULL,
    "previousState" JSONB,
    "newState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workOrderAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workOrderAuditEvent_tenantId_workOrderId_createdAt_idx" ON "workOrderAuditEvent"("tenantId", "workOrderId", "createdAt");
CREATE INDEX "workOrderAuditEvent_action_idx" ON "workOrderAuditEvent"("action");

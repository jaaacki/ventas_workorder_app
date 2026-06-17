-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "bitrixId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "manuName" TEXT,
    "manuNumber" TEXT,
    "keyText" TEXT,

    CONSTRAINT "manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "procedureName" TEXT,
    "procedureDesc" TEXT,
    "procedureShort" TEXT,
    "keyText" TEXT,

    CONSTRAINT "procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "bomName" TEXT,
    "keyText" TEXT,

    CONSTRAINT "bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bomLine" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "bomId" TEXT NOT NULL,
    "bomName" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(18,4),
    "uom" TEXT,
    "hasSerial" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "keyText" TEXT,

    CONSTRAINT "bomLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "het" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "clinicId" TEXT,
    "HCICode" TEXT,
    "clinicName" TEXT,
    "licenseName" TEXT,
    "address" TEXT,
    "hetNumber" TEXT,
    "parcelTrackingNumber" INTEGER,
    "deliverId" TEXT,
    "collectId" TEXT,
    "usedById" TEXT,
    "finishedById" TEXT,
    "quantity" INTEGER,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "forceField" INTEGER,
    "keyText" TEXT,
    "b11Weight" DECIMAL(18,4),

    CONSTRAINT "het_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "phaseName" TEXT,
    "phaseShort" TEXT,
    "phaseOrder" INTEGER,
    "description" TEXT,
    "bomId" TEXT,
    "keyText" TEXT,

    CONSTRAINT "phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phaseProcedure" (
    "phaseId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,

    CONSTRAINT "phaseProcedure_pkey" PRIMARY KEY ("phaseId","procedureId")
);

-- CreateTable
CREATE TABLE "phaseEquip" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "equipId" TEXT,
    "name" TEXT,
    "description" TEXT,
    "keyText" TEXT,

    CONSTRAINT "phaseEquip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phasePhaseEquip" (
    "phaseId" TEXT NOT NULL,
    "phaseEquipId" TEXT NOT NULL,

    CONSTRAINT "phasePhaseEquip_pkey" PRIMARY KEY ("phaseId","phaseEquipId")
);

-- CreateTable
CREATE TABLE "workOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "hetId" TEXT,
    "phaseId" TEXT,
    "phaseOrder" INTEGER,
    "phaseShort" TEXT,
    "prodStart" TIMESTAMP(3),
    "startSignPath" TEXT,
    "startSignById" TEXT,
    "prodEnd" TIMESTAMP(3),
    "endSignPath" TEXT,
    "endSignById" TEXT,
    "prodDuration" DECIMAL(18,4),
    "manuId" TEXT,
    "manuNumber" TEXT,
    "woNumber" TEXT,
    "reportPdfPath" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "forceField" INTEGER,
    "keyText" TEXT,
    "previousWoId" TEXT,
    "steralisationCurrentId" TEXT,
    "nextPhaseId" TEXT,

    CONSTRAINT "workOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workOrderHet" (
    "workOrderId" TEXT NOT NULL,
    "hetId" TEXT NOT NULL,

    CONSTRAINT "workOrderHet_pkey" PRIMARY KEY ("workOrderId","hetId")
);

-- CreateTable
CREATE TABLE "workOrderPhaseEquip" (
    "workOrderId" TEXT NOT NULL,
    "phaseEquipId" TEXT NOT NULL,

    CONSTRAINT "workOrderPhaseEquip_pkey" PRIMARY KEY ("workOrderId","phaseEquipId")
);

-- CreateTable
CREATE TABLE "woSerial" (
    "id" TEXT NOT NULL,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "workOrderId" TEXT NOT NULL,
    "bomRefId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "keyText" TEXT,

    CONSTRAINT "woSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sterilise" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "workOrderId" TEXT NOT NULL,
    "manuId" TEXT,
    "direction" TEXT,
    "result" BOOLEAN,
    "betReading" DECIMAL(18,4),
    "quantity" INTEGER,
    "comment" TEXT,
    "imagePath" TEXT,
    "signOn" TIMESTAMP(3),
    "signById" TEXT,
    "signaturePath" TEXT,
    "keyText" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "sterilise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steriliseHet" (
    "steriliseId" TEXT NOT NULL,
    "hetId" TEXT NOT NULL,

    CONSTRAINT "steriliseHet_pkey" PRIMARY KEY ("steriliseId","hetId")
);

-- CreateTable
CREATE TABLE "manufacturerHet" (
    "manufacturerId" TEXT NOT NULL,
    "hetId" TEXT NOT NULL,

    CONSTRAINT "manufacturerHet_pkey" PRIMARY KEY ("manufacturerId","hetId")
);

-- CreateTable
CREATE TABLE "printLabel" (
    "id" TEXT NOT NULL,
    "path" TEXT,
    "fileUrl" TEXT,
    "createdTime" TIMESTAMP(3),
    "lastModifiedBy" TEXT,
    "mimeType" TEXT,

    CONSTRAINT "printLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workOrder_steralisationCurrentId_key" ON "workOrder"("steralisationCurrentId");

-- AddForeignKey
ALTER TABLE "manufacturer" ADD CONSTRAINT "manufacturer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturer" ADD CONSTRAINT "manufacturer_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bomLine" ADD CONSTRAINT "bomLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bomLine" ADD CONSTRAINT "bomLine_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bomLine" ADD CONSTRAINT "bomLine_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "het" ADD CONSTRAINT "het_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "het" ADD CONSTRAINT "het_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "het" ADD CONSTRAINT "het_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "workOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "het" ADD CONSTRAINT "het_finishedById_fkey" FOREIGN KEY ("finishedById") REFERENCES "workOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase" ADD CONSTRAINT "phase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase" ADD CONSTRAINT "phase_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase" ADD CONSTRAINT "phase_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phaseProcedure" ADD CONSTRAINT "phaseProcedure_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phaseProcedure" ADD CONSTRAINT "phaseProcedure_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phaseEquip" ADD CONSTRAINT "phaseEquip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phaseEquip" ADD CONSTRAINT "phaseEquip_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phasePhaseEquip" ADD CONSTRAINT "phasePhaseEquip_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phasePhaseEquip" ADD CONSTRAINT "phasePhaseEquip_phaseEquipId_fkey" FOREIGN KEY ("phaseEquipId") REFERENCES "phaseEquip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_hetId_fkey" FOREIGN KEY ("hetId") REFERENCES "het"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_startSignById_fkey" FOREIGN KEY ("startSignById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_endSignById_fkey" FOREIGN KEY ("endSignById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_manuId_fkey" FOREIGN KEY ("manuId") REFERENCES "manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_previousWoId_fkey" FOREIGN KEY ("previousWoId") REFERENCES "workOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_steralisationCurrentId_fkey" FOREIGN KEY ("steralisationCurrentId") REFERENCES "sterilise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrder" ADD CONSTRAINT "workOrder_nextPhaseId_fkey" FOREIGN KEY ("nextPhaseId") REFERENCES "phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrderHet" ADD CONSTRAINT "workOrderHet_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "workOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrderHet" ADD CONSTRAINT "workOrderHet_hetId_fkey" FOREIGN KEY ("hetId") REFERENCES "het"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrderPhaseEquip" ADD CONSTRAINT "workOrderPhaseEquip_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "workOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workOrderPhaseEquip" ADD CONSTRAINT "workOrderPhaseEquip_phaseEquipId_fkey" FOREIGN KEY ("phaseEquipId") REFERENCES "phaseEquip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "woSerial" ADD CONSTRAINT "woSerial_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "woSerial" ADD CONSTRAINT "woSerial_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "woSerial" ADD CONSTRAINT "woSerial_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "workOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "woSerial" ADD CONSTRAINT "woSerial_bomRefId_fkey" FOREIGN KEY ("bomRefId") REFERENCES "bomLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sterilise" ADD CONSTRAINT "sterilise_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sterilise" ADD CONSTRAINT "sterilise_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sterilise" ADD CONSTRAINT "sterilise_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "workOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sterilise" ADD CONSTRAINT "sterilise_manuId_fkey" FOREIGN KEY ("manuId") REFERENCES "manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sterilise" ADD CONSTRAINT "sterilise_signById_fkey" FOREIGN KEY ("signById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steriliseHet" ADD CONSTRAINT "steriliseHet_steriliseId_fkey" FOREIGN KEY ("steriliseId") REFERENCES "sterilise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steriliseHet" ADD CONSTRAINT "steriliseHet_hetId_fkey" FOREIGN KEY ("hetId") REFERENCES "het"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturerHet" ADD CONSTRAINT "manufacturerHet_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturerHet" ADD CONSTRAINT "manufacturerHet_hetId_fkey" FOREIGN KEY ("hetId") REFERENCES "het"("id") ON DELETE CASCADE ON UPDATE CASCADE;

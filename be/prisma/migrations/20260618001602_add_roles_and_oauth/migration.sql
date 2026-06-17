-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- AlterTable
ALTER TABLE "staff" ADD COLUMN "googleId" TEXT;
ALTER TABLE "staff" ADD COLUMN "microsoftId" TEXT;
ALTER TABLE "staff" ADD COLUMN "roleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "staff_googleId_key" ON "staff"("googleId");
CREATE UNIQUE INDEX "staff_microsoftId_key" ON "staff"("microsoftId");
CREATE INDEX "staff_roleId_idx" ON "staff"("roleId");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

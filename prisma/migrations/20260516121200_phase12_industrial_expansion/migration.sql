-- Phase 12: optional LAN/industrial expansion metadata.
-- These additions are backward-compatible: no existing table receives a required business column.

CREATE INDEX IF NOT EXISTS "Product_barcode_idx" ON "Product"("barcode");

CREATE TABLE "OperationalVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "checksum" TEXT,
  "updatedById" TEXT,
  "updatedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "OperationalVersion_entityType_entityId_key" ON "OperationalVersion"("entityType", "entityId");
CREATE INDEX "OperationalVersion_entityType_updatedAt_idx" ON "OperationalVersion"("entityType", "updatedAt");

CREATE TABLE "OperationalLock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'PESSIMISTIC',
  "ownerUserId" TEXT,
  "reason" TEXT,
  "expiresAt" DATETIME,
  "releasedAt" DATETIME,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OperationalLock_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "OperationalLock_entityType_entityId_idx" ON "OperationalLock"("entityType", "entityId");
CREATE INDEX "OperationalLock_ownerUserId_idx" ON "OperationalLock"("ownerUserId");
CREATE INDEX "OperationalLock_expiresAt_idx" ON "OperationalLock"("expiresAt");

CREATE TABLE "BarcodeMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "barcode" TEXT NOT NULL,
  "format" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "skuSnapshot" TEXT,
  "label" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "printProfile" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BarcodeMapping_barcode_key" ON "BarcodeMapping"("barcode");
CREATE INDEX "BarcodeMapping_entityType_entityId_idx" ON "BarcodeMapping"("entityType", "entityId");
CREATE INDEX "BarcodeMapping_skuSnapshot_idx" ON "BarcodeMapping"("skuSnapshot");

CREATE TABLE "PrintTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "paperProfile" TEXT NOT NULL DEFAULT 'A4',
  "templateJson" TEXT NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "PrintTemplate_code_key" ON "PrintTemplate"("code");
CREATE INDEX "PrintTemplate_documentType_idx" ON "PrintTemplate"("documentType");
CREATE INDEX "PrintTemplate_isActive_idx" ON "PrintTemplate"("isActive");

CREATE TABLE "TouchTerminalProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "layoutJson" TEXT NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "TouchTerminalProfile_code_key" ON "TouchTerminalProfile"("code");
CREATE INDEX "TouchTerminalProfile_workflow_idx" ON "TouchTerminalProfile"("workflow");
CREATE INDEX "TouchTerminalProfile_isActive_idx" ON "TouchTerminalProfile"("isActive");

CREATE TABLE "MachineAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "location" TEXT,
  "serialNumber" TEXT,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "MachineAsset_code_key" ON "MachineAsset"("code");
CREATE INDEX "MachineAsset_kind_idx" ON "MachineAsset"("kind");
CREATE INDEX "MachineAsset_status_idx" ON "MachineAsset"("status");

CREATE TABLE "MachineMaintenanceSchedule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "machineId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "intervalDays" INTEGER,
  "nextDueAt" DATETIME NOT NULL,
  "lastDoneAt" DATETIME,
  "instructions" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MachineMaintenanceSchedule_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "MachineAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MachineMaintenanceSchedule_machineId_idx" ON "MachineMaintenanceSchedule"("machineId");
CREATE INDEX "MachineMaintenanceSchedule_status_nextDueAt_idx" ON "MachineMaintenanceSchedule"("status", "nextDueAt");

CREATE TABLE "MachineDowntime" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "machineId" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "endedAt" DATETIME,
  "reason" TEXT,
  "impactNotes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MachineDowntime_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "MachineAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MachineDowntime_machineId_idx" ON "MachineDowntime"("machineId");
CREATE INDEX "MachineDowntime_startedAt_idx" ON "MachineDowntime"("startedAt");

CREATE TABLE "MachineRepairRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "machineId" TEXT NOT NULL,
  "performedAt" DATETIME NOT NULL,
  "technician" TEXT,
  "description" TEXT NOT NULL,
  "costAmount" DECIMAL,
  "downtimeId" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MachineRepairRecord_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "MachineAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MachineRepairRecord_machineId_idx" ON "MachineRepairRecord"("machineId");
CREATE INDEX "MachineRepairRecord_performedAt_idx" ON "MachineRepairRecord"("performedAt");

CREATE TABLE "PurchaseForecastSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "materialKind" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "skuSnapshot" TEXT,
  "labelSnapshot" TEXT,
  "currentQty" DECIMAL NOT NULL,
  "averageDailyUse" DECIMAL NOT NULL,
  "daysRemaining" DECIMAL,
  "recommendedReorderAt" DATETIME,
  "supplierId" TEXT,
  "confidenceScore" DECIMAL NOT NULL DEFAULT 0,
  "seasonalityJson" TEXT NOT NULL DEFAULT '{}',
  "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PurchaseForecastSnapshot_materialKind_materialId_idx" ON "PurchaseForecastSnapshot"("materialKind", "materialId");
CREATE INDEX "PurchaseForecastSnapshot_generatedAt_idx" ON "PurchaseForecastSnapshot"("generatedAt");
CREATE INDEX "PurchaseForecastSnapshot_supplierId_idx" ON "PurchaseForecastSnapshot"("supplierId");

CREATE TABLE "SyncEnvelope" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "direction" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "cursor" TEXT,
  "payloadChecksum" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" DATETIME
);

CREATE INDEX "SyncEnvelope_direction_status_idx" ON "SyncEnvelope"("direction", "status");
CREATE INDEX "SyncEnvelope_scope_createdAt_idx" ON "SyncEnvelope"("scope", "createdAt");

CREATE TABLE "IndustrialAnalyticsSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "periodStart" DATETIME NOT NULL,
  "periodEnd" DATETIME NOT NULL,
  "machineUtilizationPct" DECIMAL NOT NULL DEFAULT 0,
  "productionEfficiencyScore" DECIMAL NOT NULL DEFAULT 0,
  "laborEfficiencyScore" DECIMAL NOT NULL DEFAULT 0,
  "throughputUnits" DECIMAL NOT NULL DEFAULT 0,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "IndustrialAnalyticsSnapshot_periodStart_periodEnd_idx" ON "IndustrialAnalyticsSnapshot"("periodStart", "periodEnd");
CREATE INDEX "IndustrialAnalyticsSnapshot_generatedAt_idx" ON "IndustrialAnalyticsSnapshot"("generatedAt");

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedReportPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filtersJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedReportPreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "absolutePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "format" TEXT NOT NULL DEFAULT 'ZIP_V1',
    "integrityStatus" TEXT,
    "verifiedAt" DATETIME,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "hireDate" DATETIME,
    "salaryType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "baseSalary" DECIMAL,
    "dailyWage" DECIMAL,
    "overtimeRate" DECIMAL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "overtimeRulesJson" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkerShift" (
    "workerId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("workerId", "shiftId"),
    CONSTRAINT "WorkerShift_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkerShift_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "workedDate" DATETIME NOT NULL,
    "checkInAt" DATETIME,
    "checkOutAt" DATETIME,
    "totalWorkedHours" DECIMAL,
    "overtimeHours" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "shiftId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRecord_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollCycle_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollCycleId" TEXT,
    "workerId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "overtimePay" DECIMAL NOT NULL DEFAULT 0,
    "deductions" DECIMAL NOT NULL DEFAULT 0,
    "advanceRecovery" DECIMAL NOT NULL DEFAULT 0,
    "netAmount" DECIMAL NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'DZD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollRecord_payrollCycleId_fkey" FOREIGN KEY ("payrollCycleId") REFERENCES "PayrollCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayrollRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalaryAdvance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reason" TEXT,
    "paymentDate" DATETIME NOT NULL,
    "repaymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalaryAdvance_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalaryAdvance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollAdvanceRecovery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salaryAdvanceId" TEXT NOT NULL,
    "payrollRecordId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollAdvanceRecovery_salaryAdvanceId_fkey" FOREIGN KEY ("salaryAdvanceId") REFERENCES "SalaryAdvance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayrollAdvanceRecovery_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "PayrollRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollRecordId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollAdjustment_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "PayrollRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RawMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL,
    "minimumStockQty" DECIMAL NOT NULL DEFAULT 0,
    "costPriceUnit" DECIMAL NOT NULL DEFAULT 0,
    "expirationTracking" BOOLEAN NOT NULL DEFAULT false,
    "expiryWarningDays" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supplierId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RawMaterial_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackagingMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL,
    "minimumStockQty" DECIMAL NOT NULL DEFAULT 0,
    "costPriceUnit" DECIMAL NOT NULL DEFAULT 0,
    "expirationTracking" BOOLEAN NOT NULL DEFAULT false,
    "expiryWarningDays" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supplierId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PackagingMaterial_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "invoiceRef" TEXT,
    "purchaseDate" DATETIME NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'DZD',
    "notes" TEXT,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseEntryLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseEntryId" TEXT NOT NULL,
    "materialKind" TEXT NOT NULL,
    "rawMaterialId" TEXT,
    "packagingMaterialId" TEXT,
    "qty" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "lineTotal" DECIMAL NOT NULL,
    "expiresAt" DATETIME,
    "labelSnapshot" TEXT,
    "skuSnapshot" TEXT,
    "unitSnapshot" TEXT,
    CONSTRAINT "PurchaseEntryLine_purchaseEntryId_fkey" FOREIGN KEY ("purchaseEntryId") REFERENCES "PurchaseEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseEntryLine_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseEntryLine_packagingMaterialId_fkey" FOREIGN KEY ("packagingMaterialId") REFERENCES "PackagingMaterial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialKind" TEXT NOT NULL,
    "rawMaterialId" TEXT,
    "packagingMaterialId" TEXT,
    "qtyBefore" DECIMAL NOT NULL,
    "qtyAfter" DECIMAL NOT NULL,
    "qtySigned" DECIMAL NOT NULL,
    "inventoryKind" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "expiresAt" DATETIME,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_packagingMaterialId_fkey" FOREIGN KEY ("packagingMaterialId") REFERENCES "PackagingMaterial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "productionNotes" TEXT,
    "yieldQty" DECIMAL NOT NULL,
    "yieldUnit" TEXT NOT NULL,
    "estimatedMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recipeVersion" INTEGER NOT NULL DEFAULT 1,
    "parentRecipeId" TEXT,
    "outputPackagingMaterialId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recipe_parentRecipeId_fkey" FOREIGN KEY ("parentRecipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Recipe_outputPackagingMaterialId_fkey" FOREIGN KEY ("outputPackagingMaterialId") REFERENCES "PackagingMaterial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "optionalIngredient" BOOLEAN NOT NULL DEFAULT false,
    "wastePct" DECIMAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "plannedQty" DECIMAL NOT NULL,
    "producedQty" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "notes" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "operatorId" TEXT,
    "costIngredientTotal" DECIMAL,
    "costLaborEstimate" DECIMAL,
    "costOverheadEstimate" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionBatch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionBatch_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionOperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT,
    "mixerCode" TEXT,
    "operatorId" TEXT,
    "runtimeMinutes" INTEGER,
    "cleaningDone" BOOLEAN NOT NULL DEFAULT false,
    "cleaningNotes" TEXT,
    "maintenanceNeeded" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceNotes" TEXT,
    "notes" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionOperationLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionOperationLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "sellingPrice" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UNIT',
    "recipeId" TEXT,
    "packagingMaterialId" TEXT,
    "barcode" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_packagingMaterialId_fkey" FOREIGN KEY ("packagingMaterialId") REFERENCES "PackagingMaterial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "taxIdentifier" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'DZD',
    "subtotalAmount" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "validatedAt" DATETIME,
    "validatedById" TEXT,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "labelFr" TEXT NOT NULL,
    "skuSnapshot" TEXT,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "lineDiscount" DECIMAL NOT NULL DEFAULT 0,
    "taxRate" DECIMAL NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL NOT NULL DEFAULT 0,
    "lineTax" DECIMAL NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "SavedReportPreset_createdById_section_idx" ON "SavedReportPreset"("createdById", "section");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "BackupRecord_createdAt_idx" ON "BackupRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_code_key" ON "Worker"("code");

-- CreateIndex
CREATE INDEX "Worker_department_idx" ON "Worker"("department");

-- CreateIndex
CREATE INDEX "Worker_isActive_idx" ON "Worker"("isActive");

-- CreateIndex
CREATE INDEX "Worker_lastName_firstName_idx" ON "Worker"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Shift_isActive_idx" ON "Shift"("isActive");

-- CreateIndex
CREATE INDEX "WorkerShift_shiftId_idx" ON "WorkerShift"("shiftId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workedDate_idx" ON "AttendanceRecord"("workedDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_status_idx" ON "AttendanceRecord"("status");

-- CreateIndex
CREATE INDEX "AttendanceRecord_shiftId_idx" ON "AttendanceRecord"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_workerId_workedDate_key" ON "AttendanceRecord"("workerId", "workedDate");

-- CreateIndex
CREATE INDEX "PayrollCycle_periodStart_periodEnd_idx" ON "PayrollCycle"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollCycle_status_idx" ON "PayrollCycle"("status");

-- CreateIndex
CREATE INDEX "PayrollRecord_workerId_idx" ON "PayrollRecord"("workerId");

-- CreateIndex
CREATE INDEX "PayrollRecord_periodStart_periodEnd_idx" ON "PayrollRecord"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollRecord_payrollCycleId_idx" ON "PayrollRecord"("payrollCycleId");

-- CreateIndex
CREATE INDEX "SalaryAdvance_workerId_idx" ON "SalaryAdvance"("workerId");

-- CreateIndex
CREATE INDEX "SalaryAdvance_paymentDate_idx" ON "SalaryAdvance"("paymentDate");

-- CreateIndex
CREATE INDEX "SalaryAdvance_repaymentStatus_idx" ON "SalaryAdvance"("repaymentStatus");

-- CreateIndex
CREATE INDEX "PayrollAdvanceRecovery_salaryAdvanceId_idx" ON "PayrollAdvanceRecovery"("salaryAdvanceId");

-- CreateIndex
CREATE INDEX "PayrollAdvanceRecovery_payrollRecordId_idx" ON "PayrollAdvanceRecovery"("payrollRecordId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_payrollRecordId_idx" ON "PayrollAdjustment"("payrollRecordId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_createdAt_idx" ON "PayrollAdjustment"("createdAt");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterial_sku_key" ON "RawMaterial"("sku");

-- CreateIndex
CREATE INDEX "RawMaterial_supplierId_idx" ON "RawMaterial"("supplierId");

-- CreateIndex
CREATE INDEX "RawMaterial_category_idx" ON "RawMaterial"("category");

-- CreateIndex
CREATE INDEX "RawMaterial_isActive_idx" ON "RawMaterial"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingMaterial_sku_key" ON "PackagingMaterial"("sku");

-- CreateIndex
CREATE INDEX "PackagingMaterial_supplierId_idx" ON "PackagingMaterial"("supplierId");

-- CreateIndex
CREATE INDEX "PackagingMaterial_category_idx" ON "PackagingMaterial"("category");

-- CreateIndex
CREATE INDEX "PackagingMaterial_isActive_idx" ON "PackagingMaterial"("isActive");

-- CreateIndex
CREATE INDEX "PurchaseEntry_supplierId_purchaseDate_idx" ON "PurchaseEntry"("supplierId", "purchaseDate");

-- CreateIndex
CREATE INDEX "PurchaseEntry_invoiceRef_idx" ON "PurchaseEntry"("invoiceRef");

-- CreateIndex
CREATE INDEX "PurchaseEntryLine_purchaseEntryId_idx" ON "PurchaseEntryLine"("purchaseEntryId");

-- CreateIndex
CREATE INDEX "PurchaseEntryLine_rawMaterialId_idx" ON "PurchaseEntryLine"("rawMaterialId");

-- CreateIndex
CREATE INDEX "PurchaseEntryLine_packagingMaterialId_idx" ON "PurchaseEntryLine"("packagingMaterialId");

-- CreateIndex
CREATE INDEX "StockMovement_materialKind_rawMaterialId_idx" ON "StockMovement"("materialKind", "rawMaterialId");

-- CreateIndex
CREATE INDEX "StockMovement_materialKind_packagingMaterialId_idx" ON "StockMovement"("materialKind", "packagingMaterialId");

-- CreateIndex
CREATE INDEX "StockMovement_occurredAt_idx" ON "StockMovement"("occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_inventoryKind_idx" ON "StockMovement"("inventoryKind");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_code_key" ON "Recipe"("code");

-- CreateIndex
CREATE INDEX "Recipe_category_idx" ON "Recipe"("category");

-- CreateIndex
CREATE INDEX "Recipe_isActive_idx" ON "Recipe"("isActive");

-- CreateIndex
CREATE INDEX "Recipe_parentRecipeId_idx" ON "Recipe"("parentRecipeId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_rawMaterialId_key" ON "RecipeIngredient"("recipeId", "rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_code_key" ON "ProductionBatch"("code");

-- CreateIndex
CREATE INDEX "ProductionBatch_recipeId_idx" ON "ProductionBatch"("recipeId");

-- CreateIndex
CREATE INDEX "ProductionBatch_status_idx" ON "ProductionBatch"("status");

-- CreateIndex
CREATE INDEX "ProductionBatch_scheduledAt_idx" ON "ProductionBatch"("scheduledAt");

-- CreateIndex
CREATE INDEX "ProductionBatch_finishedAt_idx" ON "ProductionBatch"("finishedAt");

-- CreateIndex
CREATE INDEX "ProductionOperationLog_batchId_idx" ON "ProductionOperationLog"("batchId");

-- CreateIndex
CREATE INDEX "ProductionOperationLog_operatorId_idx" ON "ProductionOperationLog"("operatorId");

-- CreateIndex
CREATE INDEX "ProductionOperationLog_startedAt_idx" ON "ProductionOperationLog"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_recipeId_idx" ON "Product"("recipeId");

-- CreateIndex
CREATE INDEX "Product_packagingMaterialId_idx" ON "Product"("packagingMaterialId");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_city_idx" ON "Customer"("city");

-- CreateIndex
CREATE INDEX "Customer_isActive_idx" ON "Customer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_paymentStatus_idx" ON "Invoice"("paymentStatus");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "PaymentRecord_invoiceId_idx" ON "PaymentRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentRecord_paidAt_idx" ON "PaymentRecord"("paidAt");

-- CreateIndex
CREATE INDEX "OperationalVersion_entityType_updatedAt_idx" ON "OperationalVersion"("entityType", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalVersion_entityType_entityId_key" ON "OperationalVersion"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "OperationalLock_entityType_entityId_idx" ON "OperationalLock"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "OperationalLock_ownerUserId_idx" ON "OperationalLock"("ownerUserId");

-- CreateIndex
CREATE INDEX "OperationalLock_expiresAt_idx" ON "OperationalLock"("expiresAt");

-- CreateIndex
CREATE INDEX "BarcodeMapping_entityType_entityId_idx" ON "BarcodeMapping"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "BarcodeMapping_skuSnapshot_idx" ON "BarcodeMapping"("skuSnapshot");

-- CreateIndex
CREATE UNIQUE INDEX "BarcodeMapping_barcode_key" ON "BarcodeMapping"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "PrintTemplate_code_key" ON "PrintTemplate"("code");

-- CreateIndex
CREATE INDEX "PrintTemplate_documentType_idx" ON "PrintTemplate"("documentType");

-- CreateIndex
CREATE INDEX "PrintTemplate_isActive_idx" ON "PrintTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TouchTerminalProfile_code_key" ON "TouchTerminalProfile"("code");

-- CreateIndex
CREATE INDEX "TouchTerminalProfile_workflow_idx" ON "TouchTerminalProfile"("workflow");

-- CreateIndex
CREATE INDEX "TouchTerminalProfile_isActive_idx" ON "TouchTerminalProfile"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MachineAsset_code_key" ON "MachineAsset"("code");

-- CreateIndex
CREATE INDEX "MachineAsset_kind_idx" ON "MachineAsset"("kind");

-- CreateIndex
CREATE INDEX "MachineAsset_status_idx" ON "MachineAsset"("status");

-- CreateIndex
CREATE INDEX "MachineMaintenanceSchedule_machineId_idx" ON "MachineMaintenanceSchedule"("machineId");

-- CreateIndex
CREATE INDEX "MachineMaintenanceSchedule_status_nextDueAt_idx" ON "MachineMaintenanceSchedule"("status", "nextDueAt");

-- CreateIndex
CREATE INDEX "MachineDowntime_machineId_idx" ON "MachineDowntime"("machineId");

-- CreateIndex
CREATE INDEX "MachineDowntime_startedAt_idx" ON "MachineDowntime"("startedAt");

-- CreateIndex
CREATE INDEX "MachineRepairRecord_machineId_idx" ON "MachineRepairRecord"("machineId");

-- CreateIndex
CREATE INDEX "MachineRepairRecord_performedAt_idx" ON "MachineRepairRecord"("performedAt");

-- CreateIndex
CREATE INDEX "PurchaseForecastSnapshot_materialKind_materialId_idx" ON "PurchaseForecastSnapshot"("materialKind", "materialId");

-- CreateIndex
CREATE INDEX "PurchaseForecastSnapshot_generatedAt_idx" ON "PurchaseForecastSnapshot"("generatedAt");

-- CreateIndex
CREATE INDEX "PurchaseForecastSnapshot_supplierId_idx" ON "PurchaseForecastSnapshot"("supplierId");

-- CreateIndex
CREATE INDEX "SyncEnvelope_direction_status_idx" ON "SyncEnvelope"("direction", "status");

-- CreateIndex
CREATE INDEX "SyncEnvelope_scope_createdAt_idx" ON "SyncEnvelope"("scope", "createdAt");

-- CreateIndex
CREATE INDEX "IndustrialAnalyticsSnapshot_periodStart_periodEnd_idx" ON "IndustrialAnalyticsSnapshot"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "IndustrialAnalyticsSnapshot_generatedAt_idx" ON "IndustrialAnalyticsSnapshot"("generatedAt");


/*
  Warnings:

  - You are about to drop the column `movementType` on the `StockMovement` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `StockMovement` table. All the data in the column will be lost.
  - Added the required column `inventoryKind` to the `StockMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qtyAfter` to the `StockMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qtyBefore` to the `StockMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qtySigned` to the `StockMovement` table without a default value. This is not possible if the table is not empty.

*/
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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PackagingMaterial" (
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
INSERT INTO "new_PackagingMaterial" ("createdAt", "id", "labelFr", "sku", "unit", "updatedAt") SELECT "createdAt", "id", "labelFr", "sku", "unit", "updatedAt" FROM "PackagingMaterial";
DROP TABLE "PackagingMaterial";
ALTER TABLE "new_PackagingMaterial" RENAME TO "PackagingMaterial";
CREATE UNIQUE INDEX "PackagingMaterial_sku_key" ON "PackagingMaterial"("sku");
CREATE INDEX "PackagingMaterial_supplierId_idx" ON "PackagingMaterial"("supplierId");
CREATE INDEX "PackagingMaterial_category_idx" ON "PackagingMaterial"("category");
CREATE INDEX "PackagingMaterial_isActive_idx" ON "PackagingMaterial"("isActive");
CREATE TABLE "new_RawMaterial" (
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
INSERT INTO "new_RawMaterial" ("createdAt", "id", "labelFr", "sku", "supplierId", "unit", "updatedAt") SELECT "createdAt", "id", "labelFr", "sku", "supplierId", "unit", "updatedAt" FROM "RawMaterial";
DROP TABLE "RawMaterial";
ALTER TABLE "new_RawMaterial" RENAME TO "RawMaterial";
CREATE UNIQUE INDEX "RawMaterial_sku_key" ON "RawMaterial"("sku");
CREATE INDEX "RawMaterial_supplierId_idx" ON "RawMaterial"("supplierId");
CREATE INDEX "RawMaterial_category_idx" ON "RawMaterial"("category");
CREATE INDEX "RawMaterial_isActive_idx" ON "RawMaterial"("isActive");
CREATE TABLE "new_StockMovement" (
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
-- Les anciens mouvements (quantité signée seule) ne sont pas convertis : on repart d'un grand-livre vierge.
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE INDEX "StockMovement_materialKind_rawMaterialId_idx" ON "StockMovement"("materialKind", "rawMaterialId");
CREATE INDEX "StockMovement_materialKind_packagingMaterialId_idx" ON "StockMovement"("materialKind", "packagingMaterialId");
CREATE INDEX "StockMovement_occurredAt_idx" ON "StockMovement"("occurredAt");
CREATE INDEX "StockMovement_inventoryKind_idx" ON "StockMovement"("inventoryKind");
CREATE TABLE "new_Supplier" (
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
INSERT INTO "new_Supplier" ("address", "contactName", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt") SELECT "address", "contactName", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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

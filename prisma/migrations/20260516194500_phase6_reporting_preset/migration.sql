-- Phase 6: reporting presets + batch finishedAt index (SQLite)

CREATE INDEX IF NOT EXISTS "ProductionBatch_finishedAt_idx" ON "ProductionBatch"("finishedAt");

CREATE TABLE IF NOT EXISTS "SavedReportPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filtersJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedReportPreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SavedReportPreset_createdById_section_idx" ON "SavedReportPreset"("createdById", "section");

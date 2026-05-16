-- Phase 7: backup archive metadata + ZIP default for new backups.
ALTER TABLE "BackupRecord" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'ZIP_V1';
ALTER TABLE "BackupRecord" ADD COLUMN "integrityStatus" TEXT;
ALTER TABLE "BackupRecord" ADD COLUMN "verifiedAt" DATETIME;

UPDATE "BackupRecord"
SET
  format = CASE
    WHEN LOWER(filename) LIKE '%.zip' THEN 'ZIP_V1'
    ELSE 'LEGACY_SQLITE'
  END,
  integrityStatus = CASE
    WHEN LOWER(filename) LIKE '%.sqlite' THEN 'LEGACY_FILE'
    ELSE integrityStatus
  END
WHERE 1 = 1;

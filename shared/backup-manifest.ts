import {
  BACKUP_ARCHIVE_FORMAT,
  BACKUP_MANIFEST_SCHEMA_VERSION,
} from "./release-metadata.js";

/** Legacy manifest (still accepted on verify/restore). */
export type BackupManifestV1 = {
  version: 1;
  sqliteSha256: string;
  createdAtUtc: string;
  appVersion: string;
};

/** Factory-auditable backup manifest (required for new exports). */
export type BackupManifestV2 = {
  version: typeof BACKUP_MANIFEST_SCHEMA_VERSION;
  backupFormat: typeof BACKUP_ARCHIVE_FORMAT;
  sqliteSha256: string;
  archiveSha256: string;
  createdAtUtc: string;
  backupTimestampUtc: string;
  appVersion: string;
  schemaVersion: string;
  schemaPrismaSha256: string;
  machineId: string;
  hostname: string;
  platform: string;
  electronVersion: string;
  nodeVersion: string;
};

export type ParsedBackupManifest = BackupManifestV1 | BackupManifestV2;

export function isBackupManifestV2(m: ParsedBackupManifest): m is BackupManifestV2 {
  return m.version === BACKUP_MANIFEST_SCHEMA_VERSION;
}

export function parseBackupManifestJson(raw: string): ParsedBackupManifest | null {
  try {
    const m = JSON.parse(raw) as ParsedBackupManifest;
    if (m.version === 1) {
      if (typeof m.sqliteSha256 !== "string" || typeof m.createdAtUtc !== "string") return null;
      return m;
    }
    if (m.version === BACKUP_MANIFEST_SCHEMA_VERSION) {
      const v2 = m as BackupManifestV2;
      if (
        typeof v2.sqliteSha256 !== "string" ||
        typeof v2.archiveSha256 !== "string" ||
        typeof v2.schemaVersion !== "string" ||
        typeof v2.machineId !== "string"
      ) {
        return null;
      }
      return v2;
    }
    return null;
  } catch {
    return null;
  }
}

export function manifestRequiredFields(m: ParsedBackupManifest): string[] {
  if (isBackupManifestV2(m)) {
    return [
      "sqliteSha256",
      "archiveSha256",
      "appVersion",
      "schemaVersion",
      "machineId",
      "backupTimestampUtc",
    ];
  }
  return ["sqliteSha256", "appVersion", "createdAtUtc"];
}

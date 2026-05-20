import type { BackupRecord } from "@prisma/client";

export type BackupRecordDTO = Omit<BackupRecord, "createdAt" | "verifiedAt"> & {
  createdAt: string;
  verifiedAt: string | null;
};

export type WorkstationInfoDTO = {
  hostname: string;
  version: string;
  platform: string;
  schemaVersion: string;
  schemaPrismaSha256: string;
  electronVersion: string;
  nodeVersion: string;
  backupFormatVersion: string;
  backupManifestVersion: number;
  machineId: string;
};

export type ActivityLogDTO = {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
  } | null;
};

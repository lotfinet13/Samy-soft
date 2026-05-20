import { describe, expect, it } from "vitest";
import {
  isBackupManifestV2,
  parseBackupManifestJson,
} from "../../shared/backup-manifest.ts";

describe("backup manifest v2", () => {
  it("parses v2 manifest with required factory fields", () => {
    const raw = JSON.stringify({
      version: 2,
      backupFormat: "ZIP_V1",
      sqliteSha256: "a".repeat(64),
      archiveSha256: "b".repeat(64),
      createdAtUtc: "2026-05-20T12:00:00.000Z",
      backupTimestampUtc: "2026-05-20T12:00:00.000Z",
      appVersion: "0.2.0",
      schemaVersion: "15637405…ae2fc3",
      schemaPrismaSha256: "c".repeat(64),
      machineId: "11111111-2222-4333-8444-555555555555",
      hostname: "FACTORY-01",
      platform: "win32",
      electronVersion: "34.5.8",
      nodeVersion: "20.19.1",
    });
    const m = parseBackupManifestJson(raw);
    expect(m).not.toBeNull();
    expect(isBackupManifestV2(m!)).toBe(true);
    if (isBackupManifestV2(m!)) {
      expect(m.machineId).toContain("-");
      expect(m.schemaVersion).toContain("…");
    }
  });

  it("still parses legacy v1 manifests", () => {
    const m = parseBackupManifestJson(
      JSON.stringify({
        version: 1,
        sqliteSha256: "d".repeat(64),
        createdAtUtc: "2026-01-01T00:00:00.000Z",
        appVersion: "0.1.0",
      }),
    );
    expect(m?.version).toBe(1);
  });

  it("rejects invalid manifest", () => {
    expect(parseBackupManifestJson("{}")).toBeNull();
  });
});

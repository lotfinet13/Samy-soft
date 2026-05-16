import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { app } from "electron";
import AdmZip from "adm-zip";
import type { PrismaClient } from "@prisma/client";
import { sqliteFileStats } from "./db-maintenance.js";
import { getBackupHealth } from "./backup-service.js";

function redactSecrets(s: string): string {
  let out = s;
  /** Ne jamais embarquer mots de passe connus même test. */
  out = out.replace(/password"?[:=]\s*[^\s&"]+/gi, '"password":"<redacted>"');
  out = out.replace(/token"?[:=]\s*[^\s&"]+/gi, '"token":"<redacted>"');
  return out;
}

export async function exportDiagnosticZipBundle(opts: {
  prisma: PrismaClient;
  deploymentCert: unknown;
}): Promise<{ absolutePath: string; filenameSuggested: string }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(app.getPath("userData"), "diagnostic-exports");
  await mkdir(outDir, { recursive: true });
  const filenameSuggested = `samy-soft-diagnostics_${stamp}.zip`;
  const absolutePath = path.join(outDir, filenameSuggested);

  const zip = new AdmZip();

  try {
    const logPath = path.join(app.getPath("userData"), "logs", "samy-soft-main.log");
    const log = await readFile(logPath, "utf8").catch(() => "");
    zip.addFile("logs/samy-soft-main-tail.txt", Buffer.from(redactSecrets(log.slice(-120_000)), "utf8"));
  } catch {
    zip.addFile("logs/readme.txt", Buffer.from("Aucun journal principal disponible.\n"));
  }

  const sqliteMeta = sqliteFileStats();
  const backupHealth = await getBackupHealth(opts.prisma).catch(() => null);

  const summary = {
    generatedAtIso: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${process.platform} ${process.arch}`,
    electronVersions: process.versions,
    appVersion: app.getVersion(),
    packaged: app.isPackaged,
    sqlite: {
      absolutePathMasked: sqliteMeta.absolutePath.replace(/\/Users\/[^/]+/, "/Users/<user>"),
      exists: sqliteMeta.exists,
      sizeBytes: sqliteMeta.sizeBytes,
    },
    backupHealthSnapshot: backupHealth,
    deploymentCertSummary: opts.deploymentCert,
    privacyNotice:
      "Bundle offline — aucun envoi cloud. Inspecter avant partage fichier (peut contenir SKU, noms fichiers locales).",
  };

  zip.addFile("manifest.json", Buffer.from(JSON.stringify(summary, null, 2), "utf8"));

  zip.writeZip(absolutePath);
  fs.chmodSync(absolutePath, 0o600);
  return { absolutePath, filenameSuggested };
}

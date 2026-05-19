import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import type { PrismaClient } from "../prisma-client.js";
import { sqliteFileStats } from "./db-maintenance.js";
import { getBackupHealth } from "./backup-service.js";
import { recordDeploymentCert } from "./qa-metrics-service.js";
import { getAllSettings } from "./settings-service.js";
import { APP_SETTING_KEYS } from "../../shared/settings-keys.js";

export type DeploymentCertResult = {
  runAt: string;
  overallOk: boolean;
  checks: Array<{ id: string; ok: boolean; detail?: string }>;
};

async function writableDirProbe(dir: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(
      dir,
      `.samy-soft-write-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
    );
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function probePrinters(): string[] {
  if (process.platform !== "win32") {
    return [];
  }
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name",
      ],
      { encoding: "utf8", timeout: 6_000, windowsHide: true },
    )
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return out.slice(0, 40);
  } catch {
    return [];
  }
}

export async function runDeploymentCertification(prisma: PrismaClient): Promise<DeploymentCertResult> {
  const runAt = new Date().toISOString();
  const checks: DeploymentCertResult["checks"] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ id: "db_connectivity", ok: true });
  } catch (e) {
    checks.push({
      id: "db_connectivity",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const stats = sqliteFileStats();
    const okSqlite = stats.exists && (stats.sizeBytes ?? 0) > 512;
    checks.push({
      id: "sqlite_file_exists",
      ok: okSqlite,
      detail: stats.exists ? `${stats.absolutePath} (${stats.sizeBytes} B)` : "fichier introuvable",
    });
  } catch (e) {
    checks.push({
      id: "sqlite_file_exists",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const userProbe = await writableDirProbe(app.getPath("userData"));
  checks.push({
    id: "user_data_writable",
    ok: userProbe.ok,
    detail: userProbe.detail,
  });

  const backupHealth = await getBackupHealth(prisma);
  checks.push({
    id: "backup_policy_not_stale",
    ok: !backupHealth.warningStale,
    detail:
      backupHealth.lastBackupAt === null ? "pas encore de sauvegarde" : `${backupHealth.lastBackupAt}`,
  });

  try {
    const settings = await getAllSettings(prisma);
    const dir = settings[APP_SETTING_KEYS.BACKUP_DIRECTORY] ?? "";
    if (!dir.trim()) {
      checks.push({
        id: "backup_destination_writable",
        ok: false,
        detail: "dossier de sauvegarde non configuré",
      });
    } else {
      const w = await writableDirProbe(dir);
      checks.push({
        id: "backup_destination_writable",
        ok: w.ok,
        detail: `${dir}${w.detail ? ` — ${w.detail}` : ""}`,
      });
    }
  } catch (e) {
    checks.push({
      id: "backup_destination_writable",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  checks.push({
    id: "electron_runtime_health",
    ok: true,
    detail: `${process.platform} ${process.arch} Electron ${process.versions?.electron ?? "?"}`,
  });

  checks.push({
    id: "workstation_identity",
    ok: typeof os.hostname() === "string" && os.hostname().length > 0,
    detail: os.hostname(),
  });

  const printers = probePrinters();
  checks.push({
    id: "printer_availability_optional",
    ok: printers.length > 0,
    detail:
      printers.length > 0
        ? `${printers.length} configurée(s) — exemple: ${printers[0]}`
        : "non détectées (facturation PDF possible sans tirage physique)",
  });

  checks.push({
    id: "packaged_or_dev_mode_explicit",
    ok: true,
    detail: app.isPackaged ? "packagé" : "développement",
  });

  const failingRequired = checks.filter((c) => {
    if (c.id === "printer_availability_optional") return false;
    return !c.ok;
  });
  const overallOk = failingRequired.length === 0;
  const result: DeploymentCertResult = { runAt, overallOk, checks };

  recordDeploymentCert({
    runAt: result.runAt,
    overallOk: result.overallOk,
    checks: result.checks,
  });
  return result;
}

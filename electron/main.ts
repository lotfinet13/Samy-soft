import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog } from "electron";
import { configureDatabaseUrl, connectPrismaWithRetry, disconnectPrisma } from "./database.js";
import { registerIpcHandlers } from "./ipc/handlers.js";
import { ensureDatabaseSchemaReady } from "./services/database-schema-service.js";
import { appendSamyMainLog, appendStructuredEvent, captureMainProcessError } from "./services/logger-service.js";
import { runStartupDiagnostics } from "./services/startup-diagnostics-service.js";
import { setupBackupScheduler } from "./services/backup-scheduler.js";
import { auditAbnormalShutdownIfNeeded, writeCleanShutdownMarker } from "./services/abnormal-shutdown-service.js";
import { reconcileStaleSessionAtStartup } from "./services/auth-service.js";
import { isSqliteLockError } from "./services/sqlite-connection.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function isE2ERequested(): boolean {
  return process.env.SAMY_E2E === "1" || process.argv.includes("--samy-e2e");
}

/**
 * Relâchement sécurité (sandbox / contextIsolation) réservé aux E2E Playwright en dev.
 * `SAMY_E2E=1` sur un installeur packagé ne doit jamais affaiblir Chromium — garde explicite.
 */
function isE2ERelaxMode(): boolean {
  if (!isE2ERequested()) return false;
  if (app.isPackaged) return false;
  return true;
}

/** Aligné preload : exposition `globalThis` uniquement si relax autorisé (voir preload). */
if (isE2ERelaxMode()) {
  process.env.SAMY_SOFT_E2E_GLOBAL_BRIDGE = "1";
} else if (isE2ERequested() && app.isPackaged) {
  console.warn(
    "[samy-soft] SAMY_E2E ignoré pour webPreferences : build packagé — sandbox et contextIsolation restent actifs.",
  );
}

/** Dev / unpackaged taskbar icon; packaged Windows uses the executable embedded icon. */
function resolveWindowIcon(): string | undefined {
  const candidates = [
    path.join(process.cwd(), "build", "icon.ico"),
    path.join(app.getAppPath(), "build", "icon.ico"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function attachNavigatorGuards(window: BrowserWindow): void {
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  contents.on("will-navigate", (_event, navigationUrl) => {
    const isFile = navigationUrl.startsWith("file:");
    if (!devServerUrl) {
      if (isFile) return;
      _event.preventDefault();
      return;
    }
    if (navigationUrl.startsWith(devServerUrl)) return;
    _event.preventDefault();
  });
}

function createMainWindow(): BrowserWindow {
  /** Playwright (unpackaged) : bridge global ; production packagée : toujours contextIsolation + sandbox. */
  const e2eRelax = isE2ERelaxMode();
  try {
    const preloadAbs = path.join(moduleDir, "preload.cjs");
    fs.mkdirSync(path.join(process.cwd(), "e2e", "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(process.cwd(), "e2e", "artifacts", "window-launch.txt"),
      `e2eRelax=${String(e2eRelax)}\npreloadPath=${preloadAbs}\nexists=${fs.existsSync(preloadAbs)}\n`,
      "utf8",
    );
  } catch {
    /* noop */
  }
  const windowIcon = resolveWindowIcon();
  const window = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: "SAMY SOFT",
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(moduleDir, "preload.cjs"),
      contextIsolation: !e2eRelax,
      nodeIntegration: false,
      sandbox: !e2eRelax,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.on("preload-error", (_evt, preloadPath, err) => {
    console.error("[samy-soft] preload-error", preloadPath, err);
    try {
      const logPath = path.join(process.cwd(), "e2e", "artifacts", "preload-error.log");
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(
        logPath,
        `${new Date().toISOString()} path=${preloadPath} err=${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
        "utf8",
      );
    } catch {
      /* noop */
    }
    void captureMainProcessError(
      `preload-script:${preloadPath}`,
      typeof err === "string"
        ? new Error(err)
        : err instanceof Error
          ? err
          : new Error(String(err)),
    );
  });

  attachNavigatorGuards(window);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const skipDevtools =
    process.env.SAMY_SKIP_DEVTOOLS === "1" ||
    process.env.SAMY_E2E === "1" ||
    process.env.SAMY_CI === "1";
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    if (!skipDevtools) window.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexHtml = path.join(moduleDir, "..", "..", "dist", "index.html");
    void window.loadURL(pathToFileURL(indexHtml).href);
  }

  return window;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const windows = BrowserWindow.getAllWindows();
    const existing = windows[0];
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });
}

void app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  try {
    fs.mkdirSync(path.join(process.cwd(), "e2e", "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(process.cwd(), "e2e", "artifacts", "main-boot.txt"),
      `${new Date().toISOString()}\n${JSON.stringify(process.argv)}\nrelax=${JSON.stringify(isE2ERelaxMode())}`,
      "utf8",
    );
  } catch {
    /* noop */
  }
  configureDatabaseUrl();
  registerIpcHandlers();

  process.on("uncaughtException", (error: unknown) => {
    void captureMainProcessError("uncaughtException", error);
  });
  process.on("unhandledRejection", (reason: unknown) => {
    void captureMainProcessError("unhandledRejection", reason instanceof Error ? reason : new Error(String(reason)));
  });

  let startupDiag: Awaited<ReturnType<typeof runStartupDiagnostics>> | null = null;
  try {
    const prisma = await connectPrismaWithRetry();
    await ensureDatabaseSchemaReady();
    await auditAbnormalShutdownIfNeeded(prisma);
    await reconcileStaleSessionAtStartup(prisma);
    startupDiag = await runStartupDiagnostics(prisma);
    if (!startupDiag.ok) {
      await appendStructuredEvent("warn", {
        scope: "startup-diagnostics",
        degraded: startupDiag.degraded,
        bootstrapDrift: startupDiag.bootstrapSchema.driftDetected,
        migrationPending: startupDiag.migrations.pendingCount,
        fkViolations: startupDiag.foreignKeys.violations.length,
        integrityIssues: startupDiag.businessIntegrity.issueCount,
        healthIntegrity: startupDiag.health.integrity.ok,
        lowDisk: startupDiag.health.diskSpace.lowSpaceWarning,
        sessionCleared: startupDiag.health.session.cleared,
      });
      await appendSamyMainLog("WARN startup diagnostics", {
        bootstrap: startupDiag.bootstrapSchema.detail,
        fk: startupDiag.foreignKeys.violations.slice(0, 5),
        health: startupDiag.health.writablePaths.errors,
      });
    }
    if (startupDiag.degraded && !startupDiag.ok) {
      dialog.showMessageBoxSync({
        type: "warning",
        title: "SAMY SOFT — Démarrage dégradé",
        message: "L'application a démarré en mode dégradé.",
        detail:
          "Des contrôles de santé ont signalé des anomalies (espace disque, sauvegardes ou intégrité).\n" +
          "Consultez Paramètres → Santé système et effectuez une sauvegarde avant de continuer la production.",
        buttons: ["Continuer"],
      });
    }
    if (!startupDiag.health.integrity.ok) {
      dialog.showErrorBox(
        "SAMY SOFT — Intégrité base",
        "La vérification d'intégrité SQLite a échoué.\n\n" +
          "Arrêtez l'application, restaurez une sauvegarde récente (ZIP) ou contactez le support.\n\n" +
          startupDiag.health.integrity.preview.slice(0, 3).join("\n"),
      );
      app.quit();
      return;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue à la connexion SQLite.";
    const lockHint = isSqliteLockError(error)
      ? "\n\nLa base est peut-être verrouillée par une autre copie de SAMY SOFT ou un antivirus. Fermez les autres instances et réessayez."
      : "";
    dialog.showErrorBox(
      "SAMY SOFT — Base de données",
      `Impossible d'initialiser la base locale.\n\n${message}${lockHint}`,
    );
    app.quit();
    return;
  }

  app.on("before-quit", () => {
    void writeCleanShutdownMarker();
    void disconnectPrisma();
  });

  await writeCleanShutdownMarker();
  await appendSamyMainLog("SAMY SOFT — principal prêt, sauvegardes automatiques suivies.");
  setupBackupScheduler();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

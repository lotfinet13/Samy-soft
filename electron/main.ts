import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog } from "electron";
import { configureDatabaseUrl, getPrisma } from "./database.js";
import { registerIpcHandlers } from "./ipc/handlers.js";
import { ensureDatabaseSchemaReady } from "./services/database-schema-service.js";
import { appendSamyMainLog, appendStructuredEvent, captureMainProcessError } from "./services/logger-service.js";
import { runStartupDiagnostics } from "./services/startup-diagnostics-service.js";
import { setupBackupScheduler } from "./services/backup-scheduler.js";

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
  const window = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: "SAMY SOFT",
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

void app.whenReady().then(async () => {
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

  try {
    await getPrisma().$connect();
    await ensureDatabaseSchemaReady();
    const startupDiag = await runStartupDiagnostics(getPrisma());
    if (!startupDiag.ok) {
      await appendStructuredEvent("warn", {
        scope: "startup-diagnostics",
        bootstrapDrift: startupDiag.bootstrapSchema.driftDetected,
        migrationPending: startupDiag.migrations.pendingCount,
        fkViolations: startupDiag.foreignKeys.violations.length,
        integrityIssues: startupDiag.businessIntegrity.issueCount,
      });
      await appendSamyMainLog("WARN startup diagnostics", {
        bootstrap: startupDiag.bootstrapSchema.detail,
        fk: startupDiag.foreignKeys.violations.slice(0, 5),
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue à la connexion SQLite.";
    dialog.showErrorBox(
      "SAMY SOFT — Base de données",
      `Impossible d'initialiser la base locale.\n\n${message}`,
    );
    app.quit();
    return;
  }

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

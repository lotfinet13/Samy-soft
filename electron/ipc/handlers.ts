import os from "node:os";
import { app, dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc-channels.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { getPrisma } from "../database.js";
import { logActivity } from "../services/activity-service.js";
import {
  authenticateUser,
  persistSession,
  readSession,
  resolveSessionUser,
  sessionHasPermission,
} from "../services/auth-service.js";
import { createInitialAdmin, getBootstrapStatus } from "../services/bootstrap-service.js";
import { ensureDatabaseSchemaReady } from "../services/database-schema-service.js";
import { readPublicBranding } from "../services/branding-service.js";
import { captureMainProcessError } from "../services/logger-service.js";
import { getAllSettings, upsertSettings } from "../services/settings-service.js";
import { registerHrHandlers } from "./hr-handlers.js";
import { registerInventoryHandlers } from "./inventory-handlers.js";
import { registerProductionHandlers } from "./production-handlers.js";
import { registerReportsHandlers } from "./reports-handlers.js";
import { registerSalesHandlers } from "./sales-handlers.js";
import { registerSystemHandlers } from "./system-handlers.js";

function ensureAuthenticatedPermissions(
  permissions: unknown,
  required: string | readonly string[],
): void {
  if (!sessionHasPermission(permissions, required)) {
    throw new Error("Permission refusée.");
  }
}

export function registerIpcHandlers(): void {
  registerInventoryHandlers();
  registerProductionHandlers();
  registerHrHandlers();
  registerSalesHandlers();
  registerReportsHandlers();
  registerSystemHandlers();

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, async () => {
    app.quit();
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.APP_WORKSTATION_INFO, async () => {
    return {
      hostname: os.hostname(),
      version: app.getVersion(),
      platform: process.platform,
    } as const;
  });

  ipcMain.handle(IPC_CHANNELS.BOOTSTRAP_STATUS, async () => {
    await ensureDatabaseSchemaReady();
    const prisma = getPrisma();
    return getBootstrapStatus(prisma);
  });

  ipcMain.handle(
    IPC_CHANNELS.BOOTSTRAP_CREATE_ADMIN,
    async (_evt, payload: { username: string; password: string; displayName?: string }) => {
      try {
        await ensureDatabaseSchemaReady();
        const prisma = getPrisma();
        const user = await createInitialAdmin(prisma, payload);
        const branding = await readPublicBranding(prisma);
        return { ok: true as const, user, branding };
      } catch (error) {
        await captureMainProcessError("bootstrap:create-admin", error, {
          username: payload?.username,
        });
        throw error;
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (_evt, payload: { username: string; password: string }) => {
      const prisma = getPrisma();
      const username = String(payload?.username ?? "").trim();
      const password = String(payload?.password ?? "");
      if (!username || !password) {
        return { ok: false as const, reason: "INVALID_CREDENTIALS" as const };
      }
      const result = await authenticateUser(prisma, username, password);
      if (!result.ok) return result;
      persistSession({ userId: result.user.id });
      await logActivity(prisma, {
        userId: result.user.id,
        action: "LOGIN",
        entityType: "session",
        metadata: { username: result.user.username },
      });
      const branding = await readPublicBranding(prisma);
      return { ok: true as const, user: result.user, branding };
    },
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    const prisma = getPrisma();
    const existing = readSession();
    persistSession(null);
    if (existing?.userId) {
      await logActivity(prisma, {
        userId: existing.userId,
        action: "LOGOUT",
        entityType: "session",
        metadata: {},
      });
    }
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_SESSION, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) return { ok: false as const };
    const branding = await readPublicBranding(prisma);
    return { ok: true as const, user, branding };
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    ensureAuthenticatedPermissions(user.role.permissions, PERMISSIONS.SETTINGS_READ);
    return getAllSettings(prisma);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SELECT_BACKUP_FOLDER, async () => {
    const prisma = getPrisma();
    const user = await resolveSessionUser(prisma);
    if (!user) throw new Error("Non authentifié.");
    ensureAuthenticatedPermissions(user.role.permissions, PERMISSIONS.SETTINGS_WRITE);
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const };
    }
    return { canceled: false as const, path: result.filePaths[0] };
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UPSERT,
    async (_evt, payload: Record<string, string>) => {
      const prisma = getPrisma();
      const user = await resolveSessionUser(prisma);
      if (!user) throw new Error("Non authentifié.");
      ensureAuthenticatedPermissions(user.role.permissions, PERMISSIONS.SETTINGS_WRITE);
      await upsertSettings(prisma, payload);
      await logActivity(prisma, {
        userId: user.id,
        action: "SETTINGS_UPSERT",
        entityType: "app_setting",
        metadata: { keys: Object.keys(payload) },
      });
      return getAllSettings(prisma);
    },
  );

}

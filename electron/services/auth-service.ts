import crypto from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../../shared/permissions.js";
import { RoleName, type Prisma, type PrismaClient } from "../prisma-client.js";
import { app } from "electron";
import ElectronStore from "electron-store";
import { getDatabaseFilePath } from "../database.js";
import { logActivity } from "./activity-service.js";
import {
  buildLogoutAuditPayload,
  buildStaleSessionInvalidationPayload,
} from "./session-logout-audit.js";

export type SessionPayload = {
  userId: string;
};

type SessionStoreSchema = {
  session: SessionPayload | null;
};

let sessionStore: ElectronStore<SessionStoreSchema> | null = null;

/** Session file is scoped per SQLite path (E2E, dev, packaged, future LAN DB). */
export function resolveSessionStoreName(): string {
  const dbPath = getDatabaseFilePath();
  const normalized = path.normalize(dbPath).toLowerCase();
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `session-${digest}`;
}

function resolveSessionStoreCwd(): string | undefined {
  try {
    if (app.isReady?.() || app.getName?.()) {
      return app.getPath("userData");
    }
  } catch {
    /* Vitest / Node scripts — isolated cwd under project .data */
  }
  return path.join(process.cwd(), ".data", "electron-session-store");
}

function getSessionStore(): ElectronStore<SessionStoreSchema> {
  if (!sessionStore) {
    const cwd = resolveSessionStoreCwd();
    sessionStore = new ElectronStore<SessionStoreSchema>({
      ...(cwd ? { cwd } : {}),
      name: resolveSessionStoreName(),
      defaults: { session: null },
    });
  }
  return sessionStore;
}

/** Test-only: reset cached store so the next access picks up a new DB scope. */
export function resetSessionStoreCacheForTests(): void {
  sessionStore = null;
}

function normalizePermissions(permissions: unknown): unknown {
  if (typeof permissions === "string") {
    try {
      return JSON.parse(permissions);
    } catch {
      return [];
    }
  }
  return permissions;
}

function permissionAllows(
  permissions: unknown,
  required: string | readonly string[],
): boolean {
  const normalized = normalizePermissions(permissions);
  if (!Array.isArray(normalized)) return false;
  const flat = normalized.filter((p): p is string => typeof p === "string");
  if (flat.includes("*")) return true;
  const req = Array.isArray(required) ? required : [required];
  return req.every((r) => flat.includes(r));
}

export async function authenticateUser(
  prisma: PrismaClient,
  username: string,
  password: string,
): Promise<
  | {
      ok: true;
      user: {
        id: string;
        username: string;
        displayName: string;
        role: { id: string; name: RoleName; labelFr: string; permissions: unknown };
      };
    }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "DISABLED" }
> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });
  if (!user?.isActive) return { ok: false, reason: "DISABLED" };
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return { ok: false, reason: "INVALID_CREDENTIALS" };

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: {
        id: user.role.id,
        name: user.role.name,
        labelFr: user.role.labelFr,
        permissions: user.role.permissions,
      },
    },
  };
}

export function persistSession(session: SessionPayload | null): void {
  getSessionStore().set("session", session);
}

export function readSession(): SessionPayload | null {
  return getSessionStore().get("session");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Detect structurally invalid persisted session (corrupt store or manual edit). */
export function detectCorruptedSessionPayload(
  session: SessionPayload | null,
): { corrupted: boolean; detail?: string } {
  if (session === null) return { corrupted: false };
  if (typeof session !== "object" || session === null) {
    return { corrupted: true, detail: "session n'est pas un objet" };
  }
  const userId = (session as { userId?: unknown }).userId;
  if (typeof userId !== "string" || userId.trim().length === 0) {
    return { corrupted: true, detail: "userId manquant ou invalide" };
  }
  if (!UUID_RE.test(userId.trim())) {
    return { corrupted: true, detail: "userId n'est pas un UUID valide" };
  }
  return { corrupted: false };
}

/** Best-effort read when electron-store JSON may be damaged. */
export function safeReadSession(): SessionPayload | null {
  try {
    return readSession();
  } catch {
    return null;
  }
}

async function loadSessionUserSnapshot(
  prisma: PrismaClient,
  userId: string,
): Promise<{ id: string; username: string; isActive: boolean } | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isActive: true },
  });
}

/**
 * Ends the desktop session: audit row is written first (awaited), then session is cleared.
 * Never inserts ActivityLog.userId that is missing from User (stale E2E / restored DB).
 */
export async function performLogout(prisma: PrismaClient): Promise<{ ok: true }> {
  const existing = readSession();
  if (!existing?.userId) {
    persistSession(null);
    return { ok: true };
  }

  const user = await loadSessionUserSnapshot(prisma, existing.userId);
  const audit = buildLogoutAuditPayload(existing.userId, user);

  await prisma.$transaction(async (tx) => {
    await logActivity(tx, audit);
  });

  persistSession(null);
  return { ok: true };
}

/**
 * Drops persisted session when the DB no longer contains the user (e.g. E2E re-seed).
 * Called once at main-process startup before IPC serves traffic.
 */
export async function reconcileStaleSessionAtStartup(prisma: PrismaClient): Promise<void> {
  const existing = readSession();
  if (!existing?.userId) return;

  const user = await loadSessionUserSnapshot(prisma, existing.userId);
  if (user?.isActive) return;

  const audit = buildStaleSessionInvalidationPayload(existing.userId);
  await prisma.$transaction(async (tx) => {
    await logActivity(tx, audit);
  });
  persistSession(null);
}

export async function resolveSessionUser(prisma: PrismaClient) {
  const session = readSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { role: true },
  });
  if (!user?.isActive) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: {
      id: user.role.id,
      name: user.role.name,
      labelFr: user.role.labelFr,
      permissions: user.role.permissions,
    },
  };
}

export function sessionHasPermission(
  permissions: unknown,
  required: string | readonly string[],
): boolean {
  return permissionAllows(permissions, required);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
}

export const DEFAULT_ROLE_DEFINITIONS = [
  {
    name: RoleName.ADMIN,
    labelFr: "Administrateur",
    permissions: ["*"],
  },
  {
    name: RoleName.MANAGER,
    labelFr: "Responsable",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.SETTINGS_READ,
      PERMISSIONS.SETTINGS_WRITE,
      PERMISSIONS.BACKUP_EXPORT,
      PERMISSIONS.BACKUP_RESTORE,
      PERMISSIONS.ACTIVITY_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_WRITE,
      PERMISSIONS.INVENTORY_PURCHASE,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_REPORT,
      PERMISSIONS.PRODUCTION_READ,
      PERMISSIONS.PRODUCTION_WRITE,
      PERMISSIONS.PRODUCTION_EXECUTE,
      PERMISSIONS.PRODUCTION_ADJUST_COST,
      PERMISSIONS.PRODUCTION_REPORT,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_WRITE,
      PERMISSIONS.SALES_VALIDATE,
      PERMISSIONS.SALES_CANCEL,
      PERMISSIONS.SALES_PAYMENT,
      PERMISSIONS.SALES_REPORT,
      PERMISSIONS.HR_READ,
      PERMISSIONS.HR_WRITE,
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.PAYROLL_EXECUTE,
      PERMISSIONS.PAYROLL_ADJUST,
      PERMISSIONS.PAYROLL_REPORT,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.REPORTS_FINANCIAL,
      PERMISSIONS.ANALYTICS_READ,
    ],
  },
  {
    name: RoleName.OPERATOR,
    labelFr: "Opérateur",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_PURCHASE,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.PRODUCTION_READ,
      PERMISSIONS.PRODUCTION_EXECUTE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_WRITE,
      PERMISSIONS.SALES_VALIDATE,
      PERMISSIONS.SALES_PAYMENT,
      PERMISSIONS.HR_READ,
      PERMISSIONS.HR_WRITE,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    name: RoleName.VIEWER,
    labelFr: "Consultation",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.ACTIVITY_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_REPORT,
      PERMISSIONS.PRODUCTION_READ,
      PERMISSIONS.PRODUCTION_REPORT,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_REPORT,
      PERMISSIONS.HR_READ,
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.PAYROLL_REPORT,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.ANALYTICS_READ,
    ],
  },
] as const;

export async function ensureDefaultRoles(
  prisma: PrismaClient | Prisma.TransactionClient,
): Promise<string> {
  let adminRoleId = "";
  for (const role of DEFAULT_ROLE_DEFINITIONS) {
    const row = await prisma.role.upsert({
      where: { name: role.name },
      update: {
        labelFr: role.labelFr,
        permissions: JSON.stringify(role.permissions),
      },
      create: {
        name: role.name,
        labelFr: role.labelFr,
        permissions: JSON.stringify(role.permissions),
      },
    });
    if (role.name === RoleName.ADMIN) adminRoleId = row.id;
  }
  if (!adminRoleId) throw new Error("Rôle administrateur introuvable après initialisation.");
  return adminRoleId;
}

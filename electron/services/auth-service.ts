import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../../shared/permissions.js";
import { RoleName, type Prisma, type PrismaClient } from "../prisma-client.js";
import ElectronStore from "electron-store";

export type SessionPayload = {
  userId: string;
};

type SessionStoreSchema = {
  session: SessionPayload | null;
};

const sessionStore = new ElectronStore<SessionStoreSchema>({
  name: "session",
  defaults: { session: null },
});

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
  sessionStore.set("session", session);
}

export function readSession(): SessionPayload | null {
  return sessionStore.get("session");
}

export async function resolveSessionUser(prisma: PrismaClient) {
  const session = readSession();
  if (!session) return null;
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

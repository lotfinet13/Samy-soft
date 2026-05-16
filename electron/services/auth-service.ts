import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { RoleName } from "@prisma/client";
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

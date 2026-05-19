import { APP_SETTING_KEYS } from "../../shared/settings-keys.js";
import type { PrismaClient } from "../prisma-client.js";
import { ensureDefaultRoles, hashPassword, persistSession, resolveSessionUser } from "./auth-service.js";
import { appendSamyMainLog, appendStructuredEvent } from "./logger-service.js";
import { ensureDefaultSettings } from "./settings-service.js";

export type BootstrapStatus =
  | {
      state: "needs_setup";
      usersCount: number;
      settingsInitialized: boolean;
      reason: string;
    }
  | {
      state: "ready";
      usersCount: number;
      settingsInitialized: boolean;
    };

export type SetupAdminPayload = {
  username: string;
  password: string;
  displayName?: string;
};

export async function getBootstrapStatus(prisma: PrismaClient): Promise<BootstrapStatus> {
  await ensureDefaultSettings(prisma);
  const usersCount = await prisma.user.count();
  const settingsInitialized = await hasRequiredSettings(prisma);
  const state = usersCount === 0 ? "needs_setup" : "ready";
  await logBootstrap("bootstrap-status", { state, usersCount, settingsInitialized });
  if (state === "needs_setup") {
    return {
      state,
      usersCount,
      settingsInitialized,
      reason: "Aucun utilisateur n’existe dans la base locale.",
    };
  }
  return { state, usersCount, settingsInitialized };
}

export async function createInitialAdmin(prisma: PrismaClient, payload: SetupAdminPayload) {
  await logBootstrap("initial-admin-start", { username: payload.username });
  const usersCount = await prisma.user.count();
  await logBootstrap("initial-admin-user-count", { usersCount });
  if (usersCount > 0) {
    await logBootstrap("initial-admin-rejected", { usersCount });
    throw new Error("Initialisation refusée : un compte utilisateur existe déjà.");
  }

  const username = payload.username.trim();
  const password = payload.password;
  const displayName = payload.displayName?.trim() || "Administrateur SAMY SOFT";
  if (!username) throw new Error("Identifiant administrateur requis.");
  if (password.length < 8) throw new Error("Mot de passe administrateur trop court.");

  await logBootstrap("initial-admin-password-hash-start", { username });
  const passwordHash = await hashPassword(password);
  await logBootstrap("initial-admin-password-hash-complete", { username });

  const admin = await prisma.$transaction(async (tx) => {
    await logBootstrap("initial-admin-transaction-start", { username });
    await logBootstrap("initial-admin-settings-start", { username });
    await ensureDefaultSettings(tx);
    await logBootstrap("initial-admin-settings-complete", { username });
    await logBootstrap("initial-admin-roles-start", { username });
    const roleId = await ensureDefaultRoles(tx);
    await logBootstrap("initial-admin-roles-complete", { username, roleId });
    await logBootstrap("initial-admin-user-create-start", { username });
    return tx.user.create({
      data: {
        username,
        passwordHash,
        displayName,
        roleId,
        isActive: true,
      },
      include: { role: true },
    });
  });
  await logBootstrap("initial-admin-transaction-complete", { userId: admin.id, username });

  persistSession({ userId: admin.id });
  await logBootstrap("initial-admin-session-persisted", { userId: admin.id, username });
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.ONBOARDING_WIZARD_DONE },
    update: { value: "false" },
    create: { key: APP_SETTING_KEYS.ONBOARDING_WIZARD_DONE, value: "false" },
  });
  await logBootstrap("initial-admin-onboarding-flag-ready", { userId: admin.id, username });
  await logBootstrap("initial-admin-created", { userId: admin.id, username });

  const user = await resolveSessionUser(prisma);
  if (!user) throw new Error("Administrateur créé, mais session initiale impossible à résoudre.");
  return user;
}

async function hasRequiredSettings(prisma: PrismaClient): Promise<boolean> {
  const requiredKeys = Object.values(APP_SETTING_KEYS);
  const count = await prisma.appSetting.count({
    where: { key: { in: requiredKeys } },
  });
  return count >= requiredKeys.length;
}

async function logBootstrap(event: string, meta: Record<string, unknown>): Promise<void> {
  await Promise.all([
    appendSamyMainLog(`Bootstrap — ${event}`, meta),
    appendStructuredEvent("info", { scope: "bootstrap", event, ...meta }),
  ]);
}

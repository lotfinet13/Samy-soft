import { IPC_CHANNELS } from "@shared/ipc-channels";
import { APP_SETTING_KEYS, type AppSettingKey } from "@shared/settings-keys";
import { samyInvoke } from "@/lib/samy";
import type { PublicBranding } from "@/stores/auth-store";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { SessionUser } from "@/types/session";

export type SessionResponse =
  | { ok: false }
  | { ok: true; user: SessionUser; branding: PublicBranding };

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

let bootstrapStatusCache: BootstrapStatus | null = null;

export function getCachedBootstrapStatus(): BootstrapStatus | null {
  return bootstrapStatusCache;
}

export async function refreshBootstrapStatus(): Promise<BootstrapStatus> {
  const status = await samyInvoke<BootstrapStatus>(IPC_CHANNELS.BOOTSTRAP_STATUS);
  bootstrapStatusCache = status;
  return status;
}

export async function refreshSession(): Promise<void> {
  const bootstrap = await refreshBootstrapStatus();
  if (bootstrap.state === "needs_setup") {
    useAuthStore.getState().setUser(null);
    useAuthStore.getState().setBranding(null);
    useAuthStore.getState().setBootstrapRequired(true);
    useSettingsStore.getState().setSettings(null);
    return;
  }
  useAuthStore.getState().setBootstrapRequired(false);
  const res = await samyInvoke<SessionResponse>(IPC_CHANNELS.AUTH_SESSION);
  if (!res.ok) {
    useAuthStore.getState().setUser(null);
    useAuthStore.getState().setBranding(null);
    useSettingsStore.getState().setSettings(null);
    return;
  }
  useAuthStore.getState().setUser(res.user);
  useAuthStore.getState().setBranding(res.branding);
  await refreshSettingsSilently();
}

export async function refreshSettingsSilently(): Promise<void> {
  try {
    const settings = await samyInvoke<Record<AppSettingKey, string>>(
      IPC_CHANNELS.SETTINGS_GET_ALL,
    );
    useSettingsStore.getState().setSettings(settings);
    useAuthStore.getState().setBranding({
      factoryName: settings[APP_SETTING_KEYS.FACTORY_NAME],
      currencyCode: settings[APP_SETTING_KEYS.CURRENCY_CODE],
      theme: settings[APP_SETTING_KEYS.THEME],
    });
  } catch {
    useSettingsStore.getState().setSettings(null);
  }
}

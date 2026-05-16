import type { AppSettingKey } from "@shared/settings-keys";
import { create } from "zustand";

type SettingsState = {
  settings: Record<AppSettingKey, string> | null;
  setSettings: (value: Record<AppSettingKey, string> | null) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}));

export function applyThemeClass(theme: string): void {
  const root = document.documentElement;
  root.classList.remove("dark");

  if (theme === "dark") {
    root.classList.add("dark");
    return;
  }

  if (theme === "light") {
    return;
  }

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (prefersDark) root.classList.add("dark");
}

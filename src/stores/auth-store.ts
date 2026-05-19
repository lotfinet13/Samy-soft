import { create } from "zustand";
import type { SessionUser } from "@/types/session";

export type PublicBranding = {
  factoryName: string;
  currencyCode: string;
  theme: string;
};

type AuthState = {
  user: SessionUser | null;
  branding: PublicBranding | null;
  hydrated: boolean;
  bootstrapRequired: boolean;
  setUser: (user: SessionUser | null) => void;
  setBranding: (branding: PublicBranding | null) => void;
  setHydrated: (value: boolean) => void;
  setBootstrapRequired: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  branding: null,
  hydrated: false,
  bootstrapRequired: false,
  setUser: (user) => set({ user }),
  setBranding: (branding) => set({ branding }),
  setHydrated: (value) => set({ hydrated: value }),
  setBootstrapRequired: (value) => set({ bootstrapRequired: value }),
}));

import { create } from "zustand";

export type CommandPaletteMode = "nav" | "quick";

type CmdState = {
  open: boolean;
  mode: CommandPaletteMode;
  setOpen: (v: boolean) => void;
  /** Ouvre la palette ; `quick` met l’accent sur les actions opérateur (création / flux). */
  openPalette: (mode?: CommandPaletteMode) => void;
};

export const useCommandPaletteStore = create<CmdState>((set) => ({
  open: false,
  mode: "nav",
  setOpen: (open) => set({ open, ...(!open ? { mode: "nav" as const } : {}) }),
  openPalette: (mode = "nav") => set({ open: true, mode }),
}));

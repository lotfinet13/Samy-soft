import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  message: string;
};

type ToastStore = {
  items: ToastItem[];
  push: (tone: ToastTone, message: string, ttlMs?: number) => string;
  remove: (id: string) => void;
};

export const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  push(tone, message, ttlMs = 4500) {
    const id = crypto.randomUUID();
    set((s) => ({ items: [...s.items, { id, tone, message }] }));
    window.setTimeout(() => {
      get().remove(id);
    }, ttlMs);
    return id;
  },
  remove(id) {
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  },
}));

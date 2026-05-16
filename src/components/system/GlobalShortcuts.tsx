import { type ReactElement, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "@/lib/nav";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { usePermissions } from "@/hooks/usePermissions";

function isTextFieldTarget(target: EventTarget | null): boolean {
  const el =
    target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

/** Raccourcis poste atelier — complément aux formulaires (Ctrl+S) et à la palette. */
export function GlobalShortcuts(): ReactElement | null {
  const setOpenPalette = useCommandPaletteStore((s) => s.setOpen);
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const navigate = useNavigate();
  const { can } = usePermissions();

  useEffect(() => {
    const allowedNav = NAV_ITEMS.filter((entry) =>
      typeof entry.permission === "string" ? can(entry.permission) : false,
    );

    const onKey = (event: KeyboardEvent): void => {
      const k = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && k === "k") {
        event.preventDefault();
        openPalette("nav");
        return;
      }

      if (mod && k === "f") {
        event.preventDefault();
        openPalette("nav");
        return;
      }

      if (mod && event.shiftKey && k === "n") {
        event.preventDefault();
        openPalette("quick");
        return;
      }

      if (event.key === "Escape") {
        if (!useCommandPaletteStore.getState().open) return;
        event.preventDefault();
        setOpenPalette(false);
        return;
      }

      if (
        event.altKey &&
        !mod &&
        !event.shiftKey &&
        /^[1-9]$/.test(event.key) &&
        !isTextFieldTarget(event.target)
      ) {
        const idx = Number(event.key) - 1;
        const item = allowedNav[idx];
        if (item) {
          event.preventDefault();
          navigate(item.to);
        }
        return;
      }

      if (mod && k === "s") {
        const form = document.activeElement?.closest("form");
        if (form instanceof HTMLFormElement) {
          event.preventDefault();
          const btn = Array.from(form.querySelectorAll('button[type="submit"]')).find(
            (b) => b instanceof HTMLElement && !(b as HTMLButtonElement).disabled,
          ) as HTMLButtonElement | undefined;
          btn?.click();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [can, navigate, openPalette, setOpenPalette]);

  return null;
}

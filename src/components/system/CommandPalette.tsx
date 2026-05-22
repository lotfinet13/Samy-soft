import { useEffect, useMemo, useRef, useState, type ReactElement, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "@/lib/nav";
import { QUICK_ACTION_ITEMS } from "@/lib/quick-actions";
import { usePermissions } from "@/hooks/usePermissions";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

type Row = { kind: "nav" | "quick"; label: string; to: string };

export function CommandPalette(): ReactElement | null {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const mode = useCommandPaletteStore((s) => s.mode);
  const { can } = usePermissions();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const initialFocusDoneRef = useRef(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const navRows: Row[] = useMemo(
    () =>
      NAV_ITEMS.filter((entry) =>
        typeof entry.permission === "string" ? can(entry.permission) : false,
      ).map((it) => ({ kind: "nav" as const, label: it.label, to: it.to })),
    [can],
  );

  const quickRows: Row[] = useMemo(
    () =>
      QUICK_ACTION_ITEMS.filter((it) => can(it.permission)).map((it) => ({
        kind: "quick" as const,
        label: it.label,
        to: it.to,
      })),
    [can],
  );

  const orderedRows = useMemo(() => {
    const base = mode === "quick" ? [...quickRows, ...navRows] : [...navRows, ...quickRows];
    return base;
  }, [mode, navRows, quickRows]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedRows;
    return orderedRows.filter((r) => r.label.toLowerCase().includes(q));
  }, [orderedRows, query]);

  useEffect(() => {
    if (!open) {
      initialFocusDoneRef.current = false;
      setQuery("");
      setSelected(0);
      return;
    }
    setSelected(0);
    if (!initialFocusDoneRef.current) {
      initialFocusDoneRef.current = true;
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelected(0);
  }, [mode, open]);

  useEffect(() => {
    setSelected((i) => (rows.length === 0 ? 0 : Math.min(i, rows.length - 1)));
  }, [rows.length]);

  if (!open) return null;

  function go(row: Row): void {
    setOpen(false);
    navigate(row.to);
  }

  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) =>
        rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[selected];
      if (row) go(row);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (rows.length === 0) return;
      setSelected((i) => (e.shiftKey ? (i - 1 + rows.length) % rows.length : (i + 1) % rows.length));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[228] flex items-start justify-center bg-black/35 px-3 py-24"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation et recherche"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="flex max-h-[min(560px,calc(100vh-140px))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface-elevated shadow-2xl"
        onKeyDown={onPanelKeyDown}
      >
        <div className="border-b border-border px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-foreground-muted">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Navigation · Ctrl + K · Ctrl + F · création Ctrl + Shift + N</span>
            <span className="font-mono normal-case text-[10px] text-foreground-muted">
              Alt + 1–9 modules
            </span>
          </div>
        </div>
        <div className="border-b border-border px-3 py-2">
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Filtrer…"
            aria-label="Filtrer la navigation"
            className="focus-ring w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
          />
        </div>
        <div className="overflow-auto p-2">
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-foreground-muted">
              Aucun résultat pour « {query.trim() || "…"} ».
            </p>
          ) : (
            rows.map((row, idx) => (
              <button
                key={`${row.kind}-${row.to}-${row.label}`}
                type="button"
                className={cnRow(selected === idx)}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => go(row)}
              >
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate">{row.label}</span>
                  <span className="truncate text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                    {row.kind === "quick" ? "Flux opérateur" : "Module"} · {row.to}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function cnRow(active: boolean): string {
  return [
    "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold outline-none",
    active
      ? "bg-[color-mix(in_srgb,rgb(var(--color-accent))_14%,transparent)] text-foreground ring-1 ring-border-strong"
      : "text-foreground hover:bg-surface-muted",
  ].join(" ");
}

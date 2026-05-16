import { IPC_CHANNELS } from "@shared/ipc-channels";
import type { LucideIcon } from "lucide-react";
import { Activity, Bell, LineChart, LogOut, Menu, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PERMISSIONS } from "@shared/permissions";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";

export function Topbar() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const user = useAuthStore((state) => state.user);
  const branding = useAuthStore((state) => state.branding);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const factoryName = branding?.factoryName ?? "SAMY SOFT";
  const [now, setNow] = useState(() => Date.now());
  const [dbOk, setDbOk] = useState<boolean | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    setNow(Date.now());
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        await samyInvoke(IPC_CHANNELS.DB_HEALTH);
        if (!cancelled) setDbOk(true);
      } catch {
        if (!cancelled) setDbOk(false);
      }
    }

    void ping();

    const id = window.setInterval(() => void ping(), 120_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const clockLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-DZ", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .format(new Date(now))
        .replaceAll(".", "")
        .replace(/\s+/g, " ")
        .trim(),
    [now],
  );

  return (
    <header className="sticky top-0 z-40 flex h-topbar items-stretch gap-3 border-b border-border bg-surface-elevated px-4 text-[12.5px] text-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <button
          type="button"
          className="focus-ring inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center border border-border bg-surface-muted text-foreground hover:bg-surface"
          onClick={() => toggleSidebar()}
          aria-label="Basculer le menu latéral"
          title="Menu latéral"
        >
          <Menu className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
        </button>

        <div className="min-w-0 border-l border-border pl-4">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            Poste exploitation
          </div>
          <div className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {factoryName}
          </div>
        </div>
      </div>

      <div className="erp-divider-vertical self-center bg-border-strong/60" />

      <div className="hidden shrink-0 items-center gap-2 xl:flex">
        <TopbarChip label="SQLite" tone={dbOk === null ? "muted" : dbOk ? "ok" : "error"} />
        <TopbarChip label="Hors ligne — poste fermé" tone="muted" />
      </div>

      <div className="erp-divider-vertical self-center bg-border-strong/60" />

      <div className="hidden shrink-0 items-center font-mono text-[11.5px] text-foreground-muted lg:flex">
        {clockLabel}
      </div>

      <div className="erp-divider-vertical hidden self-center bg-border-strong/60 lg:block" />

      <div className="flex items-center gap-2">
        <QuickAction
          icon={LineChart}
          label="Journal"
          ariaLabel="Journal d’activité"
          onClick={() => navigate("/rapports")}
        />
        {can(PERMISSIONS.SETTINGS_READ) ? (
          <QuickAction
            icon={Activity}
            label="Santé"
            ariaLabel="Diagnostics système"
            onClick={() => navigate("/diagnostics")}
          />
        ) : null}
        <QuickAction
          icon={Settings}
          label="Régl."
          ariaLabel="Paramètres"
          onClick={() => navigate("/parametres")}
        />

        <button
          type="button"
          className={cn(
            "focus-ring relative inline-flex min-h-touch min-w-touch items-center justify-center border border-border bg-surface-muted text-foreground hover:bg-surface",
          )}
          aria-label="Notifications (vierge)"
          title="Centre de notifications – à brancher Phase 2"
          disabled
        >
          <Bell className="h-[18px] w-[18px] opacity-50" aria-hidden />
          <span className="absolute right-2 top-2 h-4 min-w-[16px] rounded-full bg-surface-muted px-1 text-[9px] font-semibold text-foreground-muted">
            0
          </span>
        </button>
      </div>

      <div className="erp-divider-vertical self-center bg-border-strong/60" />

      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <div className="hidden text-right xl:block">
          <div className="truncate font-semibold text-foreground">{user?.displayName}</div>
          <div className="truncate text-[11px] leading-tight text-foreground-muted">
            {user?.role.labelFr}
          </div>
        </div>
        <button
          type="button"
          className={cn(
            "focus-ring inline-flex min-h-touch items-center gap-2 border border-border bg-surface-muted px-3 font-semibold text-foreground hover:bg-surface xl:px-2",
          )}
          onClick={() => {
            void (async () => {
              await samyInvoke(IPC_CHANNELS.AUTH_LOGOUT);
              useAuthStore.getState().setUser(null);
              useAuthStore.getState().setBranding(null);
              useSettingsStore.getState().setSettings(null);
              navigate("/login", { replace: true });
            })();
          }}
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
          <span className="hidden xl:inline">Déconnexion</span>
        </button>
      </div>
    </header>
  );
}

function TopbarChip(props: { label: string; tone: "ok" | "error" | "muted" }) {
  const dot =
    props.tone === "ok"
      ? "bg-emerald-400"
      : props.tone === "error"
        ? "bg-amber-400"
        : "bg-foreground-muted/70";
  return (
    <span className="inline-flex items-center gap-2 border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-foreground">
      <span className={`h-[7px] w-[7px] rounded-full ring-4 ring-transparent ${dot}`} aria-hidden />
      {props.label}
    </span>
  );
}

function QuickAction(props: {
  icon: LucideIcon;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      className="focus-ring inline-flex min-h-touch items-center gap-1.5 rounded-[var(--erp-radius-panel)] border border-border bg-surface-muted px-2 py-1 font-semibold text-foreground hover:bg-surface"
      onClick={() => props.onClick()}
      aria-label={props.ariaLabel}
      title={props.ariaLabel}
    >
      <Icon className="h-[16px] w-[16px]" aria-hidden />
      <span className="hidden 2xl:inline">{props.label}</span>
    </button>
  );
}

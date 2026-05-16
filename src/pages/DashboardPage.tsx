import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Clock3,
  Factory,
  Layers,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { lazy, memo, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/cn";
import { CACHE_KEYS } from "@/lib/cache-keys";
import { usePermissions } from "@/hooks/usePermissions";
import { samyInvoke } from "@/lib/samy";
import { cacheGetOrSet } from "@/lib/ttl-cache";
import type { ActivityLogDTO, WorkstationInfoDTO } from "@/types/ipc";

const DashboardProductionChart = lazy(() =>
  import("@/pages/dashboard/DashboardProductionChart").then((m) => ({
    default: m.DashboardProductionChart,
  })),
);

const attendancePlaceholder = [
  { label: "Présences pointées", valeur: "—", hint: "Module RH Phase 2" },
  { label: "Équipes actives", valeur: "—", hint: "Affectations atelier" },
  { label: "Congés ouverts", valeur: "0", hint: "Workflow validation" },
];

type InventoryDashSummary = {
  lowStock: Array<{
    sku: string;
    label: string;
    currentQtySerialized: string;
    thresholdSerialized: string;
  }>;
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [activity, setActivity] = useState<ActivityLogDTO[]>([]);
  const [workstation, setWorkstation] = useState<WorkstationInfoDTO | null>(null);
  const [inventoryAlerts, setInventoryAlerts] = useState<
    Array<{ sku: string; label: string; niveau: string; qty: string }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        await samyInvoke(IPC_CHANNELS.DB_HEALTH);
        setDbOk(true);
      } catch {
        setDbOk(false);
      }
    })();
  }, []);

  useEffect(() => {
    void samyInvoke<WorkstationInfoDTO>(IPC_CHANNELS.APP_WORKSTATION_INFO)
      .then(setWorkstation)
      .catch(() => setWorkstation(null));
  }, []);

  useEffect(() => {
    if (!can(PERMISSIONS.INVENTORY_READ)) {
      setInventoryAlerts([]);
      return undefined;
    }

    let cancelled = false;

    async function refreshStockSnapshot(fromCache: boolean) {
      try {
        const summary = fromCache
          ? await cacheGetOrSet(
              CACHE_KEYS.INVENTORY_DASHBOARD_SUMMARY,
              45_000,
              () =>
                samyInvoke<InventoryDashSummary>(IPC_CHANNELS.INVENTORY_DASHBOARD_SUMMARY),
            )
          : await samyInvoke<InventoryDashSummary>(IPC_CHANNELS.INVENTORY_DASHBOARD_SUMMARY);
        const slice = summary.lowStock.slice(0, 8).map((row) => ({
          sku: row.sku,
          label: row.label,
          niveau: `Physique sous seuil (min ${row.thresholdSerialized})`,
          qty: row.currentQtySerialized,
        }));
        if (!cancelled) setInventoryAlerts(slice);
      } catch {
        if (!cancelled) setInventoryAlerts([]);
      }
    }

    void refreshStockSnapshot(true);
    const stockTimer = window.setInterval(() => void refreshStockSnapshot(false), 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(stockTimer);
    };
  }, [can]);

  useEffect(() => {
    if (!can(PERMISSIONS.ACTIVITY_READ)) {
      setActivity([]);
      return undefined;
    }

    let cancelled = false;

    async function refresh() {
      try {
        const rows = await samyInvoke<ActivityLogDTO[]>(IPC_CHANNELS.ACTIVITY_LIST);
        if (!cancelled) setActivity(rows.slice(0, 10));
      } catch {
        if (!cancelled) setActivity([]);
      }
    }

    void refresh();
    const id = window.setInterval(() => void refresh(), 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [can]);

  const activityRows = useMemo(() => {
    return activity.map((row) => ({
      id: row.id,
      when: new Intl.DateTimeFormat("fr-DZ", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(row.createdAt)),
      user: row.user?.displayName ?? "—",
      action: row.action,
      entity: `${row.entityType}${row.entityId ? ` · ${row.entityId}` : ""}`,
    }));
  }, [activity]);

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard-page">
      <PageHeader
        title="Centre des opérations"
        subtitle="Pilotage fabrication, stocks et présences locaux — poste fermé hors cloud."
        actions={
          <div className="flex flex-wrap gap-2">
            <ShortcutButton icon={Boxes} label="Stock" onClick={() => navigate("/inventaire/tableau-de-bord")} />
            <ShortcutButton
              icon={Factory}
              label="Production"
              onClick={() => navigate("/production")}
            />
            <ShortcutButton icon={Wallet} label="Paie" onClick={() => navigate("/paie")} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard
          label="SQLite — santé locale"
          value={dbOk === null ? "…" : dbOk ? "Stable" : "Incident"}
          hint="Heartbeat IPC depuis le tableau de bord"
          tone={dbOk === false ? "warning" : dbOk ? "positive" : "default"}
        />
        <StatCard label="Lots produits jour" value="—" hint="Branches Production Phase 2" />
        <StatCard label="OEE équipe jour" value="—" hint="Indicateurs atelier temps réel" />
        <StatCard label="Incident qualité ouvert" value="0" hint="À relier ligne contrôle Phase 3" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_minmax(0,1fr)]">
        <Suspense
          fallback={
            <div className="flex h-[320px] animate-pulse flex-col justify-center rounded border border-border bg-surface-elevated px-6 text-center text-[12px] font-semibold text-foreground-muted">
              Chargement du graphique…
            </div>
          }
        >
          <DashboardProductionChart />
        </Suspense>

        <div className="flex flex-col gap-4">
          <OperationalPanel
            title="Alertes stock & ruptures"
            icon={AlertTriangle}
            eyebrow={can(PERMISSIONS.INVENTORY_READ) ? undefined : "Droits insuffisants"}
          >
            {can(PERMISSIONS.INVENTORY_READ) ? (
              inventoryAlerts.length ? (
                <div className="flex flex-col gap-3">
                  <table className="w-full border-collapse text-left text-[12px]">
                    <thead className="text-[10.5px] font-semibold uppercase tracking-wide text-foreground-muted">
                      <tr className="border-b border-border">
                        <th className="pb-2 pr-2 font-semibold">SKU</th>
                        <th className="pb-2 pr-2 font-semibold">Diagnostic</th>
                        <th className="pb-2 text-right font-semibold">Qté physique</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      {inventoryAlerts.map((alert) => (
                        <tr key={alert.sku} className="border-b border-border/70 last:border-0">
                          <td className="py-2 pr-3 font-mono">{alert.sku}</td>
                          <td className="py-2 pr-3 leading-snug">
                            <div className="font-semibold text-foreground">{alert.label}</div>
                            <div className="text-[11px] text-foreground-muted">{alert.niveau}</div>
                          </td>
                          <td className="py-2 text-right font-mono text-danger">{alert.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    className="focus-ring self-end text-[11px] font-semibold text-accent hover:underline"
                    onClick={() => navigate("/inventaire/tableau-de-bord")}
                  >
                    Ouvrir le pilotage stocks <ArrowRight className="inline h-3 w-3 align-text-bottom" aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-3 text-[12px] text-foreground-muted">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-accent" aria-hidden />
                  Aucun article sous seuil détecté sur ce poste.
                </div>
              )
            ) : (
              <div className="flex items-start gap-3 border border-border bg-surface-muted/60 px-3 py-2 text-[12px] leading-snug text-foreground-muted">
                <ShieldCheck className="mt-1 h-4 w-4 text-accent" aria-hidden />
                <span>
                  Accordez la permission lecture inventaire (<code className="font-mono text-[11px] text-foreground">inventory.read</code>) pour
                  afficher les alertes critiques en direct depuis le tableau de bord général.
                </span>
              </div>
            )}
          </OperationalPanel>

          <OperationalPanel title="Présence & équipes" icon={Users}>
            <div className="grid gap-3 sm:grid-cols-3">
              {attendancePlaceholder.map((tile) => (
                <div
                  key={tile.label}
                  className="border border-border bg-surface-muted/60 px-3 py-2 text-[12px] leading-snug"
                >
                  <div className="text-[11px] font-semibold text-foreground">{tile.label}</div>
                  <div className="mt-1 font-mono text-[15px] text-foreground">{tile.valeur}</div>
                  <div className="mt-1 text-[11px] text-foreground-muted">{tile.hint}</div>
                </div>
              ))}
            </div>
          </OperationalPanel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <OperationalPanel
          title="Journal opérationnel"
          icon={Activity}
          eyebrow={can(PERMISSIONS.ACTIVITY_READ) ? undefined : "Droits insuffisants"}
        >
          {can(PERMISSIONS.ACTIVITY_READ) ? (
            activityRows.length ? (
              <div className="-mx-1 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-[11.8px]">
                  <thead className="sticky top-0 bg-surface-muted/65 text-[10.5px] font-semibold uppercase tracking-wide text-foreground-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pl-3 pr-3 font-semibold">Horodatage</th>
                      <th className="py-2 pr-3 font-semibold">Agent</th>
                      <th className="py-2 pr-3 font-semibold">Action</th>
                      <th className="py-2 pr-3 font-semibold">Entité</th>
                      <th className="py-2 pr-3 text-right font-semibold">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    {activityRows.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-border/70 last:border-0 hover:bg-surface-muted/55"
                      >
                        <td className="py-2 pl-3 pr-4 font-mono text-[11.5px] text-foreground-muted">
                          {entry.when}
                        </td>
                        <td className="py-2 pr-3 font-semibold">{entry.user}</td>
                        <td className="py-2 pr-3">{entry.action}</td>
                        <td className="py-2 pr-3 leading-snug text-foreground-muted">{entry.entity}</td>
                        <td className="py-2 pr-3 text-right">
                          <button
                            type="button"
                            className="focus-ring inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                            onClick={() => navigate("/rapports")}
                          >
                            Détail <ArrowRight className="h-3 w-3" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-start gap-3 text-[12px] text-foreground-muted">
                <Clock3 className="mt-0.5 h-4 w-4 text-foreground-muted" />
                En attente d’entrées métier&nbsp;: aucune action horodatée pour le moment.
              </div>
            )
          ) : (
            <div className="flex items-start gap-3 border border-border bg-surface-muted/60 px-3 py-2 text-[12px]">
              <ShieldCheck className="mt-1 h-4 w-4 text-accent" aria-hidden />
              <span className="text-foreground-muted">
                Accordez la permission lecture du journal (
                <code className="font-mono text-[11px] text-foreground">activity.read</code>) pour suivre les
                opérations sensibles depuis ce tableau opérationnel.
              </span>
            </div>
          )}
        </OperationalPanel>

        <OperationalPanel title="Pilotage système" icon={RefreshCw}>
          <dl className="space-y-3 text-[12px]">
            <div className="border border-border px-3 py-2">
              <dt className="text-[11px] font-semibold text-foreground-muted">Poste</dt>
              <dd className="mt-1 font-mono">{workstation?.hostname ?? "—"}</dd>
            </div>
            <div className="border border-border px-3 py-2">
              <dt className="text-[11px] font-semibold text-foreground-muted">Version Electron</dt>
              <dd className="mt-1 font-mono">{workstation?.version ?? "—"}</dd>
              <div className="mt-2 text-[11px] leading-snug text-foreground-muted">
                Plateforme {workstation?.platform ?? "—"} · mise à niveau via flux interne DSI.
              </div>
            </div>
          </dl>
          <div className="mt-4 space-y-2 text-[11.5px] text-foreground-muted">
            <p className="flex items-start gap-2">
              <Layers className="mt-[2px] h-4 w-4 text-accent" aria-hidden />
              État sécurité renderer&nbsp;: preload typé isolé sans Node direct.
            </p>
          </div>
        </OperationalPanel>
      </div>
    </div>
  );
}

const OperationalPanel = memo(function OperationalPanel(props: {
  title: string;
  icon: LucideIcon;
  eyebrow?: string;
  children: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section className="border border-border bg-surface-elevated shadow-inner">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} aria-hidden />
          <div className="truncate text-[12.5px] font-semibold text-foreground">{props.title}</div>
        </div>
        {props.eyebrow ? (
          <span className="text-[11px] font-semibold text-foreground-muted">{props.eyebrow}</span>
        ) : null}
      </header>
      <div className="p-4">{props.children}</div>
    </section>
  );
});

function ShortcutButton(props: { icon: LucideIcon; label: string; onClick: () => void }) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      className={cn(
        "focus-ring inline-flex min-h-touch items-center gap-2 rounded-[var(--erp-radius-panel)] border border-border bg-surface-muted px-3 text-[11.5px] font-semibold text-foreground hover:bg-surface",
      )}
      onClick={() => props.onClick()}
    >
      <Icon className="h-[15px] w-[15px]" aria-hidden />
      {props.label}
    </button>
  );
}

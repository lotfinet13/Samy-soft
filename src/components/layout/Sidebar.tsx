import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { NAV_ITEMS } from "@/lib/nav";
import { samyInvoke } from "@/lib/samy";
import { useUiStore } from "@/stores/ui-store";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const location = useLocation();
  const { can } = usePermissions();
  const [inventoryBadge, setInventoryBadge] = useState(0);
  const [salesBadge, setSalesBadge] = useState(0);

  useEffect(() => {
    if (!can(PERMISSIONS.INVENTORY_READ)) {
      setInventoryBadge(0);
      return undefined;
    }

    let cancelled = false;

    async function refreshCounts(): Promise<void> {
      try {
        const counters = await samyInvoke<{ lowStock: number; expiringLines: number }>(
          IPC_CHANNELS.INVENTORY_NAV_COUNTS,
        );
        if (!cancelled) setInventoryBadge(Math.max(0, counters.lowStock) + Math.max(0, counters.expiringLines));
      } catch {
        if (!cancelled) setInventoryBadge(0);
      }
    }

    void refreshCounts();
    const heartbeat = window.setInterval(() => void refreshCounts(), 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
    };
  }, [can]);

  useEffect(() => {
    if (!can(PERMISSIONS.SALES_READ)) {
      setSalesBadge(0);
      return undefined;
    }

    let cancelled = false;

    async function refreshSales(): Promise<void> {
      try {
        const counters = await samyInvoke<{ unpaid: number; drafts: number }>(IPC_CHANNELS.SALES_NAV_COUNTS);
        if (!cancelled) setSalesBadge(Math.max(0, counters.unpaid) + Math.max(0, counters.drafts));
      } catch {
        if (!cancelled) setSalesBadge(0);
      }
    }

    void refreshSales();
    const heartbeat = window.setInterval(() => void refreshSales(), 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
    };
  }, [can]);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg text-sidebar-fg transition-[width] duration-150",
        collapsed ? "w-[72px]" : "w-sidebar",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b border-sidebar-border px-3 py-3",
          collapsed ? "justify-center" : "",
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-sidebar-border bg-sidebar-muted text-[11px] font-black tracking-tight text-sidebar-accent">
          SS
        </div>
        {!collapsed ? (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-sidebar-fg">SAMY SOFT</div>
            <div className="truncate text-[11px] text-sidebar-fg-muted">ERP — poste usine</div>
          </div>
        ) : null}
      </div>

      <nav
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3"
        aria-label="Modules"
      >
        {NAV_ITEMS.filter((item) => can(item.permission)).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => {
                const pathActive =
                  item.activePathPrefix != null ? location.pathname.startsWith(item.activePathPrefix) : isActive;
                return cn(
                  "focus-ring group flex min-h-touch items-center gap-3 border border-transparent px-2 text-[12.5px] font-semibold transition-colors",
                  collapsed ? "justify-center px-0" : "",
                  pathActive
                    ? "border-sidebar-border bg-sidebar-muted text-sidebar-fg shadow-[inset_3px_0_0_rgb(var(--color-sidebar-accent))]"
                    : "text-sidebar-fg-muted hover:bg-sidebar-muted/70 hover:text-sidebar-fg",
                );
              }}
              title={
                collapsed
                  ? `${item.label}${
                      item.activePathPrefix === "/inventaire" && inventoryBadge > 0
                        ? ` · alertes ${inventoryBadge > 99 ? "99+" : inventoryBadge}`
                        : ""
                    }${
                      item.activePathPrefix === "/ventes" && salesBadge > 0
                        ? ` · ventes ${salesBadge > 99 ? "99+" : salesBadge}`
                        : ""
                    }`
                  : undefined
              }
              end={item.to === "/" && !item.activePathPrefix}
            >
              <Icon
                className="h-[18px] w-[18px] shrink-0 opacity-90 group-hover:opacity-100"
                strokeWidth={2}
                aria-hidden
              />
              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.activePathPrefix === "/inventaire" && inventoryBadge > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {inventoryBadge > 99 ? "99+" : inventoryBadge}
                    </span>
                  ) : null}
                  {item.activePathPrefix === "/ventes" && salesBadge > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">
                      {salesBadge > 99 ? "99+" : salesBadge}
                    </span>
                  ) : null}
                </>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <footer className="border-t border-sidebar-border px-3 py-2 text-[10px] leading-tight text-sidebar-fg-muted">
        {!collapsed ? (
          <>
            <div>Navigation modules · poste fermé</div>
            <div className="mt-1 font-mono text-[9.5px] text-sidebar-fg-muted/80">
              Réduit via barre supérieure
            </div>
          </>
        ) : (
          <div className="text-center font-mono text-[9px] opacity-75">⋯</div>
        )}
      </footer>
    </aside>
  );
}

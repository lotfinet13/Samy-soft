import { PERMISSIONS } from "@shared/permissions";
import { BarChart3, Landmark, PieChart, ScrollText, LayoutGrid } from "lucide-react";
import { NavLink, Navigate, Outlet } from "react-router-dom";

import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/cn";

const NAV = [
  { to: "/rapports", end: true, label: "Centre", icon: LayoutGrid, perm: PERMISSIONS.REPORTS_READ },
  {
    to: "/rapports/analytics",
    label: "Analytiques",
    icon: PieChart,
    perm: PERMISSIONS.ANALYTICS_READ,
  },
  {
    to: "/rapports/rentabilite",
    label: "Rentabilité",
    icon: BarChart3,
    perm: PERMISSIONS.REPORTS_FINANCIAL,
  },
  {
    to: "/rapports/finance-dir",
    label: "Synthèse direction",
    icon: Landmark,
    perm: PERMISSIONS.REPORTS_FINANCIAL,
  },
  {
    to: "/rapports/journal",
    label: "Journal audit",
    icon: ScrollText,
    perm: PERMISSIONS.ACTIVITY_READ,
  },
];

export function ReportingLayout() {
  const { can } = usePermissions();

  if (!can(PERMISSIONS.REPORTS_READ)) {
    return <Navigate to="/" replace />;
  }

  const items = NAV.filter((n) => can(n.perm));

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="erp-panel shrink-0 p-3">
        <div className="text-[13px] font-semibold uppercase tracking-wide text-foreground-muted">
          Command center — analyse & impressions
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end === true}
              className={({ isActive }) =>
                cn(
                  "focus-ring inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[12px] font-semibold",
                  isActive
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-surface-muted text-foreground-muted hover:bg-surface",
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden strokeWidth={2.25} />
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-8">
        <Outlet />
      </div>
    </div>
  );
}

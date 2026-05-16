import { PERMISSIONS } from "@shared/permissions";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

const SUB_LINKS: Array<{ to: string; label: string; perm: string }> = [
  { to: "/rh/tableau-de-bord", label: "Centre RH", perm: PERMISSIONS.HR_READ },
  { to: "/rh/effectifs", label: "Effectifs", perm: PERMISSIONS.HR_READ },
  { to: "/rh/presence/jour", label: "Présence jour", perm: PERMISSIONS.HR_READ },
  { to: "/rh/presence/calendrier", label: "Calendrier", perm: PERMISSIONS.HR_READ },
  { to: "/rh/equipes", label: "Équipes / shifts", perm: PERMISSIONS.HR_READ },
  { to: "/rh/paie/cycles", label: "Cycles paie", perm: PERMISSIONS.PAYROLL_READ },
  { to: "/rh/paie/avances", label: "Avances", perm: PERMISSIONS.PAYROLL_READ },
  { to: "/rh/rapports", label: "Rapports", perm: PERMISSIONS.PAYROLL_REPORT },
];

export function HrLayout() {
  const { can } = usePermissions();
  const location = useLocation();

  if (!can(PERMISSIONS.HR_READ) && !can(PERMISSIONS.PAYROLL_READ)) {
    return <Navigate to="/" replace />;
  }

  const visibleLinks = SUB_LINKS.filter((link) => can(link.perm));

  return (
    <div className="flex min-h-[540px] flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 border border-border bg-surface-muted/40 lg:w-[210px]">
        <nav className="flex flex-wrap gap-1 p-2 lg:flex-col" aria-label="Sous-navigation RH">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={() =>
                cn(
                  "rounded-[var(--erp-radius-panel)] border border-transparent px-2 py-1.5 text-[12px] font-semibold",
                  location.pathname.startsWith(link.to)
                    ? "border-border bg-surface text-foreground"
                    : "text-foreground-muted hover:bg-surface-elevated",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

import { PERMISSIONS } from "@shared/permissions";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/production/centre", label: "Centre", perm: PERMISSIONS.PRODUCTION_READ },
  { to: "/production/recettes", label: "Recettes", perm: PERMISSIONS.PRODUCTION_READ },
  { to: "/production/lots", label: "Lots", perm: PERMISSIONS.PRODUCTION_READ },
  { to: "/production/mélangeurs", label: "Mélangeurs", perm: PERMISSIONS.PRODUCTION_READ },
  { to: "/production/déchets", label: "Déchets", perm: PERMISSIONS.PRODUCTION_EXECUTE },
  { to: "/production/rapports", label: "Rapports CSV", perm: PERMISSIONS.PRODUCTION_REPORT },
];

export function ProductionLayout() {
  const { can } = usePermissions();
  const location = useLocation();

  if (!can(PERMISSIONS.PRODUCTION_READ)) {
    return <Navigate to="/" replace />;
  }

  const links = LINKS.filter((entry) => can(entry.perm));

  return (
    <div className="flex min-h-[560px] flex-col gap-3 lg:flex-row">
      <aside className="w-full shrink-0 border border-border bg-surface-muted/40 lg:w-[210px]">
        <nav className="flex flex-wrap gap-1 p-2 lg:flex-col" aria-label="Flux production SAMY SOFT">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={() =>
                cn(
                  "rounded-[var(--erp-radius-panel)] border px-2 py-1 text-[11.5px] font-semibold",
                  location.pathname.startsWith(link.to)
                    ? "border-border bg-surface text-foreground"
                    : "border-transparent text-foreground-muted hover:bg-surface-elevated",
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

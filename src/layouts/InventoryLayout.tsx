import { PERMISSIONS } from "@shared/permissions";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

const SUB_LINKS: Array<{ to: string; label: string; perm: string }> = [
  { to: "/inventaire/tableau-de-bord", label: "Tableau", perm: PERMISSIONS.INVENTORY_READ },
  { to: "/inventaire/matières", label: "Matières", perm: PERMISSIONS.INVENTORY_READ },
  { to: "/inventaire/emballages", label: "Emballages", perm: PERMISSIONS.INVENTORY_READ },
  { to: "/inventaire/fournisseurs", label: "Fournisseurs", perm: PERMISSIONS.INVENTORY_READ },
  { to: "/inventaire/achats", label: "Achats", perm: PERMISSIONS.INVENTORY_PURCHASE },
  { to: "/inventaire/mouvements", label: "Mouvements", perm: PERMISSIONS.INVENTORY_READ },
  { to: "/inventaire/rapports", label: "Rapports", perm: PERMISSIONS.INVENTORY_REPORT },
];

export function InventoryLayout() {
  const { can } = usePermissions();
  const location = useLocation();

  if (!can(PERMISSIONS.INVENTORY_READ)) {
    return <Navigate to="/" replace />;
  }

  const visibleLinks = SUB_LINKS.filter((link) => can(link.perm));

  return (
    <div className="flex min-h-[540px] flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 border border-border bg-surface-muted/40 lg:w-[200px]">
        <nav className="flex flex-wrap gap-1 p-2 lg:flex-col" aria-label="Sous-navigation inventaire">
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

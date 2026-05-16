import { PERMISSIONS } from "@shared/permissions";
import type { LucideIcon } from "lucide-react";
import { Boxes, ClipboardList, Factory, LayoutDashboard, LineChart, Settings, Truck, Users } from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  permission: string;
  /** Assure la surbrillance pour les sous-routes HashRouter (`/inventaire/...`). */
  activePathPrefix?: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Tableau de bord",
    to: "/",
    icon: LayoutDashboard,
    permission: PERMISSIONS.DASHBOARD_READ,
  },
  {
    label: "Inventaire",
    to: "/inventaire/tableau-de-bord",
    icon: Boxes,
    permission: PERMISSIONS.INVENTORY_READ,
    activePathPrefix: "/inventaire",
  },
  {
    label: "Production",
    to: "/production/centre",
    icon: Factory,
    permission: PERMISSIONS.PRODUCTION_READ,
    activePathPrefix: "/production",
  },
  {
    label: "Ventes",
    to: "/ventes/tableau-de-bord",
    icon: Truck,
    permission: PERMISSIONS.SALES_READ,
    activePathPrefix: "/ventes",
  },
  {
    label: "RH & Paie",
    to: "/rh/tableau-de-bord",
    icon: Users,
    permission: PERMISSIONS.HR_READ,
    activePathPrefix: "/rh",
  },
  {
    label: "Rapports",
    to: "/rapports",
    icon: LineChart,
    permission: PERMISSIONS.REPORTS_READ,
    activePathPrefix: "/rapports",
  },
  {
    label: "Qualité interne",
    to: "/interne/qualite",
    icon: ClipboardList,
    permission: PERMISSIONS.SETTINGS_READ,
  },
  {
    label: "Paramètres",
    to: "/parametres",
    icon: Settings,
    permission: PERMISSIONS.SETTINGS_READ,
  },
];

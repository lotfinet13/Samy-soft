import { PERMISSIONS } from "@shared/permissions";

export type QuickActionItem = {
  label: string;
  to: string;
  /** Permission minimale pour afficher l’action. */
  permission: string;
};

/** Accès opérateur — regroupé dans la palette (Ctrl+K / Ctrl+Shift+N). */
export const QUICK_ACTION_ITEMS: QuickActionItem[] = [
  {
    label: "Nouvel achat fournisseur",
    to: "/inventaire/achats",
    permission: PERMISSIONS.INVENTORY_PURCHASE,
  },
  {
    label: "Mouvements & ajustements stock",
    to: "/inventaire/mouvements",
    permission: PERMISSIONS.INVENTORY_ADJUST,
  },
  {
    label: "Nouveau lot de production",
    to: "/production/lots",
    permission: PERMISSIONS.PRODUCTION_WRITE,
  },
  {
    label: "Factures & brouillons",
    to: "/ventes/factures",
    permission: PERMISSIONS.SALES_WRITE,
  },
  {
    label: "Présence du jour",
    to: "/rh/presence/jour",
    permission: PERMISSIONS.HR_WRITE,
  },
  {
    label: "Cycle de paie",
    to: "/rh/paie/cycles",
    permission: PERMISSIONS.PAYROLL_EXECUTE,
  },
];

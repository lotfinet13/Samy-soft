import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppErrorBoundary } from "@/components/system/AppErrorBoundary";
import { ThemeSync } from "@/components/system/ThemeSync";
import { AppShell } from "@/layouts/AppShell";
import { InventoryLayout } from "@/layouts/InventoryLayout";
import { ProtectedRoute } from "@/layouts/ProtectedRoute";
import { refreshSession } from "@/lib/bootstrap";
import { LoginPage } from "@/pages/LoginPage";
import { SetupPage } from "@/pages/SetupPage";
import {
  DashboardPage,
  HrAdvancesPage,
  HrAttendanceCalendarPage,
  HrAttendanceDayPage,
  HrDashboardPage,
  HrPayrollCyclesPage,
  HrReportsPage,
  HrShiftsPage,
  HrWorkerProfilePage,
  HrWorkersPage,
  InventoryDashboardPage,
  InventoryMaterialsPage,
  InventoryMovementsPage,
  InventoryPurchasesPage,
  InventoryReportsPage,
  InventorySuppliersPage,
  ProductionBatchesPage,
  ProductionDashboardPage,
  ProductionMixerPage,
  ProductionRecipesPage,
  ProductionReportsPage,
  ProductionWastePage,
  QaDashboardPage,
  ReportingAnalyticsPage,
  ReportingCenterPage,
  ReportingFinancialSummaryPage,
  ReportingJournalPage,
  ReportingProfitabilityPage,
  SalesCustomerProfilePage,
  SalesCustomersPage,
  SalesDashboardPage,
  SalesInvoiceDetailPage,
  SalesInvoicesPage,
  SalesProductsPage,
  SalesReportsPage,
  SettingsPage,
  SystemHealthPage,
} from "@/pages/lazy-pages";
import { ProductionLayout } from "@/layouts/ProductionLayout";
import { ReportingLayout } from "@/layouts/ReportingLayout";
import { HrLayout } from "@/layouts/HrLayout";
import { SalesLayout } from "@/layouts/SalesLayout";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";

export function App() {
  const setHydrated = useAuthStore((state) => state.setHydrated);

  useEffect(() => {
    void (async () => {
      try {
        await refreshSession();
      } finally {
        setHydrated(true);
      }
    })();
  }, [setHydrated]);

  return (
    <HashRouter>
      <ThemeSync />
      <AppErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="/inventaire" element={<InventoryLayout />}>
                <Route index element={<Navigate to="/inventaire/tableau-de-bord" replace />} />
                <Route path="tableau-de-bord" element={<InventoryDashboardPage />} />
                <Route path="matières" element={<InventoryMaterialsPage mode="RAW" />} />
                <Route path="emballages" element={<InventoryMaterialsPage mode="PACKAGING" />} />
                <Route path="fournisseurs" element={<InventorySuppliersPage />} />
                <Route path="achats" element={<InventoryPurchasesPage />} />
                <Route path="mouvements" element={<InventoryMovementsPage />} />
                <Route path="rapports" element={<InventoryReportsPage />} />
              </Route>
              <Route path="/production" element={<ProductionLayout />}>
                <Route index element={<Navigate to="/production/centre" replace />} />
                <Route path="centre" element={<ProductionDashboardPage />} />
                <Route path="recettes" element={<ProductionRecipesPage />} />
                <Route path="lots" element={<ProductionBatchesPage />} />
                <Route path="mélangeurs" element={<ProductionMixerPage />} />
                <Route path="déchets" element={<ProductionWastePage />} />
                <Route path="rapports" element={<ProductionReportsPage />} />
              </Route>
              <Route path="/ventes" element={<SalesLayout />}>
                <Route index element={<Navigate to="/ventes/tableau-de-bord" replace />} />
                <Route path="tableau-de-bord" element={<SalesDashboardPage />} />
                <Route path="clients" element={<SalesCustomersPage />} />
                <Route path="clients/:customerId" element={<SalesCustomerProfilePage />} />
                <Route path="produits" element={<SalesProductsPage />} />
                <Route path="factures" element={<SalesInvoicesPage />} />
                <Route path="factures/:invoiceId" element={<SalesInvoiceDetailPage />} />
                <Route path="rapports" element={<SalesReportsPage />} />
              </Route>
              <Route path="/rh" element={<HrLayout />}>
                <Route index element={<Navigate to="/rh/tableau-de-bord" replace />} />
                <Route path="tableau-de-bord" element={<HrDashboardPage />} />
                <Route path="effectifs" element={<HrWorkersPage />} />
                <Route path="effectifs/:workerId" element={<HrWorkerProfilePage />} />
                <Route path="presence/jour" element={<HrAttendanceDayPage />} />
                <Route path="presence/calendrier" element={<HrAttendanceCalendarPage />} />
                <Route path="equipes" element={<HrShiftsPage />} />
                <Route path="paie/cycles" element={<HrPayrollCyclesPage />} />
                <Route path="paie/avances" element={<HrAdvancesPage />} />
                <Route path="rapports" element={<HrReportsPage />} />
              </Route>
              <Route path="/employes" element={<Navigate to="/rh/effectifs" replace />} />
              <Route path="/paie" element={<Navigate to="/rh/paie/cycles" replace />} />
              <Route path="/rapports" element={<ReportingLayout />}>
                <Route index element={<ReportingCenterPage />} />
                <Route path="analytics" element={<ReportingAnalyticsPage />} />
                <Route path="rentabilite" element={<ReportingProfitabilityPage />} />
                <Route path="finance-dir" element={<ReportingFinancialSummaryPage />} />
                <Route path="journal" element={<ReportingJournalPage />} />
              </Route>
              <Route path="/parametres" element={<SettingsPage />} />
              <Route path="/interne/qualite" element={<QaDashboardPage />} />
              <Route path="/diagnostics" element={<SystemHealthPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppErrorBoundary>
    </HashRouter>
  );
}

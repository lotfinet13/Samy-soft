import { lazy } from "react";

export const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

export const InventoryDashboardPage = lazy(() =>
  import("@/pages/inventory/InventoryDashboardPage").then((m) => ({
    default: m.InventoryDashboardPage,
  })),
);
export const InventoryMaterialsPage = lazy(() =>
  import("@/pages/inventory/InventoryMaterialsPage").then((m) => ({
    default: m.InventoryMaterialsPage,
  })),
);
export const InventoryMovementsPage = lazy(() =>
  import("@/pages/inventory/InventoryMovementsPage").then((m) => ({
    default: m.InventoryMovementsPage,
  })),
);
export const InventoryPurchasesPage = lazy(() =>
  import("@/pages/inventory/InventoryPurchasesPage").then((m) => ({
    default: m.InventoryPurchasesPage,
  })),
);
export const InventoryReportsPage = lazy(() =>
  import("@/pages/inventory/InventoryReportsPage").then((m) => ({
    default: m.InventoryReportsPage,
  })),
);
export const InventorySuppliersPage = lazy(() =>
  import("@/pages/inventory/InventorySuppliersPage").then((m) => ({
    default: m.InventorySuppliersPage,
  })),
);

export const ProductionDashboardPage = lazy(() =>
  import("@/pages/production/ProductionDashboardPage").then((m) => ({
    default: m.ProductionDashboardPage,
  })),
);
export const ProductionRecipesPage = lazy(() =>
  import("@/pages/production/ProductionRecipesPage").then((m) => ({
    default: m.ProductionRecipesPage,
  })),
);
export const ProductionBatchesPage = lazy(() =>
  import("@/pages/production/ProductionBatchesPage").then((m) => ({
    default: m.ProductionBatchesPage,
  })),
);
export const ProductionMixerPage = lazy(() =>
  import("@/pages/production/ProductionMixerPage").then((m) => ({
    default: m.ProductionMixerPage,
  })),
);
export const ProductionWastePage = lazy(() =>
  import("@/pages/production/ProductionWastePage").then((m) => ({
    default: m.ProductionWastePage,
  })),
);
export const ProductionReportsPage = lazy(() =>
  import("@/pages/production/ProductionReportsPage").then((m) => ({
    default: m.ProductionReportsPage,
  })),
);

export const SalesDashboardPage = lazy(() =>
  import("@/pages/sales/SalesDashboardPage").then((m) => ({ default: m.SalesDashboardPage })),
);
export const SalesCustomersPage = lazy(() =>
  import("@/pages/sales/SalesCustomersPage").then((m) => ({ default: m.SalesCustomersPage })),
);
export const SalesCustomerProfilePage = lazy(() =>
  import("@/pages/sales/SalesCustomerProfilePage").then((m) => ({
    default: m.SalesCustomerProfilePage,
  })),
);
export const SalesProductsPage = lazy(() =>
  import("@/pages/sales/SalesProductsPage").then((m) => ({ default: m.SalesProductsPage })),
);
export const SalesInvoicesPage = lazy(() =>
  import("@/pages/sales/SalesInvoicesPage").then((m) => ({ default: m.SalesInvoicesPage })),
);
export const SalesInvoiceDetailPage = lazy(() =>
  import("@/pages/sales/SalesInvoiceDetailPage").then((m) => ({
    default: m.SalesInvoiceDetailPage,
  })),
);
export const SalesReportsPage = lazy(() =>
  import("@/pages/sales/SalesReportsPage").then((m) => ({ default: m.SalesReportsPage })),
);

export const HrDashboardPage = lazy(() =>
  import("@/pages/hr/HrDashboardPage").then((m) => ({ default: m.HrDashboardPage })),
);
export const HrWorkersPage = lazy(() =>
  import("@/pages/hr/HrWorkersPage").then((m) => ({ default: m.HrWorkersPage })),
);
export const HrWorkerProfilePage = lazy(() =>
  import("@/pages/hr/HrWorkerProfilePage").then((m) => ({ default: m.HrWorkerProfilePage })),
);
export const HrAttendanceDayPage = lazy(() =>
  import("@/pages/hr/HrAttendanceDayPage").then((m) => ({ default: m.HrAttendanceDayPage })),
);
export const HrAttendanceCalendarPage = lazy(() =>
  import("@/pages/hr/HrAttendanceCalendarPage").then((m) => ({
    default: m.HrAttendanceCalendarPage,
  })),
);
export const HrShiftsPage = lazy(() =>
  import("@/pages/hr/HrShiftsPage").then((m) => ({ default: m.HrShiftsPage })),
);
export const HrPayrollCyclesPage = lazy(() =>
  import("@/pages/hr/HrPayrollCyclesPage").then((m) => ({ default: m.HrPayrollCyclesPage })),
);
export const HrAdvancesPage = lazy(() =>
  import("@/pages/hr/HrAdvancesPage").then((m) => ({ default: m.HrAdvancesPage })),
);
export const HrReportsPage = lazy(() =>
  import("@/pages/hr/HrReportsPage").then((m) => ({ default: m.HrReportsPage })),
);

export const ReportingCenterPage = lazy(() =>
  import("@/pages/reporting/ReportingCenterPage").then((m) => ({ default: m.ReportingCenterPage })),
);
export const ReportingAnalyticsPage = lazy(() =>
  import("@/pages/reporting/ReportingAnalyticsPage").then((m) => ({
    default: m.ReportingAnalyticsPage,
  })),
);
export const ReportingProfitabilityPage = lazy(() =>
  import("@/pages/reporting/ReportingProfitabilityPage").then((m) => ({
    default: m.ReportingProfitabilityPage,
  })),
);
export const ReportingFinancialSummaryPage = lazy(() =>
  import("@/pages/reporting/ReportingFinancialSummaryPage").then((m) => ({
    default: m.ReportingFinancialSummaryPage,
  })),
);
export const ReportingJournalPage = lazy(() =>
  import("@/pages/reporting/ReportingJournalPage").then((m) => ({
    default: m.ReportingJournalPage,
  })),
);

export const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

export const SystemHealthPage = lazy(() =>
  import("@/pages/SystemHealthPage").then((m) => ({ default: m.SystemHealthPage })),
);

export const QaDashboardPage = lazy(() =>
  import("@/pages/QaDashboardPage").then((m) => ({ default: m.QaDashboardPage })),
);

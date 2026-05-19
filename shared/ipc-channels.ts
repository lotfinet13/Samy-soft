/**
 * Central registry of IPC channels. Single source of truth for main ↔ preload ↔ renderer.
 */
export const IPC_CHANNELS = {
  APP_QUIT: "app:quit",
  APP_WORKSTATION_INFO: "app:workstation-info",

  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_SESSION: "auth:session",
  BOOTSTRAP_STATUS: "bootstrap:status",
  BOOTSTRAP_CREATE_ADMIN: "bootstrap:create-admin",

  SETTINGS_GET_ALL: "settings:get-all",
  SETTINGS_UPSERT: "settings:upsert",
  SETTINGS_SELECT_BACKUP_FOLDER: "settings:select-backup-folder",

  BACKUP_EXPORT: "backup:export",
  BACKUP_LIST: "backup:list",
  BACKUP_RESTORE: "backup:restore",
  BACKUP_VERIFY: "backup:verify",
  BACKUP_HEALTH: "backup:health",

  ACTIVITY_LIST: "activity:list",
  ACTIVITY_QUERY: "activity:query",
  ACTIVITY_EXPORT_CSV: "activity:export-csv",

  DB_HEALTH: "db:health",
  DB_MAINT_SUMMARY: "db:maint:summary",
  DB_MAINT_INTEGRITY_CHECK: "db:maint:integrity-check",
  DB_MAINT_FOREIGN_KEYS: "db:maint:foreign-keys",
  DB_MAINT_VACUUM: "db:maint:vacuum",
  /** Lecture seule — inventaire / factures / paie / lots (hors PRAGMA SQLite). */
  DB_DATA_INTEGRITY_SCAN: "db:data-integrity:scan",

  /** Certification poste & export diagnostic — offline, privacy-safe. */
  QA_OVERVIEW_GET: "qa:overview:get",
  SYSTEM_DEPLOYMENT_CERT_RUN: "system:deployment-cert:run",
  SYSTEM_DIAGNOSTICS_EXPORT: "system:diagnostics:export",
  SYSTEM_SMOKE_MAIN_SELFTEST: "system:smoke:main-selftest",
  /** Diagnostics démarrage (schéma, intégrité légère) — lecture seule. */
  SYSTEM_STARTUP_DIAGNOSTICS: "system:startup:diagnostics",

  APP_UPDATES_PROBE: "app:updates-probe",

  INVENTORY_RAW_LIST: "inventory:raw:list",
  INVENTORY_RAW_UPSERT: "inventory:raw:upsert",
  INVENTORY_PACKAGING_LIST: "inventory:packaging:list",
  INVENTORY_PACKAGING_UPSERT: "inventory:packaging:upsert",
  INVENTORY_SUPPLIER_LIST: "inventory:supplier:list",
  INVENTORY_SUPPLIER_GET: "inventory:supplier:get",
  INVENTORY_SUPPLIER_UPSERT: "inventory:supplier:upsert",

  INVENTORY_PURCHASE_LIST: "inventory:purchase:list",
  INVENTORY_PURCHASE_CREATE: "inventory:purchase:create",

  INVENTORY_MOVEMENT_LIST: "inventory:movement:list",
  INVENTORY_MOVEMENT_OUTBOUND: "inventory:movement:outbound",
  INVENTORY_MOVEMENT_INBOUND: "inventory:movement:inbound",
  INVENTORY_MOVEMENT_MANUAL_ADJUSTMENT: "inventory:movement:manual-adjustment",

  INVENTORY_DASHBOARD_SUMMARY: "inventory:dashboard:summary",

  INVENTORY_REPORT_VALUATION: "inventory:report:valuation",
  INVENTORY_REPORT_MOVEMENTS_EXPORT: "inventory:report:movements-export",
  INVENTORY_REPORT_PURCHASE_EXPORT: "inventory:report:purchase-export",
  INVENTORY_REPORT_LOW_STOCK_EXPORT: "inventory:report:low-stock-export",
  INVENTORY_REPORT_EXPIRATION_EXPORT: "inventory:report:expiration-export",

  INVENTORY_NAV_COUNTS: "inventory:nav:counts",

  PRODUCTION_RECIPE_LIST: "production:recipe:list",
  PRODUCTION_RECIPE_GET: "production:recipe:get",
  PRODUCTION_RECIPE_UPSERT: "production:recipe:upsert",
  PRODUCTION_RECIPE_INGREDIENTS_REPLACE: "production:recipe:ingredients:replace",
  PRODUCTION_RECIPE_DUPLICATE: "production:recipe:duplicate",

  PRODUCTION_BATCH_CREATE: "production:batch:create",
  PRODUCTION_BATCH_LIST: "production:batch:list",
  PRODUCTION_BATCH_GET: "production:batch:get",
  PRODUCTION_BATCH_START: "production:batch:start",
  PRODUCTION_BATCH_COMPLETE: "production:batch:complete",
  PRODUCTION_BATCH_CANCEL: "production:batch:cancel",

  PRODUCTION_PREVIEW_SHORTAGES: "production:preview:shortages",
  PRODUCTION_REGISTER_WASTE: "production:register:waste",

  PRODUCTION_OPERATION_LOG_CREATE: "production:operation-log:create",
  PRODUCTION_OPERATION_LOG_LIST: "production:operation-log:list",

  PRODUCTION_DASHBOARD_SUMMARY: "production:dashboard:summary",

  PRODUCTION_REPORT_BATCHES_CSV: "production:report:batches-csv",
  PRODUCTION_REPORT_CONSUMPTION_CSV: "production:report:consumption-csv",
  PRODUCTION_REPORT_COSTS_CSV: "production:report:costs-csv",
  PRODUCTION_REPORT_WASTE_CSV: "production:report:waste-csv",

  PRODUCTION_NAV_COUNTS: "production:nav:counts",

  HR_WORKER_LIST: "hr:worker:list",
  HR_WORKER_GET: "hr:worker:get",
  HR_WORKER_UPSERT: "hr:worker:upsert",

  HR_ATTENDANCE_LIST: "hr:attendance:list",
  HR_ATTENDANCE_UPSERT: "hr:attendance:upsert",
  HR_ATTENDANCE_BULK_UPSERT: "hr:attendance:bulk-upsert",
  HR_ATTENDANCE_DAY_MATRIX: "hr:attendance:day-matrix",

  HR_SHIFT_LIST: "hr:shift:list",
  HR_SHIFT_UPSERT: "hr:shift:upsert",
  HR_SHIFT_ASSIGN: "hr:shift:assign",

  HR_PAYROLL_CYCLE_LIST: "hr:payroll:cycle:list",
  HR_PAYROLL_CYCLE_CREATE: "hr:payroll:cycle:create",
  HR_PAYROLL_CYCLE_RECORDS: "hr:payroll:cycle:records",
  HR_PAYROLL_COMPUTE: "hr:payroll:compute",
  HR_PAYROLL_RECORD_GET: "hr:payroll:record:get",
  HR_PAYROLL_ADJUSTMENT_ADD: "hr:payroll:adjustment:add",
  HR_PAYROLL_CYCLE_LOCK: "hr:payroll:cycle:lock",

  HR_ADVANCE_LIST: "hr:advance:list",
  HR_ADVANCE_CREATE: "hr:advance:create",

  HR_DASHBOARD_SUMMARY: "hr:dashboard:summary",

  HR_REPORT_PAYROLL_CSV: "hr:report:payroll-csv",
  HR_REPORT_ATTENDANCE_CSV: "hr:report:attendance-csv",
  HR_REPORT_ADVANCES_CSV: "hr:report:advances-csv",
  HR_REPORT_OVERTIME_CSV: "hr:report:overtime-csv",

  HR_NAV_COUNTS: "hr:nav:counts",

  SALES_CUSTOMER_LIST: "sales:customer:list",
  SALES_CUSTOMER_GET: "sales:customer:get",
  SALES_CUSTOMER_UPSERT: "sales:customer:upsert",

  SALES_PRODUCT_LIST: "sales:product:list",
  SALES_PRODUCT_GET: "sales:product:get",
  SALES_PRODUCT_UPSERT: "sales:product:upsert",

  SALES_INVOICE_LIST: "sales:invoice:list",
  SALES_INVOICE_GET: "sales:invoice:get",
  SALES_INVOICE_CREATE_DRAFT: "sales:invoice:create-draft",
  SALES_INVOICE_UPDATE_DRAFT: "sales:invoice:update-draft",
  SALES_INVOICE_LINES_REPLACE: "sales:invoice:lines-replace",
  SALES_INVOICE_VALIDATE: "sales:invoice:validate",
  SALES_INVOICE_CANCEL: "sales:invoice:cancel",
  SALES_PAYMENT_REGISTER: "sales:payment:register",

  SALES_DASHBOARD_SUMMARY: "sales:dashboard:summary",
  SALES_NAV_COUNTS: "sales:nav:counts",

  SALES_REPORT_REVENUE_CSV: "sales:report:revenue-csv",
  SALES_REPORT_INVOICES_CSV: "sales:report:invoices-csv",
  SALES_REPORT_BALANCES_CSV: "sales:report:balances-csv",
  SALES_REPORT_TOP_PRODUCTS_CSV: "sales:report:top-products-csv",
  SALES_REPORT_PAYMENTS_CSV: "sales:report:payments-csv",

  REPORTS_CENTER_SUMMARY: "reports:center-summary",
  REPORTS_PRESET_LIST: "reports:preset:list",
  REPORTS_PRESET_UPSERT: "reports:preset:upsert",
  REPORTS_PRESET_DELETE: "reports:preset:delete",
  REPORTS_ANALYTICS_INVENTORY: "reports:analytics:inventory",
  REPORTS_ANALYTICS_PRODUCTION: "reports:analytics:production",
  REPORTS_ANALYTICS_HR: "reports:analytics:hr",
  REPORTS_ANALYTICS_SALES: "reports:analytics:sales",
  REPORTS_KPIS_OVERVIEW: "reports:kpis:overview",
  REPORTS_PROFITABILITY_OVERVIEW: "reports:profitability:overview",
  REPORTS_MANAGEMENT_SUMMARY: "reports:management-summary",

  REPORTS_EXPORT_OPERATIONS_WORKBOOK: "reports:export:operations-workbook",
  REPORTS_EXPORT_PAYROLL_XLSX: "reports:export:payroll-xlsx",

  REPORTS_PDF_INVOICE: "reports:pdf:invoice",
  REPORTS_PDF_PAYROLL_SLIP: "reports:pdf:payroll-slip",
  REPORTS_PDF_INVENTORY_SUMMARY: "reports:pdf:inventory-summary",
  REPORTS_PDF_PRODUCTION_SUMMARY: "reports:pdf:production-summary",
  REPORTS_PDF_ATTENDANCE_SUMMARY: "reports:pdf:attendance-summary",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

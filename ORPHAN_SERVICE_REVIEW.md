# Orphan Service Architectural Classification Review

**Date:** 2026-05-19  
**Scope:** Architecture review only — no code changes  
**Context:** Local stability audit identified three main-process services with **zero runtime imports** (only documentation references).

---

## Executive summary

| Service | Classification | Schema tables | Runtime wiring |
|---------|----------------|---------------|----------------|
| `barcode-print-service.ts` | **KEEP_ACTIVE_FUTURE** | Keep | None (partial: `Product.barcode` in sales UI) |
| `industrial-expansion-service.ts` | **KEEP_ACTIVE_FUTURE** | Keep | None |
| `concurrency-service.ts` | **ARCHIVE_FUTURE** | Keep (empty by design) | None |

All three belong to **Phase 12 preparatory work** (`prisma/migrations/20260516121200_phase12_industrial_expansion`). They are not dead bugs; they are **unwired capability modules**. None qualify as **REMOVE_SAFE** without a deliberate product decision and a dedicated Prisma migration.

---

## 1. `electron/services/barcode-print-service.ts`

### 1.1 Current functionality

| Export | Role |
|--------|------|
| `resolveBarcode(prisma, barcode)` | Normalizes scan string; looks up `BarcodeMapping`, else falls back to `Product` by `barcode` or `sku`. |
| `buildLabelPrintPlan(resolution)` | Builds a 58 mm label descriptor (barcode, label text, SKU, paper profile). |
| `createThermalPlaceholderJob(plan)` | Returns a `ThermalPrintJob` JSON payload (no ESC/POS driver). |
| `DEFAULT_TOUCH_TERMINAL_CONFIGS` | Static touch UX presets for POS, attendance, production-log workflows. |

**Dependencies:** `shared/pos/types.ts` (`BarcodeResolution`, `ThermalPrintJob`, `TouchTerminalConfig`), Prisma `BarcodeMapping` + `Product`.

### 1.2 Linked Prisma models / tables

| Model | Used by service | Notes |
|-------|-----------------|-------|
| `BarcodeMapping` | Yes (`findUnique`) | Dedicated alias table; **no rows required** at runtime today. |
| `Product` | Yes (fallback lookup) | `Product.barcode` column actively used by sales CRUD (separate path). |
| `BarcodeEntityType` (enum) | Yes | RAW, PACKAGING, PRODUCT, PRODUCTION_BATCH, INVOICE |

**Related schema (not called by this file):** `PrintTemplate`, `TouchTerminalProfile` — same Phase 12 POS/print surface; also unwired.

### 1.3 IPC / UI / runtime hooks

| Layer | Status |
|-------|--------|
| **IPC handlers** | None — no channel in `shared/ipc-channels.ts` for barcode resolve or thermal print. |
| **Preload / renderer** | No `window.samy` calls to this service. |
| **UI** | `SalesProductsPage` — field **"Code-barres (futur POS)"** persisted via `sales:*` handlers on `Product.barcode` only (not `BarcodeMapping`). |
| **Shared contracts** | `shared/pos/types.ts` documents `BarcodeScannerPort`, `ThermalPrinterPort` (ports unimplemented). |
| **Docs** | `docs/project-architecture.md` Phase 12 POS bullet. |

### 1.4 Future ERP / business value

| Area | Value (1–5) | Rationale |
|------|-------------|-----------|
| Factory floor scanning | 4 | MP/emballage reception, batch traceability, expediting. |
| POS / fast invoice | 5 | Glacerie retail counter; aligns with existing sales module. |
| Label printing | 3 | Thermal/58 mm labels for products and lots. |
| Touch terminals | 3 | Shop-floor attendance and production logging. |

**Overall:** **High** — directly supports offline POS and warehouse workflows already anticipated in UI copy and schema.

### 1.5 Classification: **KEEP_ACTIVE_FUTURE**

The service is small, coherent, and matches declared product direction. Deleting it would discard ready logic while leaving `BarcodeMapping` as schema-only debt.

### 1.6 Migration / data risks if removed

| Risk | Severity | Detail |
|------|----------|--------|
| Drop `BarcodeMapping` table | Med | Requires Prisma migration + bootstrap SQL regen; any future alias data lost. |
| Drop `Product.barcode` column | **High** | Breaks sales product form and search; user-facing regression. |
| Remove service file only | Low | No runtime impact today; loses reference implementation for POS phase. |

### 1.7 Recommended next action

1. **Product sign-off:** Confirm POS / scanner scope in next 2–3 quarters.  
2. **Thin IPC slice (when approved):** Add `inventory:barcode:resolve` or `pos:barcode:resolve` handler calling `resolveBarcode` + allowlist in `ipc-channel-policy.ts`.  
3. **UI hook:** Wire scan field on `SalesInvoicesPage` / fast-sale flow to IPC (renderer stays dumb).  
4. **Defer:** `PrintTemplate` / `TouchTerminalProfile` CRUD until printer drivers are chosen.  
5. **Do not delete** `BarcodeMapping` until IPC + at least one UI path exists or product explicitly drops POS.

---

## 2. `electron/services/industrial-expansion-service.ts`

### 2.1 Current functionality

| Export | Role |
|--------|------|
| `computePurchaseForecast` | From `StockMovement` consumption over horizon (default 90 d): avg daily use, days remaining, reorder date, confidence. |
| `savePurchaseForecastSnapshot` | Persists row to `PurchaseForecastSnapshot`. |
| `listDueMaintenance` | Lists `MachineMaintenanceSchedule` due/planned for active machines. |
| `computeIndustrialAnalytics` | Aggregates completed batches, machine downtime minutes, attendance hours → utilization, production/labor efficiency scores, throughput. |
| `saveIndustrialAnalyticsSnapshot` | Persists row to `IndustrialAnalyticsSnapshot`. |

**Dependencies:** `inventory-service` (`getCurrentQty`, decimal helpers), production/HR/machine tables (read-only except snapshot writes).

### 2.2 Linked Prisma models / tables

| Model | Read | Write (via service) |
|-------|------|---------------------|
| `PurchaseForecastSnapshot` | — | `create` |
| `IndustrialAnalyticsSnapshot` | — | `create` |
| `StockMovement` | Yes | — |
| `RawMaterial` / `PackagingMaterial` | Yes (snapshot labels) | — |
| `ProductionBatch` | Yes | — |
| `MachineDowntime` | Yes | — |
| `AttendanceRecord` | Yes | — |
| `MachineMaintenanceSchedule` | Yes (`listDueMaintenance`) | — |
| `MachineAsset` | Yes (via schedule include) | — |

**Related schema (not used elsewhere in app):** full **machine asset stack** (`MachineAsset`, `MachineRepairRecord`, etc.) — seeded only if manually populated; **no IPC/UI** for machine CRUD today.

### 2.3 IPC / UI / runtime hooks

| Layer | Status |
|-------|--------|
| **IPC** | None for forecast, analytics, or maintenance. |
| **Reporting module** | Existing `reporting-metrics.ts` / dashboards do **not** call this service (parallel analytics path). |
| **UI** | `ProductionMixerPage` subtitle mentions maintenance “à venir” only. |
| **Scheduler** | No cron/backup-style job invokes snapshot saves. |
| **Docs** | Phase 12 architecture, `future-multiuser-architecture.md` (snapshots “regenerable”). |

### 2.4 Future ERP / business value

| Area | Value (1–5) | Rationale |
|------|-------------|-----------|
| Purchase reorder alerts | 5 | MP stock-outs are core factory pain; uses existing movement ledger. |
| Industrial KPI / OEE-lite | 4 | Utilization + batch efficiency for management; complements Phase 6 reporting. |
| Preventive maintenance | 4 | Mixer/freezer upkeep; tables exist but no UI. |
| Overlap with current reporting | 2 | Partial duplication risk with `reporting-metrics.ts` — needs integration design. |

**Overall:** **High** for procurement and factory management; **medium implementation risk** due to overlap and unwired machine master data.

### 2.5 Classification: **KEEP_ACTIVE_FUTURE**

Algorithms are non-trivial and aligned with ERP roadmap (inventory + production + HR). Archiving would force re-derivation later. Not **REMOVE_SAFE** because snapshot tables are part of bootstrap/migrations and documented LAN/sync story.

### 2.6 Migration / data risks if removed

| Risk | Severity | Detail |
|------|----------|--------|
| Drop `PurchaseForecastSnapshot` / `IndustrialAnalyticsSnapshot` | Med | Migration + bootstrap regen; historical forecast trends lost (likely empty today). |
| Drop machine tables | Med–High | Larger migration; breaks Phase 12 schema cohesion; maintenance feature abandoned. |
| Remove service only | Low | No current runtime effect. |
| Remove without reconciling reporting | Med | Product may expect KPIs that were never exposed. |

### 2.7 Recommended next action

1. **Product workshop:** Prioritize **reorder forecasts** vs **machine maintenance UI** vs **analytics snapshots**.  
2. **Integrate, don’t fork:** Expose `computePurchaseForecast` via `inventory:*` or `reports:*` IPC; surface on `InventoryDashboardPage` or purchases workflow.  
3. **Snapshot policy:** Either scheduled job (main process) or on-demand IPC `reports:industrial:snapshot` — avoid duplicate metrics in `reporting-metrics.ts`.  
4. **Machine master data:** Before `listDueMaintenance` is user-visible, add minimal `production:machine:*` CRUD or seed script for `MachineAsset`.  
5. **Do not remove** snapshot tables until at least one IPC path writes or reads them, or product signs off on deferring entire Phase 12 industrial pack.

---

## 3. `electron/services/concurrency-service.ts`

### 3.1 Current functionality

| Export | Role |
|--------|------|
| `WORKFLOW_CONCURRENCY_POLICIES` | Declarative policies for 5 workflows (invoice, stock, payroll, batch, attendance) — documentation-as-code. |
| `bumpOperationalVersion` | Upsert/increment `OperationalVersion` row. |
| `assertOptimisticVersion` | Compare `expectedVersion` vs DB; throw on mismatch. |
| `registerFutureLockIntent` | Insert `OperationalLock` (metadata `advisoryOnly: true`). |

**Dependencies:** `electron/repositories/db-context.ts` types (`OptimisticGuard`, `PessimisticLockTarget`) — **only referenced here**.

### 3.2 Linked Prisma models / tables

| Model | Used by service | Current data |
|-------|-----------------|--------------|
| `OperationalVersion` | `upsert` / `findUnique` | Expected **empty** in production |
| `OperationalLock` | `create` | Expected **empty** |
| `LockScope` (enum) | Yes | — |

**Not used by service but same Phase 12 pack:** `SyncEnvelope` (also unwired in `electron/`).

**Actual concurrency today:** Prisma `$transaction` in `sales-service`, `production-service`, `inventory-service`, etc. — **no optimistic version checks**.

### 3.3 IPC / UI / runtime hooks

| Layer | Status |
|-------|--------|
| **IPC** | None. |
| **UI** | None. |
| **Business services** | Do not import `bumpOperationalVersion` / `assertOptimisticVersion`. |
| **Docs** | `docs/concurrency-strategy.md`, `docs/future-multiuser-architecture.md`, `docs/project-architecture.md` — **canonical policy narrative**. |

### 3.4 Future ERP / business value

| Area | Value (1–5) | Rationale |
|------|-------------|-----------|
| Multi-workstation LAN | 5 | Required before shared SQLite server or sync hub. |
| Single-user factory PC today | 1 | SQLite + one operator — transactions suffice. |
| Policy catalog in code | 3 | Useful spec; duplicated in markdown. |

**Overall:** **High future / low present** — strategic for LAN phase, zero current user benefit.

### 3.5 Classification: **ARCHIVE_FUTURE**

Park the **implementation** until LAN/multi-user is funded; **retain tables and documentation**. The service is policy + unused DB helpers — not a user-facing feature half-done. Re-implementation should hook into real handlers (`validateInvoice`, `completeProductionBatch`, etc.) with E2E conflict tests.

**Not REMOVE_SAFE:** Dropping `OperationalVersion` / `OperationalLock` contradicts published multi-user architecture and requires migration on every deployed DB (even if empty).

### 3.6 Migration / data risks if removed

| Risk | Severity | Detail |
|------|----------|--------|
| Drop `OperationalVersion` / `OperationalLock` | Med | Schema migration; removes LAN readiness; docs become false. |
| Remove service, keep tables | **None** (operational) | Tables remain empty; docs unchanged. |
| Remove service + tables | Med | Must update bootstrap, migrations manifest, architecture docs, future LAN design. |
| Partial integrate without design | **High** | Calling `assertOptimisticVersion` in one handler only creates false sense of security. |

### 3.7 Recommended next action

1. **Archive pattern:** Move file to `electron/services/archive/concurrency-service.ts` (or mark `@deprecated` in header) **only after** extracting `WORKFLOW_CONCURRENCY_POLICIES` into `docs/concurrency-strategy.md` or `shared/concurrency-policies.ts` if types are needed later.  
2. **Keep** `db-context.ts` types — still valid for future repositories.  
3. **LAN phase entry criteria:** Define when to wire `assertOptimisticVersion` into top 3 workflows (invoice validate, batch complete, payroll lock).  
4. **Do not** sprinkle version bumps in single-user mode without UI to display conflicts.  
5. **Product decision:** Confirm LAN/multi-user remains on roadmap; if **cancelled**, reclassify tables to **REMOVE_SAFE** in a major version with migration plan.

---

## Cross-cutting comparison

```
                    ┌─────────────────────────────────────────┐
                    │         Phase 12 preparatory layer       │
                    └─────────────────────────────────────────┘
     barcode-print          industrial-expansion       concurrency
           │                        │                        │
    POS / scan / print      forecasts / OEE /          LAN locks /
                            maintenance lists          version guards
           │                        │                        │
     Product.barcode ◄───active───►  │                        │
     BarcodeMapping (idle)          │                        │
           │              StockMovement / Batch / HR          │
           │              Machine* tables (idle)              │
           │                        │            Operational* (idle)
           ▼                        ▼                        ▼
      KEEP_ACTIVE_FUTURE      KEEP_ACTIVE_FUTURE         ARCHIVE_FUTURE
      wire IPC + POS          wire IPC + dashboards      keep tables;
                                                         redesign on LAN
```

---

## REMOVE_SAFE — why none qualify today

| Criterion | barcode-print | industrial-expansion | concurrency |
|-----------|---------------|----------------------|-------------|
| Zero schema dependents | No (`BarcodeMapping`, `Product.barcode`) | No (6+ models) | No (`Operational*`) |
| Documented roadmap | Yes (POS) | Yes (factory KPIs) | Yes (LAN) |
| Replacement elsewhere | Partial (`Product.barcode` only) | Partial (reporting metrics) | No (transactions only) |
| Bootstrap/migration cost | Medium | High | Medium |

**REMOVE_SAFE** applies only after product **explicitly abandons** the capability and a **versioned migration** drops the related tables.

---

## Suggested decision sequence (no code)

| Week | Action |
|------|--------|
| 1 | Product triage: POS timing, reorder alerts, LAN timing. |
| 2 | If POS ≤ 6 months → spec IPC channels for `barcode-print-service`. |
| 2 | If procurement priority → spec `inventory:forecast:*` using `industrial-expansion-service`. |
| 3 | If LAN > 12 months → archive `concurrency-service.ts`; keep tables + `concurrency-strategy.md`. |
| 4 | Update `CLEANUP_RECOMMENDATIONS.md` P1 items with classifications from this review. |

---

## References (evidence)

| Artifact | Relevance |
|----------|-----------|
| `electron/services/database-schema-service.ts` | All tables created on bootstrap regardless of service wiring |
| `prisma/migrations/20260516121200_phase12_industrial_expansion/migration.sql` | Single migration introducing orphan-related tables |
| `npm run verify:bootstrap-schema` | Ensures bootstrap SQL includes orphan tables |
| `LOCAL_AUDIT_REPORT.md` §6 | Original dead-code identification |
| `CLEANUP_RECOMMENDATIONS.md` P1 #4–6 | Prior cleanup prompts |

---

*End of ORPHAN_SERVICE_REVIEW.md — architecture review only, no runtime changes.*

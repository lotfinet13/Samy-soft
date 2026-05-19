# SAMY SOFT — Stability Progress Report

**Date:** 2026-05-18  
**Sprint focus:** Reliability and consistency (no feature expansion)  
**Baseline:** [full-application-audit.md](./full-application-audit.md)

---

## Executive summary

Stabilization work targeted **IPC/DTO boundaries**, **list-page loading UX**, **cache invalidation after mutations**, and a **centralized operational layer** for async work. All automated checks pass; E2E critical flows are green.

**Production readiness estimate:** **72%** (↑ from 62%) — pilot-ready with documented remaining gaps.

---

## Verification matrix

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ Pass |
| `npm run build:electron` | ✅ Pass |
| `npm run test:unit` | ✅ 6/6 |
| `npx prisma validate` | ✅ (prior session) |
| `npm run e2e` | ✅ **3/3 passed** |

### E2E scenarios executed

| Test | Status | Coverage |
|------|--------|----------|
| `smoke: Electron démarre, preload présent` | ✅ Pass | App boot, preload bridge |
| `parcours connexion tableau de bord` | ✅ Pass | Login → dashboard |
| `navigation modules clés + IPC backup & intégrité` | ✅ Pass | Multi-module nav, backup/integrity IPC |

**Not yet in E2E (recommended next):** create → edit → delete cycles, stock propagation after invoice/batch, persistence after restart, full production consumption workflow.

---

## 1. DTO / IPC serialization — fixed

### Supplier domain (inventory)

| Channel | Before | After |
|---------|--------|-------|
| `inventory:supplier:get` | Raw Prisma graph + `toIpcPayload` | `SupplierDetailDto` via `toSupplierDetailDto()` |
| `inventory:supplier:upsert` | Raw Prisma + `toIpcPayload` | `SupplierListItemDto` via `toSupplierListItemDto()` |

**New types** in `electron/ipc/dto/inventory-dto.ts`:

- `SupplierDetailDto`, `SupplierMaterialBriefDto`, `SupplierPurchaseBriefDto`
- `toSupplierDetailDto()`, `toSupplierMaterialBrief()`, `toSupplierPurchaseBrief()`

### Production (prior + reinforced)

| Channel | Fix |
|---------|-----|
| `production:recipe:upsert` | `serializeRecipeMeta()` + `toIpcPayload` |
| `production:recipe:duplicate` | Same |

### Sales (prior session)

| Channel | Fix |
|---------|-----|
| `sales:product:get` / `sales:product:list` | `serializePackagingBrief` / `serializeRecipeBrief` |

### Material upsert/list

| Channel | Fix |
|---------|-----|
| `inventory:raw:upsert` / `inventory:packaging:upsert` | Return DTO from `hydrate*Balances` directly (already serialized) |
| `inventory:raw:list` | Return DTO items without redundant `toIpcPayload` wrapper |

### IPC channels audited (serialization posture)

| Module | Channels | DTO / serialize status |
|--------|----------|------------------------|
| Inventory | 18 | ✅ DTOs on materials, purchases, suppliers; movements use `serializeMovementScalars` |
| Production | 17 | ✅ Manual serialization on batches/recipes; meta helpers on upsert/duplicate |
| Sales | 18 | ✅ `serializeProduct`, `serializeInvoice`, `serializeCustomer` |
| HR | 21 | ✅ `serializeWorkerLite`, `serializeAttendance` |
| Reports | 16 | ✅ Presets via `SavedPresetDTO`; analytics return plain JSON numbers/strings |
| System | 12+ | ✅ Backup list ISO dates; export returns paths/ids only |

**Remaining IPC debt:** No automated CI test that scans every handler return with `findNonSerializableFields`. Incremental adoption of `wrapIpcHandler` from `electron/ipc/ipc-handler-utils.ts` recommended.

---

## 2. Page loading reliability — fixed (key pages)

| Page | Changes |
|------|---------|
| `InventorySuppliersPage` | `loading` on `DataTable`, `loadError` banner, structured reload |
| `InventoryMaterialsPage` | `loading` on list reload |
| `InventoryPurchasesPage` | `listLoading` on purchase journal |
| `InventoryMovementsPage` | `listLoading` on movement journal |
| `ProductionRecipesPage` | `loading` on recipe index |
| `ProductionBatchesPage` | `loading` on batch list |
| `ReportingAnalyticsPage` | `loading` / `loadError` on parallel analytics IPC |

### Pages still needing loading polish

| Page | Issue |
|------|-------|
| `InventoryDashboardPage` | Toast-only failures; no loading panel |
| `ProductionDashboardPage` | `console.error` only |
| `SalesDashboardPage` | Same |
| `SalesInvoicesPage` | Secondary picker `void` loads |
| `SalesReportsPage` | No export busy state |
| `SettingsPage` | Uses inline `statusMessage` (acceptable but inconsistent) |
| `HrWorkersPage` | Error state but no table loading |
| `ReportingCenterPage` | Has `loadError` (good); could add skeleton |

---

## 3. Cache invalidation — wired

| Mutation area | Invalidation |
|---------------|--------------|
| Supplier upsert | `invalidateInventoryCaches()` |
| Material upsert / inline qty | `invalidateInventoryCaches()` (existing) |
| Purchase create | `invalidateInventoryCaches()` + `invalidateReportsCaches()` |
| Stock movements (out/in/adjust) | `invalidateInventoryCaches()` + `invalidateReportsCaches()` |
| Recipe upsert / BOM sync | `invalidateProductionCaches()` + `invalidateInventoryCaches()` on BOM |
| Batch create/start/complete/cancel | `invalidateProductionCaches()` + `invalidateInventoryCaches()` + `invalidateReportsCaches()` |
| Production waste | `invalidateInventoryCaches()` (existing) |
| Invoice lifecycle | sales + inventory + reports (existing) |

**New:** `CACHE_PREFIX.PRODUCTION` and `invalidateProductionCaches()` in `src/lib/cache-keys.ts` / `invalidate-ui-cache.ts`.

**Note:** TTL cache is only actively read on home dashboard; prefix invalidation is forward-compatible when more pages adopt `cacheGetOrSet`.

---

## 4. Centralized operational stability layer — added

| Asset | Path | Role |
|-------|------|------|
| Renderer logger | `src/lib/logger.ts` | Structured `console` logging by area |
| IPC error text | `src/lib/ipc-errors.ts` | `formatIpcError()` (clone-safe message) |
| Toasts | `src/lib/notify.ts` | `notifySuccess`, `notifyError`, `notifyIpcFailure` |
| IPC invoke | `src/lib/samy.ts` | Uses logger + notify; re-exports `formatIpcError` |
| Async list loader | `src/hooks/useAsyncLoad.ts` | Loading/error/reload/retry (available for adoption) |
| Mutations | `src/lib/run-mutation.ts` | `runMutation`, `runSamyMutation` with success toast + `onSettled` |
| IPC helpers (main) | `electron/ipc/ipc-handler-utils.ts` | `parseIpcPayload`, `wrapIpcHandler`, `toIpcPayload` |
| Table loading | `src/components/ui/DataTable.tsx` | `loading` / `loadingLabel` props |
| Error boundary | `src/components/system/AppErrorBoundary.tsx` | Uses `logger.error` |

---

## 5. Fixed modules (summary)

| Module | Stability improvements |
|--------|------------------------|
| **Inventory** | Supplier DTOs; list loading on materials/suppliers/purchases/movements; purchase success toast |
| **Production** | Recipe IPC safe; batch invalidation trifecta; loading on recipes/batches; success toasts |
| **Sales** | Product nested relations serialized (prior) |
| **Reports** | Analytics loading/error; reports cache on inventory/production mutations |
| **Settings** | Unchanged this sprint (already has busy flags) |
| **HR** | Unchanged this sprint (handlers already serialized) |

---

## 6. Remaining unstable areas

| Priority | Area | Risk |
|----------|------|------|
| **High** | Prisma migration chain vs bootstrap | Fresh `migrate deploy` can fail; packaged app uses bootstrap SQL |
| **Medium** | Secondary dropdown IPC failures | Sales invoices/products pickers can be empty without explicit error |
| **Medium** | Dashboard pages | No loading/error panels — operators see stale or empty widgets |
| **Medium** | Success toast coverage | Not every save uses `notifySuccess` yet |
| **Low** | `useAsyncLoad` adoption | Hook exists but most pages still use manual `useState` |
| **Low** | Module-level error boundaries | Single global boundary still reloads full app |

---

## 7. Failed E2E scenarios

**None** in this run (3/3 passed).

Gaps in E2E coverage (not failures — missing tests):

- Create → edit → delete for materials, suppliers, products
- Invoice validate → stock deduction assertion
- Production batch complete → movement rows
- App restart → session/settings persistence
- Payroll compute → record persistence

---

## 8. Production readiness estimate

| Criterion | Status |
|-----------|--------|
| Typecheck / lint | ✅ |
| IPC clone-safe on critical paths | ✅ |
| Key list pages show loading | ✅ (8 pages) |
| Mutation cache invalidation | ✅ (core domains) |
| E2E smoke + nav | ✅ |
| Full workflow E2E | ❌ |
| Migration story | ❌ |
| 100% DTO coverage | ⚠️ ~85% |

**Estimate: 72%** — acceptable for **on-site pilot** with operator training; schedule **workflow E2E expansion** and **migration squash** before general availability.

---

## 9. Recommended next steps (stability-only)

1. Add Playwright specs for invoice validate + batch complete (stock assertions via IPC or UI qty cells).
2. Apply `useAsyncLoad` or `loading` to remaining dashboards and `SalesInvoicesPage`.
3. Standardize `notifySuccess` on all form saves via `runSamyMutation`.
4. Add unit test: `findNonSerializableFields` on each handler’s sample return shape.
5. Squash `prisma/migrations` to match `bootstrap-schema.sql`.

---

*Generated after stabilization sprint. See git diff for exact file changes.*

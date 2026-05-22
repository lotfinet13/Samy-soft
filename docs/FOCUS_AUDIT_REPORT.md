# SAMY SOFT — Form control focus audit

**Date:** 2026-05-22  
**Scope:** All user-editable controls (inputs, selects, textareas, filters, inline editors, modals, settings).

---

## Executive summary

| Result | Detail |
|--------|--------|
| **Root cause** | `Modal` re-ran initial `focus()` whenever `onClose` callback identity changed (inline lambdas on every parent re-render). |
| **Primary fix** | `src/components/ui/Modal.tsx` — initial focus once per open; focus first body field; stable `onClose` via ref. |
| **Secondary fixes** | `CommandPalette` — initial focus once per open; `InlineInventoryQtyCell` — removed `onBlur` dismiss (align with price cell). |
| **E2E** | `e2e/focus-form-controls.spec.ts` — modal, filter, settings, inline, palette coverage. |

---

## Fixes applied

### 1. `Modal.tsx` (critical)

- **Before:** `useEffect(..., [open, onClose])` called `first?.focus()` on every effect run → close button (first in DOM) stole focus during typing when parent re-rendered.
- **After:** Effect depends only on `[open]`; `onClose` stored in ref; `initialFocusDoneRef` ensures one focus pass per open; first focusable in **body** (form fields), not header close button.

### 2. `CommandPalette.tsx`

- Initial focus on filter input only when palette opens, not when `mode` changes while open.

### 3. `InlineInventoryQtyCell.tsx`

- Removed `onBlur={() => setEditing(false)}` so scrolling/table updates do not exit edit mode accidentally; commit via Enter, cancel via Esc (same as `InlineProductPriceCell`).

---

## Component inventory tested

### Shared UI

| Component | Controls | Focus notes |
|-----------|----------|-------------|
| `Modal` | Dialog shell | **Fixed** — trap + initial focus |
| `ConfirmDialog` | Uses `Modal` | Inherits fix |
| `FormField` | Wrapper | No focus side effects |
| `SearchInput` | `type="search"` | Forward ref; safe |
| `DataTable` | Virtualized `tabIndex={0}` region | Arrow keys scroll; Tab reaches region after cell inputs |

### System

| Screen / component | Controls | Tested |
|--------------------|----------|--------|
| `LoginPage` | username, password | Manual review — one-time mount focus OK |
| `SetupPage` | setup fields | Manual review |
| `FirstLaunchWizard` | `autoFocus` on first field | OK on wizard open only |
| `CommandPalette` | search filter | **E2E** |
| `GlobalShortcuts` | — | Skips shortcuts when target is input/textarea/select |
| `SessionIdleGate` | lock overlay | No focus steal during forms |

### Modals (all use `Modal`)

| Screen | Dialog | Controls | E2E |
|--------|--------|----------|-----|
| `InventoryMaterialsPage` | material-modal | text, number, select×2, textarea, checkbox×2 | **Yes** |
| `InventorySuppliersPage` | supplier-modal | text, email, tel, textarea×2 | **Yes** |
| `SalesCustomersPage` | Nouveau client | text×7, textarea, checkbox | Via supplier pattern |
| `SalesProductsPage` | Produit | text, select×3, textarea | Manual |
| `SalesInvoicesPage` | invoice-modal | select×2 | **Yes** |
| `ProductionBatchesPage` | batch create / complete | select, numeric | Manual |
| `ProductionMixerPage` | Saisie journal | numeric, textarea×3 | Manual |
| `ProductionRecipesPage` | Référenciation / Répartition | select, textarea, builder rows | Manual |

### Page-level forms (no drawer/slide-over in codebase)

| Screen | Control types | E2E |
|--------|---------------|-----|
| `SettingsPage` | text, select×5, numeric×3, checkbox | **Yes** (numeric) |
| `InventoryMovementsPage` | select×6, textarea×3, numeric | Manual |
| `InventoryPurchasesPage` | select, textarea, decimal inputs | Manual |
| `InventoryMaterialsPage` | search, preset name | **Yes** (search) |
| `SalesInvoiceDetailPage` | date, textarea, select, payment | Manual |
| `SalesCustomerProfilePage` | full customer form | Manual — `form.watch` in title re-renders header only |
| `ProductionWastePage` | select×3, textarea | Manual |
| `ProductionRecipesPage` | page + modals | Manual |
| `HrWorkerProfilePage` | date, select, textarea | Manual |
| `HrAttendanceDayPage` | date, select in matrix (virtualized) | Manual — scroll may unmount cells |
| `HrPayrollCyclesPage` | date×2, select | Manual |
| `HrAdvancesPage` | date, select | Manual |
| `HrShiftsPage` | form inputs | Manual |
| `HrWorkersPage` | search/filter | Manual |
| `HrReportsPage` | date range | Manual |
| `ReportingJournalPage` | date×2, search | **Yes** (date) |
| `ReportingCenterPage` | date×2 | Manual |
| `ReportingAnalyticsPage` | date×2 | Manual |
| `ReportingProfitabilityPage` | date×2 | Manual |
| `SalesReportsPage` | date×2 | Manual |
| `SalesInvoicesPage` | status selects, filters | Manual |

### Inline editors

| Component | Page | E2E |
|-----------|------|-----|
| `InlineProductPriceCell` | `SalesProductsPage` | **Yes** |
| `InlineInventoryQtyCell` | `InventoryMaterialsPage` | Manual (blur fix) |

---

## Verification checklist (per control class)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Focus remains while typing | **PASS** after Modal fix (E2E modals/filters) |
| 2 | Buttons/icons/dialogs do not steal focus | **PASS** — close button no longer auto-focused on re-render |
| 3 | Re-renders during typing do not move focus | **PASS** — Modal effect decoupled from `onClose` |
| 4 | Validation updates do not move focus | **PASS** — material modal E2E after failed submit |
| 5 | Autosave/state updates do not move focus | **PASS** — no autosave on keystroke in audited modals |
| 6 | Tab / Shift+Tab | **PASS** — material modal E2E |
| 7 | Accessibility | **PASS** — `role="dialog"`, `aria-modal`, labels retained |

---

## Additional findings (no code change required)

| Finding | Severity | Notes |
|---------|----------|-------|
| No drawer/slide-over pattern | — | N/A |
| `DataTable` virtual scroll `tabIndex={0}` | Low | Tab order includes table region; use mouse/inline F2 for cells |
| `HrAttendanceDayPage` virtualization | Low | Off-screen selects unmount on scroll while editing |
| `SalesCustomerProfilePage` `form.watch` in title | Low | Header re-render only; inputs keep registration |
| `ReportingJournalPage` `onBlur` reload | OK | Reload on blur, not during typing |
| No combobox/autocomplete library | — | Native `<select>` only |
| No dedicated time picker | — | Date via `type="date"`; time as numeric/text where needed |

---

## Final verification (2026-05-22)

| Suite | Result |
|-------|--------|
| `e2e/focus-form-controls.spec.ts` | **8/8 PASS** (~8s after `npm run build`) |
| Criteria 1–7 (focus while typing, Tab, validation re-render) | Covered by E2E |

## How to re-run verification

```powershell
npm run build
npm run e2e:ensure-db
$env:SAMY_E2E='1'; $env:SAMY_SKIP_DEVTOOLS='1'; $env:SAMY_E2E_DATABASE_PATH='.data/e2e/samye2e.sqlite'
npx playwright test e2e/focus-form-controls.spec.ts
npx playwright test e2e/modal-workflows.spec.ts
```

---

*Generated from full UI focus audit — SAMY SOFT v0.2.0.*

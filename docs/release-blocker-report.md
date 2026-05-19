# Release blocker report — reliability milestone

**Date:** 2026-05-18  
**Scope:** Modal E2E, cold restart persistence, `useAsyncLoad` dashboards, `verify:desktop`, migration documentation.  
**E2E verification:** `modal-workflows` + `restart-persistence` — **8/8 passed** (serial).

---

## Completed in this milestone

| Item | Status |
|------|--------|
| UI Playwright modal workflows (invoice, supplier, material, batch, purchase panel) | Implemented — `e2e/modal-workflows.spec.ts` |
| Cold Electron restart persistence | Implemented — `e2e/restart-persistence.spec.ts` |
| Modal UX hardening (Escape, focus trap, test IDs, double-submit guards) | Implemented |
| `useAsyncLoad` on inventory / production / sales dashboards | Implemented |
| `verify:desktop` orchestrator | Implemented — `scripts/verify-desktop.ts` |
| Migration & recovery documentation | `docs/database-recovery-and-migration.md` |

---

## E2E suite map

| Spec | Purpose |
|------|---------|
| `critical-flows.spec.ts` | Smoke boot, login, module nav, backup/integrity IPC |
| `workflow-invoice.spec.ts` | Invoice validate + stock IPC |
| `workflow-production.spec.ts` | Batch lifecycle + stock IPC |
| `workflow-crud.spec.ts` | Supplier/material/purchase IPC + reload |
| `modal-workflows.spec.ts` | UI modals: validation, toast, close, persistence |
| `restart-persistence.spec.ts` | Full process restart + SQLite survival |

Run all: `npm run e2e`  
Run gate only: `npm run verify:desktop`

---

## Flaky test watchlist

| Area | Risk | Mitigation |
|------|------|------------|
| Electron first window | Slow CI machines | 120s timeout, serial workers |
| Toast timing | Animation / parallel toasts | `last()` locator + 30s expect |
| Purchase line select | Fixture SKU label | `data-testid=purchase-modal-line-material` |
| Modal recipe dropdown | Async catalog | Wait `option` count > 1 |

Re-run 3× locally before release: `npm run e2e` and note any intermittent failures in this section.

---

## Remaining manual-only workflows

| Workflow | Why manual |
|----------|------------|
| Barcode / label printing | Hardware dependent |
| Payroll approval sign-off | Business policy |
| Windows installer upgrade path | Needs signed build + VM |
| Multi-workstation LAN (future) | Not in scope 0.2.x |
| Restore backup ZIP via UI | Destructive; smoke uses IPC export only |

---

## Open blockers (pre-GA)

| Priority | Blocker | Owner action |
|----------|---------|--------------|
| High | Migration chain squash not executed | Follow `database-recovery-and-migration.md` roadmap |
| Medium | Not all list pages use `useAsyncLoad` | HR workers, reporting center (incremental) |
| Medium | CI does not run `verify:desktop` on every PR | Add GitHub workflow |
| Low | Automated handler serialization scan | Extend `serialize-for-ipc.test.ts` |

---

## Readiness estimates

| Stage | Estimate | Criteria met |
|-------|----------|----------------|
| **Beta (internal)** | **~85%** | Modal + cold-restart E2E green; invoice picker pageSize bug fixed |
| **Internal production** | **~80%** | Single-site pilot with `verify:desktop` gate |
| **Factory pilot (real-world)** | **~72%** | Migration squash + installer soak still required |

**Trend:** +8–13 pts vs prior 72% report — reliability engineering is now the main gap, not architecture.

---

## Recommended next actions

1. Run `npm run verify:desktop` on release candidate build machine; archive log.
2. Execute migration squash before first multi-site rollout.
3. Add CI job mirroring `verify:desktop` (subset: lint + unit + smoke + modals on schedule).
4. Track flaky tests across 5 consecutive `e2e` runs; target <2% flake rate.

# Factory Simulation & Operational QA Report

**Generated:** 2026-05-20T10:29:02.842Z
**Simulation run:** 2026-05-20T10:29:01.777Z

## Executive summary

All scripted factory simulation steps **passed** on the isolated E2E database.

Scope: operational QA only (IPC workflows, selective UI navigation, integrity/backup drills). No new ERP features.

---

## Simulation coverage (10 areas)

| # | Area | Automated | Notes |
|---|------|-----------|-------|
| 1 | Inventory intake | `FS1` | Purchase → stock ↑ → movements → business integrity scan |
| 2 | Supplier workflows | `FS2` | CRUD IPC + suppliers page/modal navigation |
| 3 | Repeated invoices | `FS3` | 5 drafts, 3 validates, duplicate validate blocked |
| 4 | Production batch | `FS4` | create → start → complete |
| 5 | Stock reconciliation | `FS5` | Manual adjustment + startup/FK diagnostics |
| 6 | HR attendance/payroll | `FS6` | Bulk attendance + cycle create + compute |
| 7 | Backup drill | `FS7` | Export + verify + health (restore in separate spec) |
| 8 | Restart recovery | `FS8` | Cold relaunch + supplier survival |
| 9 | Long session | `FS9` | 3×5 navigations + IPC bursts + memory samples |
| 10 | Large dataset | `FS10` | pageSize 100 lists after bulk seed |

---

## Timing by domain (ms)

| Domain | Steps | p50 | max | Failures |
|--------|-------|-----|-----|----------|
| inventory-intake | 5 | 29 | 32 | 0 |
| supplier | 4 | 15 | 96 | 0 |
| invoice-repeat | 9 | 25 | 35 | 0 |
| production | 3 | 17 | 18 | 0 |
| stock-reconcile | 2 | 15 | 15 | 0 |
| hr | 4 | 15 | 18 | 0 |
| backup | 3 | 16 | 67 | 0 |
| restart | 1 | 71 | 71 | 0 |
| long-session | 19 | 19 | 134 | 0 |
| large-dataset | 3 | 22 | 66 | 0 |

### Slowest steps (successful)

- `fs9-ipc-burst-0` (long-session): **134 ms**
- `fs9-ipc-burst-2` (long-session): **105 ms**
- `fs2-ui-nav` (supplier): **96 ms**
- `fs9-ipc-burst-1` (long-session): **91 ms**
- `fs8-supplier-survive` (restart): **71 ms**
- `fs7-export` (backup): **67 ms**
- `fs10-raw-list-100` (large-dataset): **66 ms**
- `fs9-nav-1-/rh/paie` (long-session): **53 ms**

## Memory samples (renderer JS heap)

- **session-start**: 16 MB used
- **session-end**: 16 MB used
- **after-large-list-reload**: 16 MB used
- **Long-session delta:** +0 MB

## Large dataset seed

- Raw materials (total): **355**
- Suppliers (total): **125**
- Stock movements: **34**
- Invoices: **22**

## Prisma cold sample (dev machine)

```
[perf] SAMY SOFT — mesures locales (cold Prisma)
[perf] Connexion + SELECT 1 : 14.5 ms
[perf] count RawMaterial (355 lignes) : 3.1 ms
[perf] Racine projet : D:\Samy-soft
[perf] Voir aussi docs/performance-strategy.md pour gammes attendues.
```

## Playwright factory spec

- Tests: **10**
- Failed: **0**


---

## Bottlenecks observed

| Category | Finding | Severity |
|----------|---------|----------|
| UI navigation | Route transitions within acceptable dev E2E range | Low |
| SQLite integrity | Business integrity + FK checks pass in simulation | Low |
| IPC stability | `__SAMY_IPC_LOG__` failures = 0 in long session | Low |

## Repetitive UX pain (operator)

| Pattern | Impact |
|---------|--------|
| **Modal-heavy CRUD** | Suppliers, materials, invoices, batches, purchases each use full-screen modal — fast for training, tiring for high-volume entry |
| **Invoice draft vs validate** | Modal e2e covers draft only; validation is separate action — risk of operators leaving drafts unvalidated |
| **HR day matrix** | Attendance bulk exists but UI is page-per-day — many clicks for month-close |
| **Stock movements tabs** | Inbound/adjust/outbound on one page — powerful but dense for floor staff |
| **Onboarding wizard** | First admin still sees wizard unless dismissed — extra step on fresh install |

## Data consistency risks

| Risk | Mitigation in product | Residual |
|------|----------------------|----------|
| Double invoice validate | Server rejects non-DRAFT (`FS3` verified) | Low |
| Packaging stock vs product link | Validated on invoice validate | Test with misconfigured product in UAT |
| Production complete without start | Handlers enforce state machine | UI should disable early complete |
| Manual adjustment to absolute qty | Audited as MANUAL_ADJUSTMENT | Operator training required |
| Backup restore replaces DB | Documented; verify before restore | Operator must close app |
| E2E vs production DB path | E2E uses `.data/e2e/` only | Never run bulk seed on production |

## Slow queries / IPC (indicative)

Automated timings are on **E2E SQLite** with fixtures — not factory-scale data.

- `inventory:raw:list` at pageSize 100 — see FS10 timing above.
- `hr:payroll:compute` — scales with worker count; only one fixture worker in E2E.
- Dashboard/report caches TTL 45s–2min — stale KPI possible after mutation if invalidation missed.

## Large-table / virtualization

- `DataTable` virtualizes at ≥18 rows (`docs/performance-strategy.md`).
- Bulk seed adds **350+** raw SKUs — list IPC remains acceptable; **renderer scroll** should be validated manually on factory PC.
- No automated test for 10k+ movement rows export.

## Modal fatigue & keyboard workflow

- Modals: Escape closes; submit disabled while saving (e2e/modal-workflows).
- Login supports Ctrl+Enter; other forms mostly mouse-driven.
- **Gap:** No dedicated keyboard-only factory shift test.

## Navigation friction

- Hash routing + lazy routes → first visit to module incurs chunk load (FS9).
- Settings vs System Health split — diagnostics not on main operator path.

## Backup & recovery observations

- Export + verify succeed in FS7.
- Full restore drill: `e2e/backup-restore.spec.ts` (destructive; not re-run inside factory suite).
- NSIS `deleteAppDataOnUninstall: false` — DB survives uninstall (intended).

## Recovery after restart/crash

- FS8: supplier + SQLite file persist across cold launch.
- Restart spec leaves invoice DRAFT / batch PLANNED — correct mid-work recovery.
- No automated crash-kill (`SIGKILL`) test.

## Recommendations before real deployment

### Must

1. Run `npm run factory:simulation` on a reference factory PC after `dist:win`.
2. Manual half-day operator rehearsal: intake → production → invoice → backup ZIP.
3. Confirm backup folder on shared drive + restore drill on **copy** of production DB.
4. Add application icon (`APP_BRANDING_REQUIREMENTS.md`).

### Should

5. Profile renderer memory on 4h shift (DevTools heap) — no automated soak yet.
6. Seed staging DB with ≥6 months of movements and re-test list pages.
7. Train operators on invoice **validation** vs draft.
8. Document payroll lock procedure after compute.

### Nice to have

9. Packaged factory simulation (`SAMY_PACKAGED_EXE`) without E2E relax flags.
10. Keyboard shortcuts on high-traffic forms (purchase, attendance).
11. CI job: `factory:simulation` weekly on `verify:desktop` runner.

---

## How to reproduce

```bash
npm run factory:simulation
# Artifacts:
#   e2e/artifacts/factory-simulation-metrics.json
#   .data/factory-bulk-stats.json
#   FACTORY_SIMULATION_REPORT.md (this file)
```

Playwright spec: `e2e/factory-simulation.spec.ts`

## Run notes

- Full restore drill covered by e2e/backup-restore.spec.ts — destructive to live E2E DB mid-suite.
- Bulk seed rawTotal=355

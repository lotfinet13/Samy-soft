# E2E stability metrics

> Generated: 2026-05-19T00:31:02.352Z · Runs: 10 · Host: win32

## Summary

| Metric | Value |
|--------|-------|
| Pass rate | 10/10 (100%) |
| Average runtime | 34.4s |
| Runtime range | 34.2s – 34.6s |
| Run duration σ | 0.14s |
| Flaky runs (failures) | 0 |
| Playwright retries (all runs) | 0 |
| Boot artifact timing σ | 2012ms |

## Per-run results

| Run | Result | Duration (s) | Failed specs |
|-----|--------|--------------|--------------|
| 1 | PASS | 34.6 | — |
| 2 | PASS | 34.6 | — |
| 3 | PASS | 34.3 | — |
| 4 | PASS | 34.4 | — |
| 5 | PASS | 34.5 | — |
| 6 | PASS | 34.2 | — |
| 7 | PASS | 34.2 | — |
| 8 | PASS | 34.4 | — |
| 9 | PASS | 34.4 | — |
| 10 | PASS | 34.2 | — |

## Flaky tests observed

None in this campaign.

## Slowest specs (max duration across campaign)

| Spec | File | Max (s) |
|------|------|---------|
| backup export, verify, restore, and restart preserves fixtures | backup-restore.spec.ts | 4.0 |
| R1: create domain data before cold shutdown | restart-persistence.spec.ts | 1.5 |
| R2: relaunch and verify persistence + bootstrap idempotency | restart-persistence.spec.ts | 1.4 |
| validation, save, toast, close, table refresh, stale reset, escape | modal-workflows.spec.ts | 0.9 |
| A: facture brouillon → validation → déstockage → persistance reload | workflow-invoice.spec.ts | 0.9 |
| B: lot production — start → complete → stock MP ↓ → persistance | workflow-production.spec.ts | 0.8 |
| parcours connexion tableau de bord | critical-flows.spec.ts | 0.8 |
| C1: fournisseur — create → read → update → reload | workflow-crud.spec.ts | 0.8 |

## Last-run spec timing (representative)

Playwright-reported spec time sum: **13.1s** (excludes rebuild overhead).

## CI parity (local vs GitHub Actions)

| Setting | Local stability | CI (`verify-desktop` / nightly) |
|---------|-----------------|----------------------------------|
| Playwright config | `playwright.config.ts` | Same |
| Workers / parallel | `workers: 1`, `fullyParallel: false` | Same |
| Retries | `0` (non-CI and CI) | Same |
| Env | `SAMY_E2E=1`, `SAMY_SKIP_DEVTOOLS=1`, `SAMY_E2E_DATABASE_PATH=.data/e2e/samye2e.sqlite` | Same (+ `CI=true` on Actions) |
| DB seed | `npm run e2e:ensure-db` each run | Same via `verify:desktop` |
| Build | `build:electron` + `vite build` each stability run | `verify:desktop` once per gate |
| OS | win32 (this host) | `windows-latest` |

## Monitored risk areas

1. **Electron startup** — preload exposure, renderer boot, `main-boot.txt` artifact, startup diagnostics (E2E relax mode skips migration false-negatives).
2. **SQLite contention** — backup/restore + app restart (`backup-restore.spec.ts`), locked DB / lingering handles.
3. **Async UI** — modals, cache invalidation after mutations, toast timing, IPC round-trips.
4. **Session persistence** — onboarding suppression (`__SAMY_E2E__`), auth restore, route hydration after restart.
5. **Operational vs workflow** — system health checks separated from business workflow specs.

## Known intermittent risks (watch list)

- **Pagination + table virtualization** — lists default to 40 rows/page and virtualize after 18 rows; new rows sorted to page 2+ were invisible to Playwright. Mitigated: post-create navigation (last page / SKU search), E2E disables virtualization, fixtures prune ephemeral rows.
- **Ephemeral E2E data accumulation** — `E2E-UI-SUP-*`, `E2E-SUP-*`, `E2E-RESTART-*`, `E2E-RAW-*` must be purged in `e2e:fixtures` (with FK-safe deletes) before each stability iteration.
- Backup export/restore + restart (historical flake; 0 failures in final campaign).
- Invoice draft → validate → stock → reload persistence.
- Migration drift warnings in non-E2E runs only (E2E uses relax diagnostics).

## Campaign history (2026-05-19)

| Campaign | Result | Notes |
|----------|--------|-------|
| 5-run (post-diagnostics fixes) | **5/5** | Clean after startup-diagnostics E2E isolation |
| 10-run (pre-pagination fix) | 3/10 → 0/10 | Supplier/material modal table refresh off page 1 |
| 10-run (final) | **10/10** | Pagination, virtualization, fixtures, supplier search |

## Factory pilot gate

- Target: **5/5** clean minimum, ideally **10/10** — current campaign: **10/10**.
- Zero silent failures, renderer crashes, non-deterministic modal failures.

## Notes

- Run locally: `npm run e2e:stability` (default 5 consecutive passes).
- Extended: `npm run e2e:stability -- --runs=10`.
- CI gate: `npm run verify:desktop` on `windows-latest` (`.github/workflows/verify-desktop.yml`).
- Nightly flake detection: `.github/workflows/e2e-stability-schedule.yml` (3 runs).
- Investigate failures with `playwright-report/` and `test-results/` artifacts.

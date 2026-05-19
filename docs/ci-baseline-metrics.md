# CI baseline metrics

> **Status:** Local `verify:desktop` green (windows-style clean steps). **GitHub Actions `verify-desktop` pending** — no `git remote` configured in this workspace; push to `origin` on `main` to trigger `.github/workflows/verify-desktop.yml`.

## Latest local verify gate (proxy for CI)

| Field | Value |
|-------|-------|
| Date | 2026-05-19T08:51:02Z |
| Host | win32 (developer machine) |
| Command | `npm run verify:desktop` |
| Total runtime | **93.2s** |
| Result | **PASS** (all steps) |
| Playwright tests | 17/17 |
| Playwright retries | 0 |
| Vitest | 23 tests, 8 files |

## Pipeline step timing (local)

| Step | Outcome |
|------|---------|
| Typecheck (lint) | PASS |
| Prisma validate | PASS |
| Prisma db push (clean SQLite) | PASS |
| Bootstrap schema drift | PASS |
| Schema checksum manifest | PASS |
| Unit tests + coverage | PASS (23 tests) |
| Build renderer + electron | PASS |
| E2E database prepare | PASS |
| Playwright full suite | PASS (**24.2s** spec time) |

## Slowest E2E specs (last local run)

| Spec | Approx. duration |
|------|------------------|
| backup export, verify, restore, and restart preserves fixtures | ~4s |
| R1 / R2 restart persistence | ~1.4s each |
| modal-workflows (supplier validation) | ~1s |
| workflow-invoice (validate + stock) | ~0.9s |
| workflow-production | ~1.3s |

## Electron / startup signals

| Signal | Value |
|--------|-------|
| `main-boot.txt` timestamp | 2026-05-19T08:50:59.297Z |
| E2E relax diagnostics | `relax=true` |
| Preload artifact | `e2e/artifacts/preload-executed.txt` present |

## Warnings observed (non-failing)

- Prisma `package.json#prisma` deprecation notice (Prisma 7 config migration advisory).
- Node `NO_COLOR` / `FORCE_COLOR` interaction during Playwright (cosmetic).

## Artifact expectations on GitHub Actions (when green)

After `verify-desktop` on `windows-latest`, download and review:

| Artifact | Purpose |
|----------|---------|
| `playwright-report` | HTML timeline, failures, traces (on failure: `retain-on-failure`) |
| `playwright-results` | `playwright-results.json` for machine-readable timing |
| `playwright-test-results` | Screenshots / traces per spec |
| `e2e-artifacts` | `main-boot.txt`, preload/window launch markers |
| `vitest-coverage` | Unit/IPC coverage thresholds |
| `verify-desktop-logs` | Failure-only CI log snapshot |

## CI parity checklist

| Check | Local verify | GitHub Actions |
|-------|--------------|----------------|
| `npm ci` | Uses existing `node_modules` | Fresh install |
| `npx prisma generate` | postinstall / build | Explicit step |
| `SAMY_E2E=1` | Yes | Yes (`env`) |
| `SAMY_E2E_DATABASE_PATH` | `.data/e2e/samye2e.sqlite` | Same |
| Playwright `workers: 1` | Yes | Yes |
| Retries | 0 | 0 |

## E2E stability cross-reference

| Campaign | Result |
|----------|--------|
| 10-run local stability (2026-05-19) | **10/10**, avg 34.4s, σ 0.14s |

See [`e2e-stability-metrics.md`](./e2e-stability-metrics.md).

## Release-engineering gate

**Factory / pilot readiness** requires:

1. At least one green `verify-desktop` on `windows-latest` after push.
2. Multiple consecutive CI greens (recommend 3+).
3. Nightly `e2e-stability-schedule` (3 runs) without regression.

## Post-CI stabilization freeze

Until CI baseline holds, defer major refactors. Next dedicated tracks (after CI green):

- Migration squash / cutover rehearsal (`verify:migrate-deploy` currently blocked by historical migration ordering — E2E uses `db push`).
- Installer upgrade-path testing
- Long-duration soak testing
- Large dataset simulation
- Backup corruption recovery
- Performance profiling

## Updating this document

After each successful GitHub Actions `verify-desktop` run:

1. Note workflow run URL and run id.
2. Download artifacts; record total job time from Actions UI.
3. Update slowest specs from `playwright-results.json`.
4. Log any warnings/traces even on green runs.

# Repository cleanup report

**Date:** 2026-05-19  
**Purpose:** Prepare a lean first GitHub push — remove regenerable artifacts, confirm ignore rules, audit secrets, preserve all source and operational assets.

## Summary

| Metric | Value |
|--------|-------|
| **Disk space reclaimed (this pass)** | **~346.7 MB** |
| **Prior quarantine installers removed** | ~340.7 MB (`_quarantine/`) |
| **Build/test artifacts removed** | ~2.8 MB |
| **Local SQLite removed (regenerable)** | ~3.2 MB |
| **Source files deleted** | **0** |
| **Tracked junk in git** | **None** (pre-cleanup audit) |
| **`.env` ever in git history** | **No** |

---

## Deleted (regenerable)

All paths were already listed in `.gitignore` and were **not tracked** by git.

| Path | Approx. size | Restore with |
|------|--------------|--------------|
| `_quarantine/release-first-admin-fix-20260518060756/` | 340.65 MB | `npm run dist:win` (if installers needed again) |
| `dist/` | 1.13 MB | `npm run build` |
| `dist-electron/` | 0.85 MB | `npm run build:electron` |
| `coverage/` | 0.20 MB | `npm run test:unit` (with coverage) |
| `playwright-report/` | 0.53 MB | `npm run e2e` / `verify:desktop` |
| `e2e/artifacts/` | 0.11 MB | Playwright E2E run |
| `playwright-results.json` | 0.02 MB | Playwright E2E run |
| `test-results/` | 0 MB | Playwright E2E run |
| `node_modules/.cache/` | 0 MB | Next Vite/ESLint run |

**Quarantined installers removed (no longer deferred):**

- `SAMY SOFT 0.2.0.exe` (~170 MB)
- `SAMY SOFT Setup 0.2.0.exe` (~170 MB)

**Local SQLite (regenerable; never committed):**

| File | Approx. size | Restore with |
|------|--------------|--------------|
| `.data/samy-soft.sqlite` | 0.61 MB | `npx prisma migrate deploy` + seed, or dev startup |
| `.data/e2e/samye2e.sqlite` | 1.71 MB | `npm run e2e:ensure-db` / `verify:desktop` |
| `.data/ci-db-push-check/fresh.sqlite` | 0.81 MB | `verify:desktop` |
| `.data/ci-migrate-check/migrate-deploy.sqlite` | 0.04 MB | `verify:migrate-deploy` (when used) |

---

## Preserved (not deleted)

| Area | Notes |
|------|--------|
| `src/`, `electron/`, `shared/`, `prisma/`, `e2e/*.spec.ts`, `scripts/`, `docs/`, `.github/` | All source and CI |
| `package.json`, `package-lock.json`, `tsconfig*`, `vite.config*`, `playwright.config.ts` | Build/test config |
| `node_modules/` | Dependencies (reinstall via `npm ci`) |
| `.env` (local only) | **Kept on disk** — gitignored; required for local Prisma/Electron |
| `prisma/migrations/` | Schema history |
| IPC/DTO/serialization utilities | Untouched |

---

## Absent at cleanup time (nothing to delete)

`build/`, `out/`, `release/`, `releases/`, `ci-logs/`, `.vite/`, `.turbo/`, `tmp/`, `temp/`, `logs/`, `*.log` (root), portable `release/` tree from 2026-05-18 prior cleanup.

---

## `.gitignore` updates (this pass)

Added explicit entries:

- `ci-logs/` — failure snapshot folder from `verify-desktop` workflow
- `.env.local`, `.env.production.local` — redundant with `.env.*` but explicit for reviewers

Already covered (unchanged intent):

- `*.sqlite`, `*.db`, `.data/`, `backups/`, `dist/`, `dist-electron/`, `release/`, `coverage/`, `playwright-report/`, `test-results/`, `e2e/artifacts/`, `*.exe`, `*.zip`, `_quarantine/`

---

## Sensitive-file audit

| Check | Result |
|-------|--------|
| `.env` tracked | **No** |
| `.env` in git history | **No** |
| SATIM / Bunny / cloud API keys in repo | **None found** |
| Production credentials in source | **None** — only seed/E2E test passwords in `prisma/seed.ts`, `e2e/helpers/app.ts` (documented test fixtures) |
| Local `.env` on disk | Present, gitignored — **do not commit** |
| Hardcoded Windows paths in committed TS/JSON | **None found** (`D:\Samy-soft` not in tracked sources) |

**Skipped / not deleted:**

- Local `.env` — operational; must stay out of git
- Default seed password `Admin123!` in README/seed — documented dev default, not a secret leak

**Recommendation:** Add `.env.example` with `DATABASE_URL="file:../.data/samy-soft.sqlite"` before public repo (template referenced in `.gitignore` but file not yet present).

---

## Git tracking audit

```text
git ls-files → no dist/, coverage/, *.sqlite, *.exe, node_modules/, or .env
```

Working tree after cleanup: `.gitignore` modified only (artifact deletions were all ignored paths).

---

## Post-cleanup verification

| Step | Command | Status |
|------|---------|--------|
| Clean install | `npm ci` | **PASS** (~60s) |
| Typecheck | `npm run lint` | **PASS** (~17s) |
| Full gate | `npm run verify:desktop` | **PASS** (~68s) — 17/17 E2E, 23/23 unit, 0 retries |

**Transient failure (not cleanup-related):** First full `verify:desktop` after cleanup failed once on `backup-restore.spec.ts` (`auth:logout` → `activityLog` FK during `ensureLoggedIn`). Isolated re-run and second full gate both **PASS**. Treat as existing flake risk; monitor on CI.

**Warnings (unchanged):** Prisma `package.json#prisma` deprecation; Playwright `NO_COLOR` / `FORCE_COLOR` cosmetic.

---

## Recommended ongoing hygiene

1. Never `git add -f` on `dist/`, `release/`, `.data/`, or installers.
2. Run this cleanup informally before releases: delete `dist*`, `coverage/`, Playwright outputs, old `_quarantine/`.
3. After CI greens, download Actions artifacts locally, review, then delete — do not commit.
4. Keep migration squash / installer builds off `main` until CI baseline is stable (3 consecutive greens).

---

## Related docs

- [`project-cleanup-report.md`](./project-cleanup-report.md) — 2026-05-18 pass (~1.37 GB `release/` removal)
- [`ci-baseline-metrics.md`](./ci-baseline-metrics.md) — CI baseline tracking

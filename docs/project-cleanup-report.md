# Project cleanup report

**Date:** 2026-05-18  
**Scope:** Safe removal of regenerable artifacts; no source, schema, migrations, or active database touched.

## Summary

| Metric | Value |
|--------|-------|
| **Space reclaimed from workspace** | ~1 370 MB (1.34 GB) |
| **Deleted outright** | ~1 029 MB |
| **Moved to quarantine** | ~341 MB (review, then delete manually) |
| **Source files removed** | 0 |
| **Post-cleanup verification** | `build:electron`, `prisma generate`, `lint`, `build`, `test:unit` — all passed |

---

## Deleted (regenerable)

These paths are listed in `.gitignore` and rebuild with normal npm scripts.

| Path | Approx. size | Restore with |
|------|--------------|--------------|
| `release/` | 989 MB | `npm run dist:win` |
| `dist/` | 1.1 MB | `npm run build` |
| `dist-electron/` | 0.8 MB | `npm run build:electron` |
| `node_modules/.cache/` | 38 MB | recreated on next Vite/ESLint run |

**Contents of `release/` (removed):**

- `SAMY SOFT Setup 0.2.0.exe` (~170 MB)
- `SAMY SOFT 0.2.0.exe` (portable, ~170 MB)
- `win-unpacked/` + `SAMY SOFT.exe` (~182 MB)
- NSIS/blockmap/builder debug artifacts

---

## Quarantined (review before permanent delete)

| Original path | New location | Approx. size | Reason |
|---------------|--------------|--------------|--------|
| `release-first-admin-fix-20260518060756/` | `_quarantine/release-first-admin-fix-20260518060756/` | 341 MB | Dated duplicate installer output at repo root; not referenced by build scripts |

After confirming you no longer need these installers:

```powershell
Remove-Item -Recurse -Force _quarantine
```

`_quarantine/` is in `.gitignore` and must not be committed.

---

## Skipped / protected (intentionally kept)

| Item | Reason |
|------|--------|
| `.data/samy-soft.sqlite` | Active local database (~0.6 MB) |
| `.env` | Local secrets / `DATABASE_URL` |
| `prisma/schema.prisma`, `prisma/migrations/` | Source of truth for schema |
| `prisma/bootstrap-schema.sql` | Shipped with Electron extraResources |
| `node_modules/` (except `.cache`) | Required dependencies (~1.15 GB) |
| `src/`, `electron/`, `shared/`, `docs/` | Application source |
| `electron/prisma-client.ts` | **Not** a duplicate generated client — ESM wrapper re-exporting `@prisma/client` for the main process |
| No stray `*.sqlite` backups found outside `.data/` or `backups/` | Nothing to prune |

**Not present** (nothing to delete): `.vite/`, `.turbo/`, `coverage/`, `out/`, `build/`, `logs/`, root `*.log`, `playwright-report/`, `test-results/`, `e2e/artifacts/`, screenshots, test snapshots.

---

## Dead code / unused file analysis

Conservative review — **no source files were deleted** (uncertain items documented only).

| File / area | Status | Recommendation |
|-------------|--------|----------------|
| `src/pages/ModulePlaceholder.tsx` | **Unused** — not imported in `App.tsx` or routes | Safe to remove in a follow-up PR, or wire to a route if still planned |
| All pages in `src/pages/lazy-pages.ts` | **Used** — routed from `App.tsx` |
| IPC handlers (`inventory`, `sales`, `hr`, `production`, `reports`, `system`) | **Registered** in `electron/ipc/handlers.ts` |
| `electron/preload.ts` | **Active** — built to `dist-electron/electron/preload.cjs` |
| `electron/tsconfig.preload.json` | **Used** by `npm run lint` |
| `electron/ipc/dto/inventory-dto.ts` | **Used** by inventory IPC handlers |
| Duplicate DTOs | None found beyond intentional IPC DTO layer |
| Orphan Prisma clients | None — single generated client in `node_modules/@prisma/client` |

---

## Tooling added / updated

### npm scripts (`package.json`)

| Script | Action |
|--------|--------|
| `npm run clean` | Remove cache + build outputs + `release/`; quarantine dated `release-*` folders |
| `npm run clean:cache` | `.vite`, `node_modules/.cache`, test/coverage artifacts, logs |
| `npm run clean:build` | `dist/`, `dist-electron/`, `out/`, `build/` |
| `npm run clean:installers` | `release/` + quarantine dated installer folders |

Dry run:

```bash
node scripts/clean-project.mjs all --dry-run
```

### `.gitignore`

- Deduplicated duplicate entries at file bottom
- Added: `.turbo/`, `_quarantine/`, `release-*/`, clearer cache/test sections
- Kept explicit `!docs/` and `!prisma/migrations/` keeps

### `scripts/clean-project.mjs`

Cross-platform Node script; never deletes protected paths; JSON report to stdout.

---

## Development vs production artifacts

| Layer | Location | Git | Regenerate |
|-------|----------|-----|------------|
| Dev UI (Vite) | `dist/` | ignored | `npm run build` |
| Electron main/preload | `dist-electron/` | ignored | `npm run build:electron` |
| Windows installers | `release/` | ignored | `npm run dist:win` |
| Prisma client | `node_modules/@prisma/client` | ignored | `npx prisma generate` |
| Runtime DB | `.data/*.sqlite` | ignored | user data — **never** in `clean` |
| One-off builds | `_quarantine/` | ignored | manual delete after review |

---

## Verification (post-cleanup)

| Check | Result |
|-------|--------|
| `npm run build:electron` | OK |
| `npx prisma generate` | OK |
| `npm run lint` | OK |
| `npm run build` (Vite + electron + prisma) | OK |
| `npm run test:unit` | 6 tests passed |
| Inventory IPC serialization | Covered by unit tests (`serialize-for-ipc`) |
| Full Electron GUI boot | Not automated here — run `npm run dev` locally |

---

## Maintenance recommendations

1. **Weekly / before commits:** `npm run clean:cache`
2. **After `dist:win` or when disk is low:** `npm run clean:installers` (or full `npm run clean`)
3. **Never commit:** `release/`, `dist/`, `.data/`, `.env`, `_quarantine/`
4. **CI:** add `npm run clean:build && npm run build` to ensure clean builds
5. **Old installers:** store outside the repo (e.g. `D:\Releases\SAMY-SOFT\`) instead of duplicate `release-*` folders at root
6. **Follow-up (optional):** delete `src/pages/ModulePlaceholder.tsx` if the placeholder module is abandoned
7. **Quarantine:** remove `_quarantine/` after confirming installers are obsolete (~341 MB additional savings)

---

## Command log (this run)

```text
node scripts/clean-project.mjs all
→ freedBytes: 1 436 140 169 (~1 369.61 MB)
npm run build:electron && npx prisma generate && npm run test:unit && npm run lint && npm run build
→ all succeeded
```

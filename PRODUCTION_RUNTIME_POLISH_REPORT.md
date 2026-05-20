# Production Runtime Polish Report

**Date:** 2026-05-19  
**Scope:** Hardening / polish only (no ERP features)  
**Phase:** Production Runtime Polish

---

## Executive summary

Packaged startup diagnostics no longer report false `bootstrap-schema.sql` missing warnings. Bootstrap SQL and migration health checks now use **packaged runtime paths** (`process.resourcesPath`) instead of the dev repo tree inside ASAR.

| Priority | Item | Status |
|----------|------|--------|
| P1 | Packaged bootstrap path resolution | **Fixed** |
| P1 | ASAR-safe schema lookup (shared with DB bootstrap) | **Fixed** |
| P1 | Packaged health / startup diagnostics accuracy | **Verified** |
| P2 | Packaged migration strategy documented | **Done** (`docs/database-recovery-and-migration.md`) |
| P2 | Health UI migration false positives (packaged) | **Fixed** |
| P3 | Branding / icon pipeline audit | **Done** (`APP_BRANDING_REQUIREMENTS.md`) |

---

## P1 — Startup diagnostics path resolution

### Root cause

`detectBootstrapSchemaDrift()` in `scripts/bootstrap-schema-drift.ts` always resolved SQL relative to the **compiled scripts folder** (`dist-electron/scripts` → `dist-electron/prisma/bootstrap-schema.sql`). That path does not exist in a packaged app. Runtime DB bootstrap already used `process.resourcesPath/prisma/bootstrap-schema.sql` via `database-schema-service.ts`, so the database could initialize while diagnostics falsely warned.

### Fix

1. **`shared/bootstrap-schema-paths.ts`** — pure candidate ordering (packaged: resources first; dev: `cwd` first).
2. **`electron/utils/packaged-runtime-paths.ts`** — `findBootstrapSchemaSqlPath()` / `resolveBootstrapSchemaSqlPathOrThrow()` used by schema bootstrap and diagnostics.
3. **`electron/services/startup-diagnostics-service.ts`** — resolves bootstrap via packaged paths; **content drift** via Prisma CLI only when **not** packaged (`presenceOnly` when `app.isPackaged`).
4. **`electron/services/database-schema-service.ts`** — delegates to shared resolver (single source of truth).
5. **`scripts/bootstrap-schema-drift.ts`** — optional `bootstrapPath`, `repoRoot`, `presenceOnly` for CI vs runtime.

### Packaged resource layout (unchanged, confirmed)

```
release-polish/win-unpacked/
  resources/
    prisma/bootstrap-schema.sql    ← extraResources (outside ASAR)
    app.asar                       ← dist + dist-electron (no prisma/migrations)
```

---

## P2 — Packaged migration visibility

### Intended strategy

| Artifact | In installer? | Runtime |
|----------|---------------|---------|
| `prisma/bootstrap-schema.sql` | **Yes** (`extraResources`) | Empty DB bootstrap |
| `prisma/migrations/` | **No** | Dev / CI / upgrade runbooks only |
| Prisma CLI | **No** | Build & CI |

### Diagnostics behavior

- **Packaged:** `migrationDriftSummary` reports `ok: true`, `pendingCount: 0` — compares applied rows in SQLite only, does not scan missing migration folders.
- **Dev:** folder parity under repo `prisma/migrations/` vs `_prisma_migrations`.
- **E2E:** unchanged skip when `SAMY_E2E=1`.

Documentation updated in `docs/database-recovery-and-migration.md` § *Packaged app migration strategy*.

---

## P3 — Branding infrastructure

See **`APP_BRANDING_REQUIREMENTS.md`** for:

- Missing `build/icon.ico` and `build.win.icon` (electron-builder still warns: *default Electron icon is used*).
- Required ICO resolutions and NSIS optional assets.
- Verification checklist after assets are added.

In-app factory branding (`branding-service.ts` / settings) is already functional and unchanged.

---

## Verification

### `npm run build`

| Step | Result |
|------|--------|
| `tsc` (electron + shared) | **PASS** |
| Vite production bundle | **PASS** |
| `prisma generate` | **PASS** |

### `npm run test:unit`

25 tests **PASS** (includes new `bootstrap-schema-paths` cases).

### `npm run dist:win`

| Attempt | Result |
|---------|--------|
| Default `release/win-unpacked` | **BLOCKED** — `app.asar` locked by another process (EBUSY). Typical when a previous `SAMY SOFT.exe` or indexer holds the file. |
| Alternate output `npx electron-builder --win --config.directories.output=release-polish` | **PASS** — NSIS + portable built |

**Operator note:** Close all SAMY SOFT instances and retry `npm run dist:win`, or remove `release/win-unpacked` after unlock.

### Packaged validation probe

```powershell
$env:SAMY_PACKAGED_EXE = "d:\Samy-soft\release-polish\win-unpacked\SAMY SOFT.exe"
npm run validate:packaged
```

**Result (2026-05-19):**

| Check | Value |
|-------|-------|
| `bootstrapTablesOk` | `true` |
| `bootstrapFileExists` | `true` |
| `startupDiagnosticsOk` | `true` |
| `migrationsOk` | `true` |
| `migrationsPendingCount` | `0` |
| `preloadOk` / `ipcSmokeOk` | `true` |
| `errors` | `[]` |

Output: `.data/packaged-validation-probe.json`

Probe supports `SAMY_PACKAGED_EXE` override when `release/win-unpacked` is not the target build.

---

## Files changed

| File | Change |
|------|--------|
| `shared/bootstrap-schema-paths.ts` | New — candidate path builder |
| `electron/utils/packaged-runtime-paths.ts` | New — runtime resolver |
| `electron/services/database-schema-service.ts` | Use shared resolver |
| `electron/services/startup-diagnostics-service.ts` | Packaged-aware bootstrap + migrations |
| `scripts/bootstrap-schema-drift.ts` | Configurable paths / presence-only mode |
| `scripts/packaged-validation-probe.ts` | `SAMY_PACKAGED_EXE` + diagnostic fields |
| `tests/unit/bootstrap-schema-paths.test.ts` | New unit tests |
| `package.json` | `validate:packaged` script |
| `docs/database-recovery-and-migration.md` | Packaged migration strategy |
| `APP_BRANDING_REQUIREMENTS.md` | New |
| `PRODUCTION_RUNTIME_POLISH_REPORT.md` | This report |

---

## Follow-ups (not in this phase)

1. Add `build/icon.ico` per `APP_BRANDING_REQUIREMENTS.md`.
2. Unlock `release/` and standardize on `npm run dist:win` → `release/win-unpacked`.
3. Optional CI job: `dist:win` + `validate:packaged` on release runner.
4. Migration squash / upgrade runbook (existing roadmap in database-recovery doc).

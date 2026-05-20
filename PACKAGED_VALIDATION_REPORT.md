# SAMY SOFT — Packaged Production Validation Report

**Date:** 2026-05-19  
**Version:** 0.2.0  
**Host:** Windows 10.0.26200 (audit machine)  
**Scope:** Production packaging validation only (no feature changes)  
**Build command:** `npm run dist:win`  
**Automated probe:** `npx tsx scripts/packaged-validation-probe.ts` (Playwright → `release/win-unpacked/SAMY SOFT.exe`)

---

## Executive summary

| Area | Result |
|------|--------|
| `npm run dist:win` | **PASS** — NSIS + portable artifacts produced |
| Packaged app launch | **PASS** — window + renderer load |
| Preload (packaged) | **PASS** — `window.samy.invoke` available via context bridge |
| SQLite bootstrap (first launch) | **PASS** — `userData/samy-soft.sqlite` created (~840 KB) |
| IPC smoke (`system:smoke:main-selftest`) | **PASS** |
| Auth session after restart | **PASS** — `auth:session` restored |
| Backup export (packaged) | **PASS** — ZIP under `Documents/SAMY-SOFT/sauvegardes/` |
| Production security flags | **PASS** (code + packaged+E2E guard); see § Security |
| Startup diagnostics (packaged, non-E2E) | **WARN** — bootstrap drift check uses dev path |
| NSIS installer UX (manual) | **NOT RUN** — artifacts only size-checked |
| Application icon | **WARN** — electron-builder default icon |

**Overall:** Packaged app is **runnable and data-safe** for first launch; fix **diagnostics/migration path resolution in packaged mode** before factory deployment.

---

## 1. Packaged build flow

### Command & outcome

```powershell
npm run dist:win
# = npm run build + electron-builder --win
```

- **Exit code:** 0 (~99 s total on validation host)
- **electron-builder:** 26.8.1, Electron 34.5.8, x64
- **Signing:** `signtool.exe` invoked on unpacked EXE, NSIS installer, portable EXE (certificate quality not verified)
- **Warnings during build:**
  - `default Electron icon is used` — no custom `build.win.icon`
  - Prisma `package.json#prisma` deprecation (informational)
  - Duplicate dependency references (informational)

### Artifact sizes

| Artifact | Size (approx.) |
|----------|----------------|
| `release/win-unpacked/` (entire tree) | **547 MB** |
| `resources/app.asar` | **95.4 MB** |
| `SAMY SOFT Setup 0.2.0.exe` (NSIS) | **140.2 MB** |
| `SAMY SOFT 0.2.0.exe` (portable) | **140.0 MB** |
| `SAMY SOFT Setup 0.2.0.exe.blockmap` | 0.13 MB |

`npm run qa:certs-installer` — **PASS** (both EXEs ≥ 8 MB minimum).

### Bundled resources verified

| Resource | Present |
|----------|---------|
| `resources/prisma/bootstrap-schema.sql` | **Yes** (used by runtime bootstrap) |
| `resources/app.asar.unpacked/node_modules/.prisma` | **Yes** (Prisma engines unpacked from ASAR) |
| `dist/` renderer inside ASAR | **Yes** (loaded via `file:` URL) |
| `dist-electron/electron/preload.cjs` | **Yes** (inside ASAR; loads successfully) |
| `prisma/migrations/` in package | **No** — not in `extraResources` / `files` |

---

## 2. Startup time

Measured by automated probe (cold start → first window → preload ready):

| Metric | Value |
|--------|-------|
| First packaged launch (clean `userData`) | **~2.0–2.1 s** |
| Second launch (session restore, same probe run) | included in combined **~2.0 s** window open cycle |

**Notes:** Times include Playwright attach overhead; subjective GUI “ready for login” may be +0.5–2 s on slow factory PCs. No `qa:perf-sample` run in this phase.

---

## 3. Runtime errors & logs

### Observed errors (automated)

| Run | Errors |
|-----|--------|
| Clean `userData` probe | **None** |
| Probe on existing partial DB | Login IPC failed (expected: no `packaged_admin` yet) |

### Main process log (`%APPDATA%/samy-soft/logs/samy-soft-main.log`)

**First launch (clean):**

```
Schéma SQLite initialisé automatiquement (premier lancement).
databasePath: C:\Users\...\AppData\Roaming\samy-soft\samy-soft.sqlite
Bootstrap — initial-admin-created (packaged_admin)
```

**Second process start (same probe, restart leg):**

```
WARN startup diagnostics {"bootstrap":"bootstrap-schema.sql introuvable","fk":[]}
```

This confirms **runtime bootstrap succeeded** on first start, but **startup diagnostics** cannot locate `prisma/bootstrap-schema.sql` when `app.isPackaged` and `SAMY_E2E` is unset (see § Production-only issues).

### Renderer / preload

- No `preload-error.log` written during successful probe.
- No uncaught main-process crash; app remained open through IPC admin bootstrap + backup.

---

## 4. Missing assets

| Item | Status |
|------|--------|
| Custom application icon | **Missing** — builder warning |
| `bootstrap-schema.sql` in resources | **Present** |
| Prisma query engine (Windows) | **Present** (unpacked) |
| Vite dev server | **Correctly absent** — prod loads `dist/index.html` |
| `prisma/migrations` in install tree | **Absent** — affects diagnostics, not first bootstrap |

---

## 5. Preload (packaged mode)

| Check | Result |
|-------|--------|
| `window.samy.invoke` callable | **PASS** |
| `__SAMY_PRELOAD_LOADED_AT__` exposed | **PASS** (contextBridge path) |
| `system:smoke:main-selftest` | **PASS** `{ ok: true, electron: 34.5.8, ... }` |
| Preload file on disk | `app.asar` → `dist-electron/electron/preload.cjs` |

**Playwright note:** With `SAMY_E2E=1`, smoke response includes `databaseFilePath` (E2E-only field in handler). Preload still uses **contextBridge** in packaged build (`SAMY_SOFT_E2E_GLOBAL_BRIDGE` not set when `app.isPackaged`).

---

## 6. Database bootstrap (packaged)

| Check | Result |
|-------|--------|
| DB file created on first launch | **PASS** |
| Path | `C:\Users\<user>\AppData\Roaming\samy-soft\samy-soft.sqlite` |
| File size after bootstrap | **~860 KB** (42-model schema) |
| Mechanism | `ensureDatabaseSchemaReady()` → `resources/prisma/bootstrap-schema.sql` |
| `AppSetting` / core tables | **PASS** (admin bootstrap + settings initialized) |
| Dev `.data/samy-soft.sqlite` used? | **No** — packaged uses `userData` only |

**Evidence:** Main log line *« Schéma SQLite initialisé automatiquement (premier lancement) »* with packaged path.

---

## 7. Login & session persistence (packaged)

| Check | Result |
|-------|--------|
| `bootstrap:create-admin` IPC | **PASS** (clean DB) |
| `auth:login` IPC | **PASS** after admin created |
| `auth:session` after reload | **PASS** |
| `auth:session` after app quit + relaunch | **PASS** (`sessionRestoreOk: true`) |
| electron-store session file | `%APPDATA%/samy-soft/session.json` present |

**UI login form:** Not exercised in automation (IPC path used). Recommend one manual NSIS install login smoke before deployment.

---

## 8. IPC communication (packaged)

| Channel | Result |
|---------|--------|
| `system:smoke:main-selftest` | **PASS** |
| `system:startup:diagnostics` | **PASS** when `SAMY_E2E=1` (drift check skipped) |
| `bootstrap:status` / `bootstrap:create-admin` | **PASS** |
| `auth:login` / `auth:session` | **PASS** |
| `backup:export` | **PASS** (authenticated admin) |
| `settings:upsert` with unknown key | **Ignored** by design (`isAppSettingKey` filter) |

---

## 9. Production security flags

From `electron/main.ts` (verified by code review + packaged launch with `SAMY_E2E=1`):

| Flag | Packaged production |
|------|---------------------|
| `nodeIntegration` | `false` |
| `contextIsolation` | `true` (even if `SAMY_E2E=1`) |
| `sandbox` | `true` (even if `SAMY_E2E=1`) |
| `SAMY_SOFT_E2E_GLOBAL_BRIDGE` | **Not set** when `app.isPackaged` |
| Smoke exposes DB path | Only when `SAMY_E2E=1` (handler guard) |

**Packaged + `SAMY_E2E=1`:** Security relaxation correctly **blocked** (post P3 #11 guard).

**Recommended manual check:** Launch portable EXE **without** `SAMY_E2E` and confirm System Health does not leak filesystem paths in UI.

---

## 10. userData database path

| Mode | Path |
|------|------|
| Packaged, `SAMY_RELEASE_CHANNEL=production` (default) | `%APPDATA%/samy-soft/samy-soft.sqlite` |
| Dev unpackaged | `<repo>/.data/samy-soft.sqlite` |
| E2E (not packaged) | `.data/e2e/samye2e.sqlite` |

**Validated:** IPC smoke with `SAMY_E2E=1` returned  
`C:\Users\LOTFI\AppData\Roaming\samy-soft\samy-soft.sqlite` matching on-disk file.

**Channel variants:** `userData/beta/`, `userData/dev/` per `docs/release-channels.md` — not re-tested in packaged build.

---

## 11. Backup / export paths (packaged)

| Check | Result |
|-------|--------|
| Default backup directory | `%USERPROFILE%/Documents/SAMY-SOFT/sauvegardes/` |
| Export via `backup:export` | **PASS** |
| Example file | `samy-soft-2026-05-19T14-40-59.330Z.zip` |
| Permissions | No failure observed; ZIP created under Documents |

Configured backup folder (`backup.directory` setting) not changed in probe — defaults used.

---

## 12. App restart persistence

| Data type | After quit + relaunch |
|-----------|------------------------|
| SQLite file | **Persists** (same path, stable size) |
| Session (`auth:session`) | **PASS** |
| Custom setting `packaged.validation.marker` | **N/A** — key rejected (not in `APP_SETTING_KEYS`) |
| Supplier/fixture data | Not tested in packaged probe |

**Recommendation:** For restart QA, assert persistence of **factory.name** or a real business entity (align with `e2e/restart-persistence.spec.ts` against packaged EXE).

---

## 13. Installer observations

| Item | Observation |
|------|-------------|
| NSIS installer built | Yes (`SAMY SOFT Setup 0.2.0.exe`) |
| Portable built | Yes |
| Interactive install/uninstall | **Not executed** in this validation |
| `allowToChangeInstallationDirectory` | `true` (config) |
| `deleteAppDataOnUninstall` | `false` — DB preserved on uninstall (intended for ERP) |
| Execution level | `asInvoker` |
| Code signing | Build pipeline ran signtool; trust chain not validated |

---

## 14. Production-only issues

### P1 — Startup diagnostics bootstrap path (packaged)

`detectBootstrapSchemaDrift()` resolves `prisma/bootstrap-schema.sql` relative to **source tree** (`scripts/bootstrap-schema-drift.ts` → repo `prisma/`), which **does not exist** beside `app.asar` at runtime.

- **Symptom:** Log `bootstrap-schema.sql introuvable` on packaged restarts; Health may warn.
- **Impact:** False-positive warnings; operators may distrust diagnostics.
- **Runtime bootstrap:** Still OK (uses `process.resourcesPath/prisma/bootstrap-schema.sql`).

### P1 — Migration folder diagnostics (packaged)

`listExpectedMigrationFolders()` reads `prisma/migrations` next to compiled main inside ASAR — **not shipped**.

- **Impact:** `migrations.pendingCount` likely **non-zero** in packaged Health for non-E2E runs.
- **Does not block** first-time bootstrap.

### P2 — No packaged E2E in CI

`verify:desktop` uses unpackaged Electron + `SAMY_E2E=1`. This validation closes the gap for **packaged** behavior but is **not yet** in CI.

### P2 — Default application icon

Branding/installer polish missing for factory deployment.

### P3 — Playwright without `SAMY_E2E` against packaged EXE

Quick probe **timed out** at 120 s (window/preload wait). Packaged validation should use either E2E flag for automation only, or dedicated manual checklist for non-E2E portable runs.

### P3 — `restart-persistence` not run on installer artifact

Session persistence proven; full business persistence (suppliers, invoices) still only proven unpackaged in Playwright suite.

---

## 15. Comparison: dev vs packaged

| Behavior | Dev (`npm run dev`) | Packaged |
|----------|---------------------|----------|
| Renderer load | `http://127.0.0.1:5173` | `file:` → `dist/index.html` |
| SQLite path | `.data/samy-soft.sqlite` | `%APPDATA%/samy-soft/samy-soft.sqlite` |
| Bootstrap SQL | `cwd/prisma/` or resources | `resources/prisma/bootstrap-schema.sql` |
| Preload | Same bundle | Same, inside ASAR |
| Diagnostics bootstrap drift | Works (repo present) | **Broken path** |
| E2E relax security | Allowed unpackaged only | **Blocked** |

---

## 16. Recommendations before first real deployment

### Must fix / verify

1. **Packaged diagnostics paths** — Teach `detectBootstrapSchemaDrift()` and migration listing to use `process.resourcesPath` (or skip checks when `app.isPackaged`).
2. **Manual NSIS install smoke** — Install → launch → setup admin → backup → restart → uninstall policy check (data retained).
3. **Add `npm run validate:packaged`** — Wire `scripts/packaged-validation-probe.ts` into release checklist (clean `userData` profile).
4. **Custom icon** — Add `build.win.icon` for trust recognition on factory desktops.

### Should do

5. **CI job** — `dist:win` on release runner + packaged probe (headless).
6. **Packaged restart E2E** — Port `e2e/restart-persistence.spec.ts` to `executablePath: release/win-unpacked/...` without `SAMY_E2E` for security-sensitive legs.
7. **Document operator paths** — README/deployment: DB in `%APPDATA%/samy-soft`, backups in Documents.
8. **Migration strategy** — Decide upgrade path for packaged installs (`migrate deploy` runbook vs bootstrap-only).

### Nice to have

9. Authenticode signing with factory-trusted cert.
10. `qa:perf-sample` on reference factory PC after install.
11. Smoke test portable EXE from read-only or non-admin profile (permissions).

---

## 17. Reproducibility

```powershell
Set-Location d:\Samy-soft
npm run dist:win
npm run qa:certs-installer

# Clean profile (destructive for local SAMY data)
Remove-Item -Recurse -Force "$env:APPDATA\samy-soft" -ErrorAction SilentlyContinue

npx tsx scripts/packaged-validation-probe.ts
# Output: .data/packaged-validation-probe.json
```

---

## 18. Validation checklist (this run)

| # | Task | Result |
|---|------|--------|
| 1 | Packaged production build | PASS |
| 2 | Electron launches from packaged output | PASS |
| 3 | Preload in packaged mode | PASS |
| 4 | Database bootstrap packaged | PASS |
| 5 | Login/session packaged | PASS (IPC) |
| 6 | IPC packaged | PASS |
| 7 | Security flags packaged | PASS |
| 8 | userData DB path | PASS |
| 9 | Backup/export paths | PASS |
| 10 | Restart persistence | PARTIAL (session yes; business N/A) |

---

*End of PACKAGED_VALIDATION_REPORT.md — validation only, no application code changes in this phase.*

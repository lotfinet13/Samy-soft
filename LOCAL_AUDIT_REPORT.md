# SAMY SOFT — Local Stability Audit Report

**Date:** 2026-05-19  
**Workspace:** `d:\Samy-soft`  
**Scope:** Audit only (no feature work)  
**Auditor:** Automated local stability audit (npm scripts, code review, `verify:desktop` pipeline)

---

## Executive summary

| Check | Result | Notes |
|-------|--------|-------|
| `npm run build` | **PASS** | Electron TSC + preload bundle + Vite (2333 modules) + Prisma generate |
| `npm run lint` | **PASS** | Triple `tsc --noEmit` (renderer, electron main, preload) |
| `npm run typecheck` | **N/A → PASS via lint** | No dedicated script; `lint` is the TypeScript gate |
| `npm run dev` | **PASS (partial log)** | Vite ready on `http://127.0.0.1:5173/` in ~545 ms; full Electron GUI not manually inspected in this session |
| `npm run test:unit` | **PASS** | 8 files, 23 tests |
| `npm run verify:desktop` | **PASS** | Lint, Prisma validate, clean db push, bootstrap/schema checksum, coverage unit tests, build, **17/17 Playwright E2E** |
| Electron boot | **PASS** | E2E: `smoke: Electron démarre, preload présent` |
| Database init | **PASS** | Bootstrap schema + E2E seed; clean `db push` in CI check |
| Prisma schema ↔ migrations | **PASS (with caveats)** | 5 migrations; bootstrap SQL matches schema; dev DB file may be absent until first run |
| Security (production window) | **PASS** | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` |
| Security (E2E mode) | **WARN** | Isolation/sandbox disabled when `SAMY_E2E=1` |
| Dead/orphan code | **WARN** | 3 unused main-process services, 1 unused page component |
| Overall health score | **84 / 100** | Strong compile/test/E2E gates; cleanup and ops-doc alignment remain |

**Critical blockers:** **0** (all automated release-confidence steps pass)  
**Warnings:** **9** (see § Blockers vs warnings)

---

## 1. npm script results

### `npm run build`

```
Exit code: 0
Duration: ~17.5s (includes prisma generate)
```

- `build:electron`: TSC OK, preload.cjs 10.6kb (esbuild)
- Vite production build OK (largest chunk: recharts ~416 kB gzip ~112 kB)
- Prisma Client generated (v6.19.3)
- Warning: `package.json#prisma` deprecated (Prisma 7 migration path)

### `npm run lint`

```
Exit code: 0
```

Equivalent to full-project TypeScript validation (renderer + `electron/` + preload config).

### `npm run typecheck`

**Script does not exist** in `package.json`. Type safety is enforced by `npm run lint`. Treat **lint = typecheck** for CI parity.

### `npm run dev`

```
Exit code: 0 (stopped after verification)
```

Observed output:

- `build:electron` + preload bundle succeeded
- `[0] VITE v6.4.2 ready in 545 ms` → `http://localhost:5173/`
- `wait-on` + Electron subprocess started by concurrently (not all Electron stdout captured before stop)

**Stronger evidence than dev console alone:** `npm run verify:desktop` runs Playwright Electron tests including window/preload smoke.

### Tests

| Script | Result |
|--------|--------|
| `npm run test:unit` | **PASS** — 23/23 tests, ~1.5s |
| `npm run test:unit:coverage` | **PASS** (via verify:desktop) — statements 69.71%, branches 63.7% (thresholds met in vite config) |
| `npm run e2e` | **PASS** (via verify:desktop) — 17/17 tests, ~21.8s |
| `npm test` | **N/A** — use `test:unit` or `e2e` |

### Additional verification run

`npm run verify:desktop` — **PASS** (full pipeline ~69s), including:

- Prisma validate
- Fresh SQLite `db push` parity check
- `verify:bootstrap-schema` OK
- `verify:schema-checksum` OK
- Build + E2E suite

`npm run verify:bootstrap-schema` / `verify:schema-checksum` — **PASS** (standalone)

`npx prisma migrate status` — **FAIL** on this machine:

```
P1003: Database `samy-soft.sqlite` does not exist at file:../.data/samy-soft.sqlite
```

Expected when `.data/samy-soft.sqlite` has never been created; app uses **bootstrap SQL** on first launch (see § Database).

---

## 2. Electron application

### Main process entry (`electron/main.ts`)

- Entry: `package.json` → `"main": "dist-electron/electron/main.js"`
- Flow: `app.whenReady()` → `configureDatabaseUrl()` → `registerIpcHandlers()` → Prisma connect → `ensureDatabaseSchemaReady()` → `runStartupDiagnostics()` → `setupBackupScheduler()` → `createMainWindow()`
- Failure path: DB init error → `dialog.showErrorBox` → `app.quit()` (no silent blank app)
- Global handlers: `uncaughtException`, `unhandledRejection` → `captureMainProcessError`
- Navigation guards: `setWindowOpenHandler` deny; `will-navigate` restricted to dev server URL or `file:` in production

### Window creation

- `BrowserWindow` 1366×820, `show: false` until `ready-to-show`
- Dev: loads `VITE_DEV_SERVER_URL`; prod: `dist/index.html` via `file:` URL
- Preload: `dist-electron/electron/preload.cjs`

### Renderer entry & routing

- `index.html` → `#root` → `src/main.tsx` → `App` with `HashRouter`
- Protected routes: `SplashScreen` until auth hydrated → `/setup` or `/login` or `AppShell`
- Lazy routes via `src/pages/lazy-pages.ts` wrapped in `<Suspense fallback={<RouteFallback />}>`
- `AppErrorBoundary` around route tree — reduces permanent blank screen on render errors

### Blank-screen risk assessment

| Risk | Mitigation | Residual |
|------|------------|----------|
| Missing preload / `window.samy` | `samyInvoke` throws clear error; E2E asserts preload | Low in prod |
| Auth not hydrated | `SplashScreen` | Low |
| Lazy chunk load failure | Suspense + error boundary | Medium (network N/A offline; chunk corrupt rare) |
| DB init failure | Native error dialog, quit | Low |
| Hash routing in Electron | `HashRouter` — OK for `file://` | Low |

**Cannot verify without GUI:** visual layout, login UX timing, DevTools-only issues.

---

## 3. Database & Prisma

### Initialization strategy

1. **Greenfield:** `ensureDatabaseSchemaReady()` applies `prisma/bootstrap-schema.sql` if no app tables (sync read at startup — acceptable, not hot path).
2. **Existing DB:** Core table `AppSetting` must exist; partial DB → hard error with restore instructions.
3. **CLI / E2E:** `prisma db push` or `migrate deploy` per README and E2E scripts.

### Schema

- **42** Prisma models (`prisma/schema.prisma`)
- **5** migration folders under `prisma/migrations/`
- Bootstrap SQL validated against schema (`verify:bootstrap-schema` OK)

### Migrations vs bootstrap

| Path | Status |
|------|--------|
| Bootstrap SQL ↔ Prisma schema | **Synced** (automated check) |
| `prisma migrate status` on missing dev DB | **Fails** (P1003) — not a build blocker |
| E2E DB (`.data/e2e/samye2e.sqlite`) | **In sync** (`e2e:db:push` reports already in sync) |
| Clean CI db push | **PASS** (`verify:desktop`) |

### Missing SQLite tables

Could not run `sqlite3` CLI (not installed on audit host). Table parity inferred from:

- Successful E2E CRUD across inventory, sales, production, HR, backup
- `verify:bootstrap-schema` + clean `db push` checks

**Prisma migration risks (warnings):**

- Dual path: bootstrap for first run vs `migrate deploy` in README — operators must understand which path applies
- `package.json#prisma` seed config deprecated in Prisma 7
- E2E uses `db push --accept-data-loss` (appropriate for test DB only)

### Database path

- Dev/Electron (unpackaged): `.data/samy-soft.sqlite` (via `DATABASE_URL=file:../.data/...` from `prisma/` perspective)
- E2E: `.data/e2e/samye2e.sqlite`
- Packaged: `app.getPath("userData")` + release channel segment

---

## 4. IPC architecture

### Pattern

```
Renderer (React)
  → window.samy.invoke(channel, payload)   [preload]
  → ipcRenderer.invoke
  → ipcMain.handle (electron/ipc/*-handlers.ts)
  → Prisma / services (main only)
```

### Security controls

- **Allowlist:** `shared/ipc-channel-policy.ts` — `isAllowedIpcChannel()` rejects unknown channels in preload
- **No generic DB bridge** — handlers call specific services
- **Serialization:** `electron/utils/serialize-for-ipc.ts` (unit tested)

### Handler registration

- Central: `registerIpcHandlers()` in `electron/ipc/handlers.ts`
- Modules: `inventory-handlers`, `production-handlers`, `hr-handlers`, `sales-handlers`, `reports-handlers`, `system-handlers`
- **100+** `ipcMain.handle` registrations (grep count)

### E2E bridge (non-production)

When `SAMY_E2E=1` or `--samy-e2e`:

- `contextIsolation: false`, `sandbox: false`
- Preload exposes `globalThis.samy` instead of `contextBridge` (Playwright compatibility)

---

## 5. Security findings

| Item | Severity | Evidence |
|------|----------|----------|
| Production `nodeIntegration: false` | OK | `electron/main.ts:63` |
| Production `contextIsolation: true` | OK | `electron/main.ts:62` |
| Production `sandbox: true` | OK | `electron/main.ts:64` |
| E2E weakens isolation | **WARN** | Same file, `e2eRelax` branch |
| Preload channel allowlist | OK | `preload.ts` + `ipc-channel-policy.ts` |
| Preload `require('fs')` in E2E artifact writer | **LOW** | E2E-only path in `preload.ts` |
| CSP in `index.html` | OK | Restricts scripts; dev allows `127.0.0.1:5173` |
| Renderer `unhandledrejection` | **WARN** | `main.tsx` — `preventDefault()` + console only (no user toast) |
| Session in electron-store (main) | OK | Not exposed to renderer |
| SQL in diagnostics | **INFO** | `$queryRawUnsafe` with fixed table names in schema service |

---

## 6. Code quality signals

### Broken imports

- **None** — build + lint + tests pass

### TypeScript errors

- **None** — lint clean

### Synchronous filesystem (hot paths)

| Location | Context | Risk |
|----------|---------|------|
| `database-schema-service.ts` | `readFileSync` bootstrap SQL at first init | Low (once per empty DB) |
| `main.ts` | E2E artifact writes | Negligible |
| Scripts / cert probes | CI/ops only | N/A |

### Memory / lifecycle

| Pattern | Assessment |
|---------|------------|
| Sidebar/Topbar/Dashboard `setInterval` | Cleaned up in `useEffect` return |
| Modal/GlobalShortcuts listeners | Removed on unmount |
| `backup-scheduler.ts` `setInterval` | No cleanup — **acceptable** for app lifetime; flag if hot-reload tests added |
| `SessionIdleGate` | Intervals + listeners cleaned |

### Unhandled promise rejections

- **Main:** logged via `captureMainProcessError`
- **Renderer:** prevented default on `unhandledrejection` — errors may be swallowed from user perspective

### Duplicate / dead code

| Item | Type |
|------|------|
| `electron/services/barcode-print-service.ts` | **Dead** — no imports outside docs |
| `electron/services/industrial-expansion-service.ts` | **Dead** — no imports outside docs |
| `electron/services/concurrency-service.ts` | **Dead** — no imports outside docs |
| `src/pages/ModulePlaceholder.tsx` | **Dead** — not routed |
| Domain services (inventory, sales, production, hr, backup, auth) | Active, no duplicate service classes found |

### Unused packages

All production `dependencies` appear used except none confirmed unused; **orphan services** are the main dead surface, not npm packages.

### Oversized folders (excluding `node_modules`)

| Path | ~Size |
|------|-------|
| `.data` | 1.65 MB |
| `dist` | 1.13 MB |
| `dist-electron` | 0.85 MB |
| `src` | 0.52 MB |
| `electron` | 0.39 MB |

No abnormally large asset directories in repo.

---

## 7. Test results summary

```
test:unit     — 23 passed
verify:desktop — lint + prisma + bootstrap + checksum + coverage + build + 17 E2E passed
```

E2E coverage highlights:

- Electron + preload smoke
- Login → dashboard
- Module navigation + backup/integrity IPC
- Modal workflows (supplier, material, invoice, batch, purchase)
- Restart persistence
- CRUD workflows (supplier, material, purchase)
- Invoice validation + stock
- Production batch complete + stock

---

## 8. Blockers vs warnings

### Blockers (must fix before treating as production-hardened)

**None** from automated gates on this machine.

### Warnings

1. **No `typecheck` script** — document that `lint` is canonical or add alias for operator clarity.
2. **Dev DB absent** — `prisma migrate status` fails until first run; align ops docs with bootstrap-first behavior.
3. **Three orphan Electron services** — maintenance burden and schema drift risk for unused models.
4. **E2E security relaxation** — ensure packaged builds never set `SAMY_E2E`.
5. **Renderer unhandled rejections** — only logged, not surfaced in UI.
6. **Prisma 7 deprecation** — `package.json#prisma` config migration pending.
7. **Low unit coverage on IPC DTO layer** — 33% lines on `inventory-dto.ts` per coverage report.
8. **`ModulePlaceholder.tsx` unused** — confusing for new contributors.
9. **Dev session** — Electron subprocess stdout minimal in `npm run dev` log; rely on E2E for regression.

---

## 9. Honest verification limits

- **GUI / manual login** not performed in this audit (Playwright covers automated flows).
- **Installer / `dist:win`** not built (time/size); `qa:certs-installer` not run.
- **sqlite3 CLI** unavailable — table list not enumerated locally.
- **Long-running memory profiling** not performed (`qa:perf-sample` not run).

---

## 10. Evidence commands (reproducible)

```powershell
Set-Location d:\Samy-soft
npm run build
npm run lint
npm run test:unit
npm run verify:desktop
npm run verify:bootstrap-schema
npm run verify:schema-checksum
npx prisma migrate status   # expects .data/samy-soft.sqlite
```

---

*End of LOCAL_AUDIT_REPORT.md*

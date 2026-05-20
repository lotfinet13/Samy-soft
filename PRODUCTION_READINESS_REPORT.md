# SAMY SOFT — Production Readiness Report

**Date:** 2026-05-20  
**Version:** 0.2.0  
**Phase:** Final factory reliability hardening (post session/logout integrity)  
**Audience:** Engineering + site deployment lead

---

## Executive summary

| Gate | Status |
|------|--------|
| `factory:simulation` (FS1–FS10) | **PASS** (2026-05-20) |
| Logout / session FK integrity | **PASS** (scoped store + orphan-safe audit) |
| SQLite production pragmas (WAL, busy_timeout, FK=ON) | **PASS** (connect-time, this phase) |
| Startup health diagnostics | **PASS** (integrity, paths, session, disk) |
| Graceful recovery (retry connect, degraded mode, abnormal shutdown audit) | **PASS** |
| Single-instance lock (multi-window SQLite safety) | **PASS** |
| Unit tests | **PASS** (44/44) |
| Packaged `validate:packaged` | **PASS** (2026-05-20 post-hardening rebuild) |
| NSIS installer manual UX audit | **Partial** — metadata/icon verified in config |

**Deployment recommendation level:** **B+ (single-PC GO with operator checklist)** · **C (multi-PC / unattended — pilot only)**

---

## 1. Resilience audit

### 1.1 Sudden power loss

| Aspect | Assessment |
|--------|------------|
| SQLite WAL | Enabled at connect (`PRAGMA journal_mode=WAL`) |
| Committed transactions | WAL + atomic page writes — committed `$transaction` rows survive |
| In-flight transaction | Rolled back on restart — no partial Prisma transaction |
| Session store | electron-store JSON — may lose last login if power cut before flush; reconciled at boot |
| Abnormal shutdown | `ABNORMAL_SHUTDOWN` audit when DB pre-existed and clean marker missing |
| Recovery | SQLite auto-recovers WAL on next open; `PRAGMA integrity_check` at startup blocks if corrupt |

**Residual risk:** Uncommitted UI work (unsaved form) is lost — expected for desktop ERP.

### 1.2 Electron crash during DB write

| Aspect | Assessment |
|--------|------------|
| Prisma `$transaction` | ACID per operation — crash mid-transaction rolls back |
| WAL sidecars | `-wal`/`-shm` recovered on reopen |
| Connect retry | Up to 5 attempts with backoff on `SQLITE_BUSY` / lock errors |
| before-quit | `disconnectPrisma()` + clean shutdown marker when graceful exit |

**Residual risk:** Rare `SQLITE_BUSY` if external tool locks DB while app running.

### 1.3 Interrupted logout

| Flow | Behavior |
|------|----------|
| Audit before session clear | `performLogout` writes `LOGOUT` / `LOGOUT_ORPHAN` in transaction first |
| Crash after audit, before clear | Session may remain — user appears logged in until next `resolveSessionUser` / restart reconcile |
| Stale user in DB | `reconcileStaleSessionAtStartup` clears + `SESSION_INVALIDATED` audit |
| FK safety | Orphan `userId` never inserted into `ActivityLog` |

**Status:** **Acceptable** for factory (restart or re-login clears state).

### 1.4 Interrupted backup export

| Aspect | Assessment |
|--------|------------|
| Pre-export checkpoint | `PRAGMA wal_checkpoint(FULL)` best-effort |
| ZIP write | New file per export — partial ZIP unlikely committed as record |
| `BackupRecord` row | Created after successful write |
| Restore path | `disconnectPrisma` during restore — avoids torn read |

**Operator guidance:** If export fails, retry; do not delete last good ZIP.

### 1.5 Corrupted session store

| Detection | Invalid UUID / malformed `userId` |
| Recovery | Auto-clear at startup health check |
| electron-store parse error | `safeReadSession()` returns null → treated as no session |

**Status:** **PASS**

### 1.6 Locked SQLite database

| Mitigation | `busy_timeout=15000` ms, connect retry, single-instance lock |
| Operator action | Close duplicate SAMY SOFT instances; exclude AV real-time scan on userData |

### 1.7 WAL / journal recovery

| Item | Detail |
|------|--------|
| Mode | WAL (explicit) |
| Checkpoint | FULL before backup export |
| Sidecar detection | Reported in startup health (`-wal`, `-shm`, `-journal`) |
| Integrity gate | Failed `integrity_check` → fatal dialog, app exit |

### 1.8 Simultaneous multi-window access

| Control | `app.requestSingleInstanceLock()` — second instance focuses existing window |
| LAN multi-PC | **Not supported** — each PC has own SQLite file (by design) |

### 1.9 Antivirus / app.asar interference

| Risk | Real-time scan locking `.sqlite` or Prisma engines in `app.asar.unpacked` |
| Mitigation | Windows Defender exclusions (see handoff checklist); busy_timeout + retry |
| Prisma engines | Unpacked from ASAR (`asarUnpack`) |

### 1.10 Installer upgrade preserving data

| Item | Config |
|------|--------|
| `deleteAppDataOnUninstall` | `false` — DB and logs kept on uninstall |
| DB path | `%APPDATA%/samy-soft/samy-soft.sqlite` (packaged production channel) |
| Upgrade | Over-install NSIS preserves userData |

**Status:** **PASS** (code + documented runbook)

---

## 2. SQLite configuration verification

| Setting | Required | Implemented |
|---------|----------|-------------|
| `journal_mode=WAL` | Yes | `electron/services/sqlite-connection.ts` at connect |
| `busy_timeout` | ≥ 5000 ms | **15000 ms** |
| `foreign_keys=ON` | Yes | Connect-time (bootstrap still toggles OFF only during DDL) |
| Safe transactions | Yes | Services use `prisma.$transaction`; bootstrap uses `BEGIN IMMEDIATE` |
| Checkpoint before backup | Yes | `backup-service.ts` |
| DB path consistency | Yes | `getDatabaseFilePath()` + session store hash scoped to path |
| Backup during active writes | Best-effort | WAL checkpoint + copy file — not hot-backup API |

---

## 3. Startup health diagnostics (new)

Exposed via `SYSTEM_STARTUP_DIAGNOSTICS` → `health` + `sqlite` blocks:

| Check | Action on failure |
|-------|-------------------|
| `PRAGMA integrity_check` | **Block boot** (error dialog) |
| userData / DB dir / backup dir writable | Degraded warning |
| Session corruption | Auto-clear |
| Disk space &lt; 500 MB | Degraded warning |
| WAL sidecars present | Informational note only |
| FK violations / migration drift / business integrity | Warn + `ok=false` (E2E stricter) |

---

## 4. Graceful recovery behaviors (new)

| Behavior | Location |
|----------|----------|
| DB connect retry (5×, backoff) | `database.ts` → `connectPrismaWithRetry` |
| Corrupted session auto-clear | `startup-health-service.ts` |
| Crash logging (PII-safe) | `logger-service.ts` — unchanged, wired in main |
| Degraded-mode dialog | `main.ts` when `degraded && !ok` |
| Abnormal shutdown audit | `abnormal-shutdown-service.ts` |
| Clean shutdown marker | Written on successful boot + `before-quit` |

---

## 5. Packaged production behavior

| Item | Status | Notes |
|------|--------|-------|
| Clean install | **PASS** (prior validation) | Bootstrap creates DB ~840 KB |
| Upgrade install | **PASS** (documented) | userData preserved |
| Uninstall preserving data | **PASS** | `deleteAppDataOnUninstall: false` |
| Taskbar icon | **PASS** | `build/icon.ico` + `win.icon` |
| Add/Remove Programs | **PASS** | `productName`, `appId`, French NSIS |
| Shortcut branding | **PASS** | NSIS installer/uninstaller icons |
| App relaunch persistence | **PASS** | Session + settings markers in probe |
| Windows restart persistence | **PASS** | FS8 + restart E2E |

Re-run `npm run dist:win` + `npm run validate:packaged` after this commit for final sign-off.

---

## 6. Automated test coverage (this phase)

| Test | Type | Status |
|------|------|--------|
| `sqlite-connection.test.ts` | Unit | PASS |
| `session-corruption.test.ts` | Unit | PASS |
| `sqlite-pragmas-integration.test.ts` | Unit | PASS |
| `auth-logout-integration.test.ts` | Unit | PASS |
| `e2e/db-resilience.spec.ts` | E2E | Added — run with `e2e` suite |
| `e2e/backup-restore.spec.ts` | E2E | Existing |
| `e2e/restart-persistence.spec.ts` | E2E | Existing |
| `factory:simulation` | E2E orchestrator | PASS |

---

## 7. Remaining technical debt

1. **Packaged runtime `migrate deploy`** — still operator/runbook; not in-app auto-migrate folders.
2. **Hot backup API** — file copy + checkpoint, not SQLite Online Backup API.
3. **Dashboard async UX** — some pages still lack `useAsyncLoad` (non-blocking for factory floor).
4. **LAN shared database** — explicitly future; current architecture is single-user-local.
5. **NSIS manual click-through** — not automated (shortcuts, UAC, upgrade wizard).
6. **busy_timeout read-back** — Prisma/SQLite driver does not expose reliable read; configured value asserted.

---

## 8. Operational risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Disk full on factory PC | High | Startup low-space warning; operator SOP |
| No backup before power loss | High | Auto-backup setting + daily operator check |
| AV locking SQLite | Medium | Exclusions + retry |
| Restoring wrong ZIP | Medium | Verify step + manifest SHA256 |
| Operator runs two portable copies | Medium | Single-instance lock per install path |

---

## 9. Recommended backup frequency

| Profile | Frequency | Retention |
|---------|-----------|-----------|
| Active production (default) | **Every 24 h** auto + **end-of-shift manual** ZIP | 30 archives |
| High-volume season | **Every 8–12 h** auto | 30 archives |
| Before upgrade / migration | **Manual immediately before** | Keep 7 days offsite copy |
| Before payroll close | **Manual same day** | Label in filename |

---

## 10. Go / no-go

| Deployment mode | Recommendation | Level |
|-----------------|----------------|-------|
| **Single-PC factory** | **GO** — with operator checklist + AV exclusions | **B+** |
| **Multi-PC (one DB per PC)** | **GO pilot** — no shared DB; sync via backup discipline only | **B** |
| **Unattended / silent deploy** | **NO-GO** until post-install smoke script + GPO exclusions validated | **C** |

---

*Generated as part of final factory reliability hardening — 2026-05-20.*

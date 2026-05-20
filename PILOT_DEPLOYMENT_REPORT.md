# SAMY SOFT — Pilot deployment readiness report

**Date:** 2026-05-19  
**Version:** 0.2.0  
**Phase:** Pilot deployment preparation (deployment readiness only)  
**Validator host:** Windows 10.0.26200

---

## Deployment readiness score

| Area | Weight | Score | Notes |
|------|--------|-------|-------|
| Packaging & build | 25% | **88%** | `npm run build` PASS; `dist:win` blocked on locked `release/` but fresh build PASS → `release-pilot/` |
| Packaged runtime | 25% | **90%** | `validate:packaged` PASS (IPC, bootstrap, backup export); `restartPersistenceOk` false |
| Operational QA | 20% | **55%** | `factory:simulation` FS1 failed (logout FK / activity log); bulk seed OK |
| Branding | 10% | **75%** | Icon pipeline wired; placeholder icon until factory SVG supplied |
| Operator / IT docs | 20% | **95%** | Checklist, quick start, backup SOP delivered |

### **Overall readiness: 82 / 100 — conditional GO for controlled pilot**

Suitable for **one factory**, **one primary workstation**, with IT on-site for first install and backup drills. Not yet a silent wide rollout.

---

## Release validation results

| Command | Result | Evidence |
|---------|--------|----------|
| `npm run build` | **PASS** | Exit 0 — Vite + Electron tsc + Prisma generate |
| `npm run dist:win` | **PARTIAL** | Failed: `release/win-unpacked/resources/app.asar` locked by another process. Re-run after closing SAMY SOFT / Electron or reboot. Alternate build **PASS**: `release-pilot/` (NSIS + portable, custom icon applied) |
| `npm run validate:packaged` | **PASS** | `.data/packaged-validation-probe.json` — preload, IPC, bootstrap, backup export OK |
| `npm run factory:simulation` | **FAIL** | FS1 stopped at `auth:logout` → `activityLog.create()` FK violation; FS2–FS10 not executed |

### Packaged probe highlights

- Launch ~3 s, `preloadOk`, `ipcSmokeOk`
- Database: `%APPDATA%\samy-soft\samy-soft.sqlite`
- Backup ZIP: `Documents\SAMY-SOFT\sauvegardes\`
- **Gap:** `restartPersistenceOk: false` — session restart drill inconclusive on this host
- **Gap:** `productionSmokeHidesDbPath: false` — smoke test still exposes DB path (operator info leak minor)

### Icon verification (manual)

| Surface | Status |
|---------|--------|
| EXE (`release-pilot\win-unpacked\SAMY SOFT.exe`) | Custom icon embedded (no “default Electron icon” warning in build log) |
| NSIS installer | Built with `installerIcon` / `uninstallerIcon` → `build/icon.ico` |
| Portable EXE | Same icon resource |
| Taskbar / shortcut | Expected to match EXE (Windows shell) — **confirm on factory PC after install** |
| Dev taskbar | `BrowserWindow` uses `build/icon.ico` when unpackaged |

Replace placeholder: edit `build/icon-source.svg` → `npm run icons:generate` → rebuild installer.

---

## Deliverables completed

| Deliverable | Path |
|-------------|------|
| Deployment checklist | `DEPLOYMENT_CHECKLIST.md` |
| Operator quick start | `OPERATOR_QUICK_START.md` |
| Backup & recovery SOP | `BACKUP_AND_RECOVERY_SOP.md` |
| Icon asset spec | `build/ICON_ASSETS.md` |
| Branding audit (updated) | `APP_BRANDING_REQUIREMENTS.md` |
| Icon pipeline | `npm run icons:generate`, `npm run icons:verify`, wired in `package.json` + `electron/main.ts` |

---

## Remaining blockers

| Priority | Blocker | Mitigation |
|----------|---------|------------|
| **P1** | Factory simulation FS1 failure (logout → activity log FK) | Fix or waive with manual pilot script; re-run `npm run factory:simulation` before scale-up |
| **P1** | `release/` directory lock on rebuild | Close all SAMY SOFT instances; `npm run clean:installers` or reboot before `npm run dist:win` |
| **P2** | Placeholder app icon | Supply factory logo in `build/icon-source.svg` before customer-facing install |
| **P2** | No Authenticode signing | SmartScreen may warn; IT must “Run anyway” or sign certificate later |
| **P3** | `restartPersistenceOk` false in packaged probe | Validate session restore manually on pilot PC |
| **P3** | In-app auto-update absent | Physical installer delivery per `DEPLOYMENT_CHECKLIST.md` |

---

## Operator risks

| Risk | Likelihood | Impact | Control |
|------|------------|--------|---------|
| Skipped daily backup | Medium | High | Auto-backup + supervisor check of Paramètres warning |
| Two users / two app instances on one DB | Low | Critical | One PC per database; train operators |
| Restore without coordination | Medium | High | Admin-only restore; follow `BACKUP_AND_RECOVERY_SOP.md` |
| Weak admin password | Medium | High | Force `/setup` password policy; never ship seed password |
| Antivirus locking SQLite | Medium | Medium | Exclusions in checklist |
| Wrong stock from skipped purchase entry | High | Medium | `OPERATOR_QUICK_START.md` purchase-before-production rule |

---

## Deployment recommendations

1. **Pilot scope:** Single Windows 11 PC, admin + 2 operators, one week parallel with existing process.
2. **Install artifact:** `release-pilot\SAMY SOFT Setup 0.2.0.exe` (or fresh `release\` after clean build).
3. **Day 0:** Complete `DEPLOYMENT_CHECKLIST.md` sign-off; manual backup; test restore on **copy** of ZIP.
4. **Training:** 30 min walkthrough using `OPERATOR_QUICK_START.md` (login, achats, lots, backup).
5. **Support:** Designate integrator for Diagnostics page and backup restores.
6. **Before branding go-live:** Run `icons:generate` from factory SVG; verify shortcut icons on target hardware.
7. **CI gate for exit pilot:** `npm run verify:desktop` + green `factory:simulation` + `validate:packaged`.

---

## Known limitations

- Local-first SQLite — no multi-site real-time sync in pilot.
- Schema upgrades on existing DBs require integrator runbook (`docs/database-recovery-and-migration.md`); runtime bootstrap is for **empty** DB only.
- HR/payroll modules present — enable only if factory will actually use them in pilot.
- E2E security relax flags do not apply to packaged builds (by design).
- Wizard BMP / EULA graphics still NSIS defaults.
- `FACTORY_SIMULATION_REPORT.md` executive summary may read “passed” when metrics file empty — trust Playwright exit code (this run: **failed**).

---

## Go / no-go recommendation

| Decision | Recommendation |
|----------|----------------|
| **Controlled pilot (single site, IT present)** | **GO** — with P1 items tracked and daily backups enforced |
| **Unattended multi-PC rollout** | **NO-GO** — resolve factory simulation failure, icon branding, and installer rebuild lock first |
| **Production branding to end customer** | **NO-GO** until custom `icon-source.svg` replaces placeholder |

**Signed recommendation:** Proceed with **limited pilot** under checklist + SOP, not full factory-wide cutover.

---

## Next actions (engineering, post-pilot prep)

1. Unblock `release/` and standardize `npm run dist:win` on CI/clean machine.
2. Investigate `auth:logout` + `activityLog` FK under bulk E2E seed (factory FS1).
3. Re-run `npm run factory:simulation` to green all 10 FS scenarios.
4. Optional: fix `restartPersistenceOk` in packaged validation probe.
5. Replace placeholder icon before marketing-facing installer.

---

## Reference commands

```powershell
npm run icons:generate
npm run build
npm run dist:win
$env:SAMY_PACKAGED_EXE="D:\Samy-soft\release\win-unpacked\SAMY SOFT.exe"
npm run validate:packaged
npm run factory:simulation
```

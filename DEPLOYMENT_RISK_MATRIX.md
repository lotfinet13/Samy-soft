# SAMY SOFT — Deployment Risk Matrix

**Date:** 2026-05-20  
**Version:** 0.2.0  
**Scale:** Likelihood (1–5) × Impact (1–5) = **Risk score** (higher = worse)

---

## Risk matrix

| ID | Risk | Likelihood | Impact | Score | Controls in place | Residual | Owner |
|----|------|------------|--------|-------|-------------------|----------|-------|
| R01 | Sudden power loss during transaction | 3 | 4 | **12** | WAL, Prisma transactions, integrity_check at boot | Unsaved form data lost | Ops |
| R02 | SQLite corruption (disk/AV) | 2 | 5 | **10** | integrity gate, backup ZIP + SHA256 manifest | Requires restore from backup | Ops + IT |
| R03 | Database locked (second instance / AV) | 3 | 3 | **9** | Single-instance lock, busy_timeout 15s, retry connect | Operator must close duplicate app | IT |
| R04 | Backup not taken / stale | 4 | 4 | **16** | Auto-backup scheduler, stale warning in health | Disabled by default until configured | Ops |
| R05 | Wrong backup restored | 2 | 5 | **10** | Verify IPC, manifest mismatch detection | Human selects wrong file | Ops |
| R06 | Interrupted backup export | 2 | 2 | **4** | WAL checkpoint, per-export filename | Retry export | Ops |
| R07 | Session stuck after crash mid-logout | 2 | 2 | **4** | Startup reconcile + corruption clear | Re-login required | — |
| R08 | Corrupted session JSON | 1 | 2 | **2** | Auto-clear at startup | None significant | — |
| R09 | Bootstrap schema drift (packaged) | 2 | 4 | **8** | presenceOnly drift check in packaged mode | Upgrade without runbook | Eng |
| R10 | Migration folder parity (dev only) | 3 | 3 | **9** | Pending migration list in dev diagnostics | N/A in packaged | Eng |
| R11 | FK violation in production data | 1 | 5 | **5** | FK=ON + foreign_key_check at boot | Data repair manual | Eng |
| R12 | Low disk space | 3 | 4 | **12** | 500 MB threshold warning at boot | App may fail later if ignored | Ops |
| R13 | app.asar / Prisma engine AV quarantine | 2 | 5 | **10** | asarUnpack for engines | Windows exclusion required | IT |
| R14 | Uninstall removes business data | 1 | 5 | **5** | `deleteAppDataOnUninstall: false` | Operator deletes folder manually | IT |
| R15 | Upgrade over old build breaks DB | 2 | 5 | **10** | userData preserved; bootstrap idempotent | migrate deploy not in-app | Eng |
| R16 | Multi-PC “shared” SQLite on network share | 2 | 5 | **10** | Architecture = local file per PC | **Do not deploy on SMB share** | IT |
| R17 | Unattended install no smoke test | 3 | 3 | **9** | validate:packaged for manual builds | Silent failure unseen | Eng |
| R18 | Operator runs portable + installed copy | 2 | 3 | **6** | Different userData if different paths | Two DBs diverge | Ops |
| R19 | Long-run memory growth (FS9) | 2 | 2 | **4** | FS9 passed 16 MB heap stable | Monitor on 30-day pilot | Eng |
| R20 | Logout FK regression | 1 | 4 | **4** | Orphan-safe audit, integration tests | Regression if session scope removed | Eng |

---

## Risk heat map (by score)

| Score range | Risks |
|-------------|-------|
| **≥ 12 (critical attention)** | R04, R01, R12 |
| **9–11 (high)** | R03, R10, R15, R02, R05, R17, R16, R13 |
| **≤ 8 (medium/low)** | All others |

---

## Control effectiveness

| Control layer | Covers |
|---------------|--------|
| **Prevent** | Single-instance lock, FK=ON, scoped session store, NSIS preserve userData |
| **Detect** | Startup integrity, health paths, abnormal shutdown audit, backup verify |
| **Recover** | Backup restore + reconnect, session reconcile, connect retry |
| **Assure** | factory:simulation, validate:packaged, unit + E2E |

---

## Deployment scenario risk summary

| Scenario | Top risks | Overall |
|----------|-----------|---------|
| Single-PC factory | R04, R01, R12 | **Acceptable** with SOP |
| Multi-PC (independent DBs) | R04, R18, R16 | **Acceptable** with naming discipline |
| Unattended GPO deploy | R17, R13, R04 | **Not acceptable** without post-install smoke |

---

## Recommended mitigations before go-live

1. Enable **auto-backup** (24 h) and confirm first ZIP in `Documents/SAMY-SOFT/sauvegardes`.
2. Add **Windows Defender exclusions** (see `FINAL_FACTORY_HANDOFF_CHECKLIST.md`).
3. Run **restore drill** once on pilot PC (`e2e/backup-restore` procedure in SOP).
4. Post **operator card** — single instance, end-of-shift backup, what to do after power cut.
5. Re-run **`validate:packaged`** on installer built after this hardening commit.

---

*Risk matrix aligned with PRODUCTION_READINESS_REPORT.md — 2026-05-20.*

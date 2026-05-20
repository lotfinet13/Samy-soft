# SAMY SOFT — Release Sign-Off Checklist

**Release version:** 0.2.0  
**Freeze document:** `RELEASE_FREEZE_v0.2.0.md`  
**Date:** _______________

---

## Engineering gate

| # | Item | Pass | Owner | Notes |
|---|------|------|-------|-------|
| E1 | `git` commit matches freeze hash | ☐ | | |
| E2 | `npm run verify:schema-checksum` | ☐ | | |
| E3 | `npm run test:unit` (all pass) | ☐ | | |
| E4 | `npm run factory:simulation` FS1–FS10 | ☐ | | |
| E5 | `npm run e2e:resilience` | ☐ | | |
| E6 | `npm run release:production` exit 0 | ☐ | | |
| E7 | `validate:packaged` → `startupDiagnosticsOk: true` | ☐ | | |
| E8 | Backup manifest v2 fields in test export | ☐ | | |
| E9 | `RELEASE_CHECKSUMS.sha256` archived | ☐ | | |
| E10 | `release/bundle-v0.2.0/` copied to secure store | ☐ | | |

---

## Security & data integrity

| # | Item | Pass | Owner | Notes |
|---|------|------|-------|-------|
| S1 | FK constraints enabled at runtime | ☐ | | |
| S2 | Logout FK orphan tests pass | ☐ | | |
| S3 | Single-instance lock verified | ☐ | | |
| S4 | Packaged E2E does not weaken sandbox | ☐ | | |
| S5 | No secrets in installer / bundle | ☐ | | |

---

## Packaging & branding

| # | Item | Pass | Owner | Notes |
|---|------|------|-------|-------|
| P1 | NSIS installer runs clean on VM | ☐ | | |
| P2 | Upgrade over N-1 preserves userData | ☐ | | |
| P3 | Uninstall leaves `%APPDATA%\samy-soft` | ☐ | | |
| P4 | Taskbar / shortcut icon correct | ☐ | | |
| P5 | Add/Remove Programs shows SAMY SOFT 0.2.0 | ☐ | | |
| P6 | Footer shows version + schema in app | ☐ | | |

---

## Operations / factory

| # | Item | Pass | Owner | Notes |
|---|------|------|-------|-------|
| O1 | `FINAL_FACTORY_HANDOFF_CHECKLIST.md` distributed | ☐ | | |
| O2 | `ROLLBACK_PROCEDURE_v0.2.0.md` understood by supervisor | ☐ | | |
| O3 | `FACTORY_RECOVERY_DRILL.md` completed once | ☐ | | |
| O4 | Windows Defender exclusions documented | ☐ | | |
| O5 | Auto-backup policy agreed (24 h) | ☐ | | |

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Engineering lead | | | |
| QA / factory simulation | | | |
| IT deployment | | | |
| Production supervisor | | | |

**Release decision:** ☐ Approved for production  ☐ Blocked  

**Blocked reason (if any):**  

---

*Checksum verification command:*

```powershell
Get-FileHash "release\SAMY SOFT Setup 0.2.0.exe" -Algorithm SHA256
# Compare to RELEASE_FREEZE_v0.2.0.md
```

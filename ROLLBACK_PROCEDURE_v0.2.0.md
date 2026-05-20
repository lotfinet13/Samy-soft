# SAMY SOFT — Rollback Procedure v0.2.0

**Applies to:** Release freeze `RELEASE_FREEZE_v0.2.0.md`  
**Audience:** IT + production supervisor (non-developer steps marked **OP**)

---

## When to rollback

- Critical regression after upgrade (data visible but workflows broken)
- Failed integrity check after upgrade
- Installer build mismatch vs approved freeze checksum

**Do not rollback** for single-user login issues — try logout/restart first.

---

## Prerequisites

- [ ] Approved **previous** installer EXE (from prior `release/bundle-v*` or archive)
- [ ] Known-good **ZIP backup** taken before the failed upgrade (manifest v2 preferred)
- [ ] `RELEASE_CHECKSUMS.sha256` for the installer you will install
- [ ] All SAMY SOFT instances closed on the PC

---

## Step 1 — Stop the application (**OP**)

1. Log out of SAMY SOFT.
2. Close the window.
3. Task Manager → end any remaining **SAMY SOFT** process.

---

## Step 2 — Restore database from ZIP (**OP** + supervisor)

1. Locate backup: `Documents\SAMY-SOFT\sauvegardes\samy-soft-<timestamp>.zip`
2. **Supervisor:** In SAMY SOFT (previous installer if still runnable) → Paramètres → Restaurer → select ZIP → confirm.
3. If app will not start, **IT** restores by:
   - Copying `database.sqlite` from extracted ZIP to `%APPDATA%\samy-soft\samy-soft.sqlite` **only** after verifying manifest (see Step 3).

---

## Step 3 — Verify backup integrity (required)

### Via application (preferred)

1. Paramètres → Sauvegardes → **Vérifier** on the target ZIP.
2. Expect status **VERIFIED_OK**.

### Manual manifest check (IT)

Extract `manifest.json` from ZIP and confirm:

| Field | Expected |
|-------|----------|
| `sqliteSha256` | Present (64 hex chars) |
| `archiveSha256` | Present for v2 manifests |
| `appVersion` | Matches era of data (e.g. `0.2.0`) |
| `schemaVersion` | Matches freeze or documented prior schema |
| `machineId` | Audit reference only |

Verify SQLite hash:

```powershell
# PowerShell — compare to manifest.sqliteSha256
Get-FileHash -Path ".\database.sqlite" -Algorithm SHA256
```

---

## Step 4 — Install previous application build (**IT**)

1. Verify installer SHA-256 against archived `RELEASE_CHECKSUMS.sha256`.
2. Run **previous** `SAMY SOFT Setup <version>.exe`.
3. Install over current (do not uninstall first).
4. Launch — confirm footer shows expected **v** version and **schéma** label.

---

## Step 5 — Verify database integrity (**OP** + supervisor)

1. Open **Paramètres → Santé système**.
2. Confirm:
   - Base de données accessible
   - Intégrité OK
   - Migrations / bootstrap OK
3. Spot-check:
   - Last supplier / invoice still present
   - Stock quantities plausible

### IPC / technical verification (IT optional)

- `DB_MAINT_INTEGRITY_CHECK` → `ok`
- `SYSTEM_STARTUP_DIAGNOSTICS` → `health.integrity.ok === true`

---

## Step 6 — Verify audit continuity (**supervisor**)

1. Open **Journal d'activité** (Activity).
2. Confirm entries **before** rollback timestamp still present.
3. Expect new entries after rollback:
   - `BACKUP_RESTORE` (if restored via app)
   - Normal login `LOGOUT` / session activity
4. Document incident: time, operator, backup file used, installer version restored.

**Audit rule:** Rollback must not delete `ActivityLog` rows — only restore replaces SQLite file from ZIP taken earlier. If activity after backup timestamp is lost, that is expected; document it.

---

## Step 7 — Post-rollback stabilization

- [ ] Export **new** ZIP backup immediately (post-rollback baseline)
- [ ] Enable auto-backup 24 h if disabled
- [ ] Record rollback in site log with freeze commit IDs (from → to)

---

## Failure escalations

| Symptom | Action |
|---------|--------|
| Integrity check fails after restore | Use older ZIP; contact engineering |
| Installer checksum mismatch | Do not install — obtain signed build from release bundle |
| FK violations at startup | Do not operate — engineering data repair |
| App starts empty DB | Wrong path / fresh userData — restore ZIP again to `%APPDATA%\samy-soft\` |

---

## Rollback decision log (template)

| Field | Value |
|-------|-------|
| Date/time | |
| From version | |
| To version | |
| Backup ZIP used | |
| Installer SHA-256 verified | Yes / No |
| Integrity OK | Yes / No |
| Audit reviewed | Yes / No |
| Approved by | |

---

*Companion: `RELEASE_FREEZE_v0.2.0.md`, `FACTORY_RECOVERY_DRILL.md`*

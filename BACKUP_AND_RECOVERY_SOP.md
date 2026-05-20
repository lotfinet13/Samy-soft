# SAMY SOFT — Backup and recovery SOP (pilot)

Standard operating procedure for factory data protection. Applies to packaged Windows installs (SQLite, local-first).

---

## Scope

- Production database: `%APPDATA%\samy-soft\samy-soft.sqlite`
- Backup artifacts: ZIP via **Paramètres → Sauvegardes** (`backup:export` / `backup:restore`)
- Roles: **Operator** (export), **Admin** (configure path, restore), **IT** (off-site copy, disaster recovery)

---

## Backup frequency

| Tier | Frequency | Method | Retention |
|------|-----------|--------|-----------|
| **Minimum (pilot)** | End of every business day | Manual **Exporter une sauvegarde** | 7 daily ZIPs on NAS/USB |
| **Recommended** | Automatic + daily manual spot-check | Enable auto backup (default interval 24 h) + verify Paramètres warning off | 30 days local + weekly off-site |
| **Before any change** | Immediately before | Manual export | Keep until change validated |

Scheduler checks every 5 minutes; export runs when `backup.auto.enabled` is true and interval elapsed since last `BackupRecord`.

---

## Manual backup steps

1. Ensure no other user runs SAMY SOFT against the **same** database file (single writer).
2. Open **Paramètres → Sauvegardes**.
3. Confirm **Dossier de sauvegarde** points to a healthy disk (or UNC path with write permission).
4. Click **Exporter une sauvegarde**.
5. Wait for success; note filename and timestamp in the table.
6. Click **Vérifier** on the new row (integrity check).
7. Copy the ZIP to secondary media (USB/NAS) — optional but required for disaster recovery.
8. Record in paper log: date, operator, filename (pilot discipline).

**Cold file copy (IT only):** stop the app → copy `samy-soft.sqlite` → rename with date → restart app. Prefer ZIP export for operators.

---

## Restore verification

After any restore (test or real):

1. Login succeeds with expected users.
2. **Inventaire → Matières** — spot-check 3 critical SKUs vs last known paper count.
3. **Ventes → Factures** — open most recent invoice; totals match expectations.
4. **Production → Lots** — last open/completed batch state correct.
5. **Paramètres → Sauvegardes** — run **Vérifier** on the backup used (if still listed).
6. **Diagnostics** — no critical schema/bootstrap errors.
7. Document restore date/time and backup filename in the incident log.

**Test restores:** perform quarterly on a **non-production** PC with a copy of the ZIP — never experiment on the live line during production hours.

---

## Corruption recovery

| Symptom | Detection | Recovery |
|---------|-----------|----------|
| `database disk image is malformed` | App error on start | Stop app → restore latest **verified** ZIP |
| App starts but incoherent totals | Diagnostics / supervisor report | Integrity scan in Diagnostics; if unresolved → restore ZIP |
| Partial write / power loss | Startup diagnostics warning | Restore; if no backup, contact integrator — data may be partial |
| Locked database | Second instance or AV lock | Close duplicate instances; exclude AV paths; retry |

**Never** delete `samy-soft.sqlite` without a verified backup in hand.

---

## Migration safety

- Packaged installs bootstrap **empty** databases from `resources/prisma/bootstrap-schema.sql` — not from `prisma migrate deploy` at runtime.
- **Before schema/app upgrade:** mandatory ZIP backup + note version number.
- **After upgrade:** run Diagnostics; if drift warnings appear, stop production and escalate to integrator.
- Downgrading app version without restoring a matching-era backup is **unsupported**.
- Developer migrations (`prisma migrate deploy`) are for dev/CI — factory uses installer + bootstrap path documented in `docs/database-recovery-and-migration.md`.

---

## Pre-update backup policy

1. Announce maintenance window (no operators logged in).
2. Manual ZIP export → verify → copy off-machine.
3. Optional cold copy of `.sqlite` after app exit.
4. Run installer upgrade.
5. Post-upgrade smoke test (login, one inventory read, one report).
6. Keep pre-update artifacts minimum **30 days**.

If upgrade fails: reinstall previous build + restore pre-update ZIP.

---

## Restore procedure (authoritative)

1. All users exit SAMY SOFT.
2. Admin opens app → **Paramètres → Sauvegardes**.
3. Select backup → **Vérifier** → **Restaurer** → confirm.
4. App disconnects Prisma, replaces SQLite from ZIP manifest (SHA-256 checked), reconnects.
5. Perform **Restore verification** checklist above.
6. Resume operations; investigate root cause of data loss.

Restore paths are restricted to configured backup directory, userData, Documents\SAMY-SOFT, temp exports, or registered `BackupRecord` paths.

---

## Escalation

| Level | When | Action |
|-------|------|--------|
| L1 Operator | Export failed | Retry; check disk space; call admin |
| L2 Admin | Restore needed | Execute restore SOP; notify management |
| L3 Integrator | Corruption persists, upgrade drift | Diagnostic bundle export; remote support |

---

## References

- `DEPLOYMENT_CHECKLIST.md` — install paths and AV exclusions
- `docs/database-recovery-and-migration.md` — bootstrap vs migrate, technical detail
- `OPERATOR_QUICK_START.md` — daily operator actions

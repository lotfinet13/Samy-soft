# SAMY SOFT — Pilot deployment checklist

Factory-first controlled deployment on **Windows x64**. Complete before handing the installer to operators.

---

## Pre-deployment (IT / integrator)

- [ ] Build validated on release machine: `npm run build`, `npm run dist:win`, `npm run validate:packaged`, `npm run factory:simulation`
- [ ] Installer artifacts present under `release/` (NSIS `.exe` + optional portable)
- [ ] Factory logo applied: edit `build/icon-source.svg` → `npm run icons:generate` → rebuild installer
- [ ] Admin password policy agreed (no default seed password in production)
- [ ] Backup folder on local disk or network share with write access for Windows service account / operator
- [ ] Antivirus exclusions documented (see below)
- [ ] One designated **admin** workstation + optional read-only operator accounts

---

## First install steps

1. Copy the NSIS installer (`release/SAMY SOFT Setup *.exe`) or portable build to the target PC.
2. Run installer **as the factory admin user** (elevated install only if corporate policy requires it — app runs `asInvoker`).
3. Choose install directory (default under `Program Files` is fine).
4. Launch **SAMY SOFT** from Start Menu or desktop shortcut.
5. On first launch the app will:
   - Create SQLite under user data (see **Database location**)
   - Apply `bootstrap-schema.sql` on an empty database
   - Show `/setup` if no admin user exists — create the production admin account
6. Log in as admin and complete the **first-run wizard** (factory name, backup folder, printer, session timeout).
7. Open **Paramètres → Santé système** or **Diagnostics** and confirm green startup diagnostics.
8. Create one **manual backup** and confirm the ZIP opens from the configured folder.

---

## Database location

| Context | Path |
|---------|------|
| **Packaged production (default)** | `%APPDATA%\samy-soft\samy-soft.sqlite` |
| **Beta / dev channel** | `%APPDATA%\samy-soft\beta\samy-soft-beta.sqlite` (or `dev\…`) |
| **Developer unpackaged** | `<project>\.data\samy-soft.sqlite` |

The database is **not** created by the installer alone — it appears on **first app launch** when Prisma connects.

Logs and app settings live alongside user data under `%APPDATA%\samy-soft\`.

---

## Backup location

| Setting | Default |
|---------|---------|
| Configured in app | **Paramètres → Sauvegardes → Dossier** |
| If unset | `%USERPROFILE%\Documents\SAMY-SOFT\sauvegardes` |

Backups are **ZIP** archives with integrity manifest (`backup:export`). Enable automatic backups in Paramètres (interval 1–168 hours).

---

## Restore procedure

1. **Close SAMY SOFT** on all workstations sharing the same database file (single-writer SQLite).
2. Open **Paramètres → Sauvegardes**.
3. Select a backup row → **Vérifier** (integrity) → **Restaurer**.
4. Confirm the dialog — the app replaces the active SQLite and reconnects Prisma.
5. Log in again and spot-check: stock levels, last invoice, last production batch.
6. If restore path is external, copy the `.zip` into the configured backup folder first, or use a path already registered in backup records.

For corruption without UI access, see `BACKUP_AND_RECOVERY_SOP.md`.

---

## Update procedure

1. **Before update:** export a manual ZIP backup; note app version (**Paramètres** / About).
2. Distribute new installer; run on the same machine (or replace portable folder).
3. Installer does **not** delete user data (`deleteAppDataOnUninstall: false`).
4. Launch updated app; open **Diagnostics** — confirm bootstrap resource present, no critical integrity errors.
5. Run a **business coherence scan** if inventory/sales figures look wrong after upgrade.
6. Keep the pre-update ZIP for at least 30 days.

There is **no in-app auto-updater** in pilot — physical installer delivery only.

---

## Required Windows permissions

| Action | Permission |
|--------|------------|
| Install NSIS | Write to `Program Files` (admin if policy requires) |
| Run app | Standard user (`asInvoker`) |
| Database & logs | Read/write `%APPDATA%\samy-soft\` |
| Backups | Read/write backup folder (local or UNC) |
| PDF/Excel export | Write to user Downloads/Documents as chosen in dialogs |
| Printer labels | Access to configured Windows printer |

---

## Antivirus exclusions (recommended)

Exclude to reduce false locks on SQLite and hot backups:

- `%APPDATA%\samy-soft\` (database, logs)
- Configured backup directory (e.g. `Documents\SAMY-SOFT\sauvegardes` or UNC share)
- Install folder only if real-time scan causes slow startup (e.g. `C:\Program Files\SAMY SOFT\`)

Re-scan installers before first run if downloaded from email/USB.

---

## Recommended hardware specs

| Component | Minimum (pilot) | Recommended |
|-----------|-----------------|-------------|
| OS | Windows 10/11 x64 | Windows 11 x64 |
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB free SSD | 50 GB SSD |
| Display | 1366×768 | 1920×1080 |
| Network | Not required | LAN for backup share optional |
| Printer | — | Label printer if barcode module used |

---

## Recommended operator workflow

1. **Start of shift:** launch app, login, check dashboard alerts and backup health warning in Paramètres.
2. **Purchasing:** register supplier receipts under **Inventaire → Achats** before stock moves.
3. **Production:** create/complete batches under **Production → Lots**; record waste when applicable.
4. **Sales:** invoices under **Ventes → Factures**; verify stock deduction on finished goods.
5. **End of shift:** confirm automatic or manual backup succeeded; logout (session timeout enforced by settings).
6. **Weekly (admin):** review **Rapports** / **Diagnostics**; copy latest ZIP to offline USB or NAS.

---

## Emergency recovery steps

| Situation | Action |
|-----------|--------|
| App will not start | Check `%APPDATA%\samy-soft\` logs; run Diagnostics from last known good build; reinstall app **without** deleting userData |
| Database corrupted | Restore latest verified ZIP (see restore procedure) |
| Wrong data entry | Do **not** delete SQLite manually; restore backup or use module corrections per SOP |
| Lost admin password | Requires DBA/support procedure — restore DB from backup with known admin or controlled seed on **isolated copy** only |
| Failed upgrade | Reinstall previous installer version + restore pre-update backup |

Full detail: `BACKUP_AND_RECOVERY_SOP.md`, `docs/database-recovery-and-migration.md`.

---

## Sign-off

| Role | Name | Date | OK |
|------|------|------|-----|
| Integrator | | | |
| Factory admin | | | |
| Pilot go-live | | | |

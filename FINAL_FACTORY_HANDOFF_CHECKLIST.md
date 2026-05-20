# SAMY SOFT — Final Factory Handoff Checklist

**Date:** 2026-05-20  
**Version:** 0.2.0  
**For:** Site operator + IT + deployment lead

---

## Pre-deployment (IT / engineering)

- [ ] Build installer: `npm run dist:win`
- [ ] Run `npm run validate:packaged` → exit code **0**
- [ ] Run `npm run factory:simulation` → FS1–FS10 **PASS**
- [ ] Run `npm run test:unit` → all **PASS**
- [ ] Copy installer to USB: `release/SAMY SOFT Setup 0.2.0.exe`
- [ ] Record build version + git commit on deployment sheet
- [ ] Read `PRODUCTION_READINESS_REPORT.md` and `DEPLOYMENT_RISK_MATRIX.md`

---

## Windows configuration (IT)

### Antivirus / Defender exclusions

Add **folder exclusions** (adjust username):

```
C:\Users\<USER>\AppData\Roaming\samy-soft\
C:\Program Files\SAMY SOFT\          (or chosen install dir)
```

Optional **process exclusion**:

```
SAMY SOFT.exe
```

**Why:** Reduces SQLite lock errors and Prisma engine scan delays.

### Other Windows settings

- [ ] Disable sleep during production hours (or use high-performance power plan)
- [ ] Ensure **≥ 2 GB free** on system drive and user profile (app warns below 500 MB)
- [ ] Do **not** store `samy-soft.sqlite` on network drive (SMB)
- [ ] Standard user account — app uses `asInvoker` (no admin required for daily use)

---

## Installation (operator + IT)

- [ ] Close any old SAMY SOFT instance
- [ ] Run `SAMY SOFT Setup 0.2.0.exe`
- [ ] Choose install folder (default OK)
- [ ] Confirm shortcut on desktop / Start menu — name **SAMY SOFT**
- [ ] First launch: create admin password (wizard) — **write password in sealed envelope**
- [ ] Confirm Paramètres → Santé système → migrations / intégrité **verts**
- [ ] Set **Paramètres → Sauvegardes** → activer automatique **24 h**
- [ ] Run **Export sauvegarde** once — confirm ZIP in `Documents\SAMY-SOFT\sauvegardes`

### Upgrade from previous version

- [ ] Backup ZIP **before** upgrade (manual)
- [ ] Install over existing (do not uninstall first)
- [ ] Launch once — verify login and last invoice/supplier still visible
- [ ] Check Santé système — no integrity failure

### Uninstall (only if retiring app)

- [ ] Export final backup ZIP first
- [ ] Uninstall via Windows — **data kept** in `%APPDATA%\samy-soft\`
- [ ] Archive folder if required for audit retention

---

## Daily operator procedures (non-technical)

### Start of shift

1. Open **SAMY SOFT** (only one window — if second opens, use existing window).
2. Log in.
3. If message **« Démarrage dégradé »** appears — tell supervisor; do not ignore if repeated.

### End of shift

1. Finish current invoice/batch entry.
2. Menu → **Exporter sauvegarde** (if auto-backup not confirmed today).
3. **Déconnexion** (logout).
4. Close application normally (X) — do not force-kill unless frozen.

### After power cut or crash

1. Wait 30 seconds.
2. Start SAMY SOFT normally.
3. If error **« Intégrité base »** — **stop**; call supervisor (restore backup).
4. If login screen only — log in; verify last work in list screens.
5. Supervisor checks **Journal d'activité** for `ABNORMAL_SHUTDOWN` if investigating.

### If application says database locked

1. Close all SAMY SOFT windows.
2. Open Task Manager — end any **SAMY SOFT** still running.
3. Wait 10 seconds — reopen.
4. If persists — call IT (antivirus scan / restart PC).

---

## Backup discipline

| When | Action |
|------|--------|
| Every 24 h (automatic) | Confirm newest ZIP date in sauvegardes folder |
| End of each shift | Manual export if high transaction day |
| Before software update | Manual export |
| Before payroll | Manual export |
| Weekly | Copy ZIP to USB or secondary disk |

**Retention:** keep at least **7 daily** + **4 weekly** offsite copies.

---

## Restore drill (supervisor — once per quarter)

1. Export current backup ZIP (label `pre-drill`).
2. Paramètres → Restaurer → select **older test ZIP** on **test PC only** OR follow `BACKUP_AND_RECOVERY_SOP.md`.
3. Verify supplier count and last invoice.
4. Document pass/fail on checklist.

---

## Health checks (supervisor weekly)

- [ ] Paramètres → **Santé système** — base OK, sauvegarde récente
- [ ] Dernier ZIP &lt; 48 h (or per site policy)
- [ ] Disk space on PC &gt; 1 GB free
- [ ] No recurring `ABNORMAL_SHUTDOWN` without explanation

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering | | | |
| IT | | | |
| Production supervisor | | | |

---

## Emergency contacts

| Issue | Action |
|-------|--------|
| Integrity failure at startup | Do not use app — restore backup |
| Lost password | Admin reset per internal SOP |
| Wrong data after restore | Stop — use pre-restore ZIP |

---

## Reference documents

- `BACKUP_AND_RECOVERY_SOP.md`
- `OPERATOR_QUICK_START.md`
- `DEPLOYMENT_CHECKLIST.md`
- `docs/backup-recovery-guide.md`

---

*Handoff checklist — final factory reliability phase 2026-05-20.*

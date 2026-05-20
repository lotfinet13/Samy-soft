# SAMY SOFT — Factory Recovery Drill

**Purpose:** Prove operators and supervisors can recover from power loss, bad upgrade, and corrupted session **without engineering on site**.  
**Duration:** 45–60 minutes  
**Frequency:** Quarterly + before first production deploy

---

## Drill roles

| Role | Person |
|------|--------|
| Operator | |
| Supervisor | |
| IT observer | |

---

## Scenario A — Backup / restore roundtrip (20 min)

### Setup

- Production-like PC with SAMY SOFT installed
- At least one supplier and one invoice created (marker: `DRILL-<date>`)

### Steps

1. **Operator:** Export sauvegarde ZIP (Paramètres).
2. **Supervisor:** Vérifier → status OK.
3. Open `manifest.json` inside ZIP (extract) — confirm:
   - `appVersion`
   - `schemaVersion`
   - `machineId`
   - `sqliteSha256` / `archiveSha256`
4. **Operator:** Change supplier phone/name (trivial edit).
5. **Supervisor:** Restaurer from ZIP.
6. **Operator:** Confirm supplier change **reverted**; marker data still present.
7. **IT:** Cold restart app — login — integrity OK in Santé système.

### Pass criteria

- [ ] Restore completes without error
- [ ] `ActivityLog` contains restore-related activity
- [ ] Startup diagnostics `health.integrity.ok === true`

---

## Scenario B — Simulated “bad upgrade” rollback (15 min)

### Setup

- Archived **previous** installer + matching pre-upgrade ZIP

### Steps

1. Export ZIP (**baseline**).
2. Install current build over previous (or vice versa per drill plan).
3. Detect deliberate misconfiguration (supervisor notes issue).
4. Follow `ROLLBACK_PROCEDURE_v0.2.0.md`:
   - Close app
   - Restore baseline ZIP
   - Install previous EXE (checksum verified)
5. Verify version in app footer matches rolled-back build.

### Pass criteria

- [ ] Rollback completed in &lt; 30 min wall time
- [ ] Integrity check pass
- [ ] Audit log shows continuity before baseline timestamp

---

## Scenario C — Power loss simulation (10 min)

### Steps

1. Start invoice or batch entry (do not save).
2. **IT:** Kill `SAMY SOFT.exe` from Task Manager (simulates crash).
3. Relaunch app.
4. Check Journal for `ABNORMAL_SHUTDOWN` (if DB existed before).
5. Confirm committed data before kill still present.

### Pass criteria

- [ ] App restarts without integrity error
- [ ] No FK errors on login/logout
- [ ] Unsaved form data lost only (expected)

---

## Scenario D — Locked database (5 min)

### Steps

1. Attempt to open second instance (double-click shortcut again).
2. Observe second instance focuses first window (single-instance).
3. If lock error ever shown: close all instances, wait 10 s, reopen.

### Pass criteria

- [ ] Only one instance active
- [ ] No persistent lock after cleanup

---

## Drill log

| Scenario | Pass/Fail | Time | Notes |
|----------|-----------|------|-------|
| A Backup/restore | | | |
| B Rollback | | | |
| C Power loss | | | |
| D Lock | | | |

**Next drill date:** _______________

---

## Evidence to archive

- ZIP file name used
- `manifest.json` screenshot
- `RELEASE_CHECKSUMS` line for installer tested
- Signed drill log PDF

---

*Related: `BACKUP_AND_RECOVERY_SOP.md`, `ROLLBACK_PROCEDURE_v0.2.0.md`*

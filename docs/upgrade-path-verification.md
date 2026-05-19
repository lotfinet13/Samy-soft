# Installer upgrade-path verification

Desktop ERP failures often occur during **upgrades**, not first installs. Run this checklist before factory pilot.

## Procedure

1. **Install vN-1** (previous release candidate NSIS/portable) on a clean Windows VM.
2. Complete wizard, create realistic data:
   - ≥3 suppliers, ≥5 materials, ≥2 production batches, ≥5 validated invoices
   - HR attendance for current month, one payroll cycle draft
3. Export backup ZIP (**Paramètres → Sauvegardes**).
4. Note baseline counts (suppliers, invoice totals, stock valuation).
5. **Install vN** over existing install (same userData directory).
6. Launch and verify:
   - [ ] No duplicate bootstrap / second admin user
   - [ ] Settings and branding preserved
   - [ ] Inventory balances unchanged (within rounding)
   - [ ] `system:startup-diagnostics` → migrations OK, no bootstrap drift
   - [ ] Modules load without IPC serialization errors
7. Run backup restore from step 3 ZIP on a **copy** of userData (optional destructive test).
8. Archive logs: `%APPDATA%/…/logs/samy-soft-main.log`

## Automated helpers

| Command | Purpose |
|---------|---------|
| `npm run verify:desktop` | Full gate after upgrade build |
| `npx playwright test e2e/backup-restore.spec.ts` | Backup → verify → restore → restart |
| `npm run e2e:stability` | Flake detection (5+ runs) |

## Failure triage

| Symptom | Likely cause |
|---------|----------------|
| Double wizard | Bootstrap re-run; migration table empty |
| Zero stock after upgrade | Wrong DB file path / channel mismatch |
| IPC errors on lists | DTO/serialization regression |
| Settings reset | userData path changed between versions |

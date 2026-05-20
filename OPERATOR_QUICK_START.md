# SAMY SOFT — Operator quick start (pilot)

Short guide for daily factory use. For IT install and recovery, see `DEPLOYMENT_CHECKLIST.md` and `BACKUP_AND_RECOVERY_SOP.md`.

---

## Login

1. Double-click **SAMY SOFT** (desktop or Start Menu).
2. Enter **username** and **password** provided by the factory admin.
3. If the screen shows **Configuration initiale** (`/setup`), stop and call the admin — first admin is created once only.
4. After login, complete or skip the **first-run wizard** if prompted (factory name, backups, printer).

**Session:** the app logs you out after idle time set in Paramètres. Save work before leaving the desk.

---

## Inventory flow (stock overview)

1. Go to **Inventaire** in the sidebar.
2. **Tableau de bord** — overview and alerts.
3. **Matières** / **Emballages** — raw materials and packaging SKUs; check quantities and reorder levels.
4. **Mouvements** — history of stock in/out; use to trace discrepancies.
5. **Rapports** — export summaries when the supervisor asks.

**Rule:** do not adjust stock manually without a documented reason (purchase, production consumption, waste, or sales shipment).

---

## Purchase flow (goods in)

1. **Inventaire → Fournisseurs** — ensure the supplier exists (admin may create).
2. **Inventaire → Achats** — register the purchase receipt:
   - Select supplier and lines (material, quantity, cost).
   - Save/post according to on-screen actions.
3. Confirm **Mouvements** shows inbound stock for the same day.
4. If something was entered wrong, contact the admin **before** end of day — do not edit the database file.

---

## Production batch flow

1. **Production → Recettes** — verify the recipe exists (admin setup).
2. **Production → Lots** — create a new batch:
   - Choose recipe, planned quantity, and mixer/line if required.
   - Start production when materials are available in inventory.
3. Complete the batch when finished — stock of finished goods and material consumption update accordingly.
4. **Production → Déchets** — record waste if material was lost outside the recipe.
5. **Production → Rapports** — batch history for the shift supervisor.

**Common mistake:** starting a batch without enough raw stock — check **Inventaire → Matières** first.

---

## Backup / export

1. **Paramètres** (gear icon) → section **Sauvegardes**.
2. Set **Dossier de sauvegarde** to a folder on disk or network share (admin usually does this once).
3. Click **Exporter une sauvegarde** — wait for success message.
4. Optional: enable **Sauvegarde automatique** and interval (hours).
5. Yellow warning **sauvegarde obsolète** — run a manual export immediately.

Backups are ZIP files safe to copy to USB/NAS. Do not rename files inside the backup folder without admin approval.

---

## Restart procedure

1. Finish or cancel open forms.
2. **File → Quit** or close the window (Alt+F4).
3. Wait 5 seconds (SQLite flush).
4. Relaunch from shortcut.

**After Windows update or power loss:** open the app; if errors appear, tell the admin — they may restore from backup.

**Do not** copy `samy-soft.sqlite` while the app is running.

---

## Common mistakes to avoid

| Mistake | Why it hurts | What to do instead |
|---------|--------------|-------------------|
| Running two copies on the same database | SQLite corruption risk | One instance per database file |
| Deleting files in `%APPDATA%\samy-soft` | Total data loss | Use in-app restore only |
| Skipping purchase entry before production | Wrong costs and stock | Register **Achats** first |
| Sharing one Windows user for everyone | No audit trail | Personal logins |
| Ignoring backup warnings | No recovery after failure | Export ZIP daily |
| Restoring a backup without admin | Overwrites all recent work | Call admin; confirm date of backup |
| Using seed password `Admin123!` in production | Security breach | Admin sets strong password at `/setup` |

---

## Who to call

| Issue | Contact |
|-------|---------|
| Login / password | Factory admin |
| Wrong stock or invoice | Supervisor + admin |
| App crash / won’t open | IT + admin |
| Restore or upgrade | IT integrator (see `BACKUP_AND_RECOVERY_SOP.md`) |

---

## Module map (sidebar)

| Menu | Use for |
|------|---------|
| Tableau de bord | Daily KPIs |
| Inventaire | Stock, suppliers, purchases |
| Production | Recipes, batches, waste |
| Ventes | Customers, invoices |
| RH | Workers, attendance, payroll (if licensed) |
| Rapports | Cross-module analytics |
| Paramètres | Backups, factory name, session, printers |
| Diagnostics | Health check (admin) |

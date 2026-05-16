# Roadmap modules ERP — SAMY SOFT

Légende : ✅ Phase 1 foundation · 🔄 Phase 2+ métier · 🔮 futur

| Module | État | Notes |
|--------|------|-------|
| Dashboard | ✅ socle | KPI placeholders + vérif santé DB ; série Recharts indicative. |
| Inventaire | 🔄 | Raw/Packaging + **agrégats depuis `StockMovement` uniquement**. |
| Production | ✅ cœur métier | Recettes, nomenclature, lots, consommation **`PRODUCTION_OUT`**, pertes, logs mélangeurs, dashboard & CSV — **aucune** mutation directe stocks. |
| Ventes | ✅ Phase 5 | Clients, catalogue produits, factures, paiements, dashboard & CSV ; **sorties stock uniquement via `SALES_OUT`** ; POS-ready (`shared/pos/types.ts`). |
| Employés / RH | ✅ Phase 4 | Effectifs, pointages `AttendanceRecord`, shifts, dashboard RH — tout sous `/rh`. |
| Paie | ✅ Phase 4 | `PayrollCycle`, moteur calcul ledger + avances `PayrollAdvanceRecovery`, ajustements horodatés, exports CSV. |
| Rapports | ✅ Phase 6 | Centre `/rapports` : KPIs transversaux, analytiques Recharts, rentabilité opérationnelle, Excel multi-feuilles, PDF (factures, inventaire, lots, présences, bulletins) ; presets `SavedReportPreset` ; journal audit sous `/rapports/journal`. |
| Paramètres | ✅ | ZIP manifesté Phase 7, rotation rétention, idle/verrou session, diagnostics SQLite/VACUUM/migrations, **scan cohérence métier** (Phase 8), export audit CSV (`/rapports/journal`). |

## Dépendances transverses

- **RBAC** via codes `shared/permissions.ts`.
- **Journal** via `ActivityLog` pour actions sensibles.
- **Grand livre stock** via `StockMovement` — _jamais_ de champ « qty cache » mutable sans mouvement.

## Hors périmètre volontaire

- SaaS / synchro cloud native.
- BI externe obligatoire — tout doit pouvoir fonctionner **entièrement offline**.

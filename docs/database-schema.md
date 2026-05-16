# Schéma base de données — SAMY SOFT

Source de vérité : `prisma/schema.prisma` + migrations SQL sous `prisma/migrations/`.

## Principes

1. **Journal / grand livre** pour tout ce qui doit être auditable (stock via `StockMovement`, paie via `PayrollRecord` + `PayrollAdvanceRecovery` + `PayrollAdjustment`, présences via `AttendanceRecord`, production via `ProductionBatch` + futurs mouvements).
2. **Pas de mutation magique** des quantités inventaire — agrégation depuis mouvements uniquement.
3. Les champs historiques JSON-like sont stockés en **`String`** JSON pour compatibilité SQLite stricte avec Prisma Migrate (`metadata`, `permissions`).

## Modèles Phase 1 (foundation)

| Modèle | Rôle |
|--------|------|
| `Role` | Rôles énumérés + permissions JSON string (`["*"]` ou liste de codes). |
| `User` | Utilisateur applicatif (login local). |
| `ActivityLog` | Journal d’audit applicatif (login, réglages, sauvegardes…). |
| `AppSetting` | Paires clé/valeur pour réglages ERP (clés dans `shared/settings-keys.ts`). |
| `BackupRecord` | Historique des exports (**ZIP manifesté** + copie SQLite ; chemins `.sqlite` hérités supportés ; `integrityStatus`, `verifiedAt`, `format`). |

## Modèles métier (schéma initialisé — UI Phase 2+)

| Domaine | Modèles |
|---------|---------|
| RH temps | `Worker`, `AttendanceRecord`, `Shift`, `WorkerShift` |
| Paie | `PayrollCycle`, `PayrollRecord`, `PayrollAdjustment`, `SalaryAdvance`, `PayrollAdvanceRecovery` |
| Achats / nomenclature | `Supplier`, `RawMaterial`, `PackagingMaterial` |
| Stock | `StockMovement` (+ distinction `MaterialKind`) |
| Production | `Recipe`, `RecipeIngredient`, `ProductionBatch`, `ProductionOperationLog` |
| Ventes | `Customer`, `Product`, `Invoice`, `InvoiceItem`, `PaymentRecord` |

### Mouvements inventaire liés aux ventes

- **Sortie livraison** : lors de la **validation** d’une facture (`InvoiceStatus` ≠ `DRAFT`), pour chaque ligne liée à un `Product` possédant un `packagingMaterialId`, création d’un `StockMovement` avec `inventoryKind = SALES_OUT`, `qtySigned` **négatif**, `referenceType = "InvoiceItem"` et `referenceId` = id ligne figée.
- **Annulation** facture validée sans paiement : mouvements `RETURN_IN` symétriques (qty positive) pour ré-intégrer le stock emballage.
- Les lignes **sans produit** ou produit **sans emballage lié** ne génèrent **aucun** mouvement (prestations / lignes libres).

### Cycle facture & paiement

| Enum | Valeurs |
|------|---------|
| `InvoiceStatus` | `DRAFT`, `VALIDATED`, `PAID`, `CANCELLED` |
| `InvoicePaymentStatus` | `UNPAID`, `PARTIAL`, `PAID` |
| `PaymentMethod` | `CASH`, `BANK_TRANSFER`, `CHEQUE`, `OTHER` |

Totaux (`subtotalAmount`, `taxAmount`, `discountAmount`, `totalAmount`) sont recalculés en **brouillon** ; après validation les lignes et montants sont **figés** côté métier (UI lecture seule + paiements).

## Domaine ventes & catalogue commercial (Phase 5)

| Modèle | Rôle |
|--------|------|
| `Customer` | Compte client (`code` unique, ville, identifiant fiscal optionnel, actif/inactif). |
| `Product` | Article fini vendable (`sku`, prix vente, unité, lien optionnel `Recipe` + `PackagingMaterial` pour déstockage et analytique coût). |
| `Invoice` | Facture (`number` unique), workflow statut + paiement, montants agrégés, traçabilité `createdById` / `validatedById` / `validatedAt`. |
| `InvoiceItem` | Ligne (lien `productId` optionnel, snapshots SKU/libellé à validation, remises ligne, TVA %). |
| `PaymentRecord` | Encaissement (`amount`, `method`, `paidAt`, `recordedById`). |

## Domaine production (Phase 3)

**Règle d’or :** la production ne modifie **jamais** directement une colonne de « stock courant » sur les matières — seuls les **`StockMovement`** (sorties `PRODUCTION_OUT`, pertes `PRODUCTION_WASTE` / `DAMAGED_LOSS`, éventuelle entrée conditionnée selon recette) pilotent l’inventaire.

| Modèle | Rôle |
|--------|------|
| `Recipe` | Fiche formulé (code, catégorie, `yieldQty` / `yieldUnit`, notes fabrication, version / parent pour duplication, emballage sortie optionnel). |
| `RecipeIngredient` | Lignes nomenclature MP (quantité, unité alignée fiche MP, optionnel, `%` perte ligne, ordre). |
| `ProductionBatch` | Lot (`code`, `recipeId`, volumes plan / réalisé, statut `BatchStatus`, snapshots coût dans champs dédiés + `metadata` JSON). |
| `ProductionOperationLog` | Journal mélangeur / poste (opérateur, durée, nettoyage, maintenance, lien lot optionnel). |

### Mouvements inventaire liés

- **Consommation** : `InventoryMovementKind.PRODUCTION_OUT`, `referenceType` / `referenceId` pointent vers le batch concerné.
- **Pertes atelier** : `PRODUCTION_WASTE` ou `DAMAGED_LOSS` avec note de contexte.

## Domaine RH & paie (Phase 4 — Mega HR)

**Règle d’or paie :** aucun net « figé » sans lignes sources — les montants sont recalculés depuis les présences, les `PayrollAdjustment` datés/utilisateur, et les lignes `PayrollAdvanceRecovery`. Snapshot analytique JSON sous `PayrollRecord.metadata`.

| Modèle | Rôle |
|--------|------|
| `Worker` | Identité, contrat, salaire mensuel/journalier, bases & tarif HS. |
| `AttendanceRecord` | Pointage jour (`@@unique(workerId, workedDate)` anti-doublon), statuts industriels, HS. |
| `Shift` | Créneau + `overtimeRulesJson` pour extensions multi-shift / nuit. |
| `WorkerShift` | Affectations employés ↔ équipe. |
| `PayrollCycle` | Enveloppe période ; statut `DRAFT` → `LOCKED` avec `closedById`. |
| `PayrollRecord` | Fiche salaire par cycle — brut, HS, retenues, récup. avances, net. |
| `SalaryAdvance` | Avance versée (motif, date paiement). |
| `PayrollAdvanceRecovery` | Grand-livre des prépaiements récupérés sur une fiche paie. |
| `PayrollAdjustment` | Prime / retenue / correction — auditables (`createdById`). |

## Énumérations notables

- `InventoryMovementKind` — inclut `PRODUCTION_OUT`, `PRODUCTION_WASTE`, `DAMAGED_LOSS`, `SALES_OUT`, `RETURN_IN`, réceptions, achats, etc.
- `PayrollStatus`, `SalaryType`, `AttendanceStatus`, `AdvanceRepaymentStatus`, `PayrollAdjustmentKind`, `PayrollCycleStatus` — workflows RH/paie.

## Index & contraintes

Index présents sur dates de mouvements, relations travailleur/période, unicités SKU/code facture, etc. — voir schéma Prisma. **Phase 6** : index **`ProductionBatch.finishedAt`** pour fenêtres de clôture.

### Modèle reporting (Phase 6)

| Modèle | Rôle |
|--------|------|
| `SavedReportPreset` | Filtres sauvegardés par utilisateur (`section`, `filtersJson`), suppression en cascade depuis `User`. |

**Rentabilité opérationnelle (hors comptabilité générale)** : agrège factures validées, coûts `ProductionBatch` clôturés, paie `PayrollRecord` hors brouillon sur périodes recoupant la fenêtre, mouvements `PRODUCTION_WASTE` et `EXPIRED_LOSS` valorisés avec PU catalogue courant.

## Outils

- `npx prisma studio` pour inspection locale (après migration + seed).

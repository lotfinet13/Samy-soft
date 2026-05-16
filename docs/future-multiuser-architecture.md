# Architecture multi-postes & synchronisation — vision SAMY SOFT

> **État actuel (release candidate)** : ERP **local-first**, une base **SQLite** par poste, sans couche réseau métier.

## Principes retenus pour une évolution future

1. **Séparation des responsabilités** — la logique métier doit rester dans des **services** Node côté main Electron (`electron/services/*`), indépendants de l’UI. Les handlers IPC sont des adaptateurs minces (validation Zod, RBAC, journalisation).
2. **Transactions et invariants** — toute écriture multi-lignes (facture + stock + audit, lot + mouvements) reste dans une **transaction Prisma** sur le process main ; en scénario multi-utilisateurs futur, ce même modèle s’appliquerait **sur un serveur** avec verrous optimistes ou MVCC selon le moteur cible.
3. **Sources de vérité** — le **grand livre stock** (`StockMovement`) et les journaux d’audit (`ActivityLog`) sont la référence ; pas de caches de quantités mutables sans mouvement.

## Mode LAN / multi-utilisateurs (non implémenté)

### Décision Phase 12

La Phase 12 **ne lance aucun serveur réseau**. Elle rend explicites les frontières :

- `electron/database.ts` : profil runtime SQLite + transaction helper.
- `electron/repositories/db-context.ts` : contexte repository, mode mono-poste aujourd’hui, serveur LAN demain.
- `OperationalVersion` : support optimistic locking par entité.
- `OperationalLock` : support pessimistic lock futur pour états critiques.
- `SyncEnvelope` : journal d’export/import futur, sans réplication active.

```
Aujourd'hui
Poste A ── Electron main ── Prisma ── SQLite local

Demain LAN recommandé
Poste A ┐
Poste B ├─ Electron client ── API atelier ── PostgreSQL/SQL Server central
Poste C ┘                         │
                             sauvegarde serveur
```

### Pistes techniques

- **Option A — SQL central** : PostgreSQL ou SQL Server sur un mini-serveur d’atelier ; chaque client Electron devient **renderer + client API** ; le main garde auth ou déléguer à tokens court/jeton machine.
- **Option B — Réplication** : SQLite par poste + service de **fusion** (CRDT ou batch nocturne) — complexité élevée pour des flux inventaire/paie ; déconseillé sans produit dédié.

### Migration de code

- Extraire les **services métier** dans un package partagé `@samy-soft/core` utilisé par le main **ou** un futur worker HTTP local.
- Introduire une couche **repository** (interfaces lecture/écriture) implémentée aujourd’hui par Prisma SQLite, demain par client HTTP ou autre.
- IPC devient optionnel : mêmes use cases exposés en REST/`ipc` selon le déploiement.

### Concurrence

- Verrouillage de cycles paie, validation facture, clôture lot : déjà des **transitions d’état** ; à renforcer avec contraintes d’unicité et **version** (optimistic locking) sur enregistrements critiques si conflit multi-sessions.
- **Invoice validation** : optimistic `Invoice`, pessimistic stock packaging pendant posting.
- **Stock movements** : le grand-livre `StockMovement` reste append-only ; relire le solde avant chaque mouvement.
- **Payroll locking** : `PayrollCycle` doit devenir verrou pessimiste court pendant calcul/verrouillage.
- **Production batches** : verrou de lot + stock RAW pendant clôture.
- **Attendance entries** : conflit tranché par `@@unique([workerId, workedDate])`, puis correction opérateur après recharge.

## Migration SQLite → SQL central

1. Geler une sauvegarde ZIP validée.
2. Appliquer toutes les migrations Prisma sur un schéma SQL central cible.
3. Exporter les tables métier dans l’ordre référentiel : rôles/utilisateurs, référentiels, inventaire, production, RH, ventes, reporting.
4. Importer et recalculer les vues/snapshots dérivés (`PurchaseForecastSnapshot`, `IndustrialAnalyticsSnapshot` peuvent être régénérés).
5. Basculer les clients Electron vers un endpoint atelier ; conserver SQLite uniquement pour cache/offline futur.
6. Exécuter scans intégrité + rapprochement stock avant ouverture multi-utilisateur.

## Sauvegarde & continuité

- Tant que le mode reste mono-poste, la **stratégie ZIP Phase 7** reste la voie de reprise après incident.
- Un passage multi-postes exigera une **politique de sauvegarde serveur** distincte (ce document ne la prescrit pas).

## Document vivant

Lorsqu’un POC LAN est lancé, ajouter ici : choix BDD, schéma auth, latence mesurée, et impacts sur `preload`/CSP.

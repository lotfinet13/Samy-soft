# Architecture projet — SAMY SOFT

## Vue d’ensemble

SAMY SOFT est une application **bureau Electron** avec une UI **React** rendue par **Vite**.

```
┌───────────────────────────────┐
│ BrowserWindow (sandbox)       │
│  ├─ preload.js (bridge typé) │
│  └─ Renderer React (HashRouter)│
└───────────────┬───────────────┘
                │ IPC whitelist (`window.samy.invoke`)
┌───────────────▼───────────────┐
│ Electron Main                  │
│  ├─ IPC handlers               │
│  ├─ Services (auth, backup…)   │
│  └─ PrismaClient → SQLite file │
└───────────────────────────────┘
```

## Processus principal (`electron/`)

- `main.ts` — cycle de vie app, fenêtre sandbox, gardes navigation basiques Phase 7, orchestration SQLite, journaux fichier `logs/samy-soft-main.log`, scheduler sauvegardes automatiques.
- `preload.ts` — `contextBridge.exposeInMainWorld('samy', …)` limité aux canaux déclarés + erreurs IPC normalisées côté bridge.
- `ipc/handlers.ts` — authentification, réglages, quit app ; registre également `services` reporting / ventes / etc.
- `ipc/system-handlers.ts` *(Phase 7)* — backups ZIP + audits SQL + diagnostics SQLite consolidés hors modules métier ; **Phase 8** : scan cohérence métier `db:data-integrity:scan` (`data-integrity-service.ts`).
- `services/*` — logique métier **sans** dépendre de React (auth, backup, **inventaire**, **production**, **RH/paie**, etc.).
- `database.ts` — singleton Prisma + chemins fichier DB.

### URL SQLite sous Windows

Le main assigne `process.env.DATABASE_URL` avec la forme :

`file:D:/chemin/vers/samy-soft.sqlite` (slashes POSIX)

pour éviter les échecs Prisma « Unable to open the database file » observés avec certaines URL `file:///`.

### Chemins en développement non packagé

`getDatabaseFilePath()` → `<cwd>/.data/samy-soft.sqlite` — doit correspondre au fichier créé par Prisma CLI via `.env` (`file:../.data/...` depuis `prisma/`).

## Renderer (`src/`)

- `App.tsx` — routes + hydration session (`refreshSession`) ; pages métier chargées en **lazy** via `src/pages/lazy-pages.ts`.
- `layouts/AppShell.tsx` — shell ERP (sidebar + topbar) ; **Suspense** + `RouteFallback` autour de l’`Outlet` ; assistant **premier lancement** admin (`FirstLaunchWizard`, clé `onboarding.wizard_done`).
- `pages/*` — écrans grossiers Phase 1 + Paramètres complets.
- `components/ui/*` — design system composants réutilisables ; **`DataTable`** avec virtualisation (TanStack Table + Virtual) au-delà d’un seuil de lignes.
- `lib/ttl-cache.ts` — cache mémoire TTL court pour IPC non critiques (ex. résumé inventaire dashboard).
- `stores/*` — Zustand (auth, UI, settings, **palette commande** modes nav/quick Phase 8).
- `lib/bootstrap.ts` — hydratation session et paramètres (avec gestion silencieuse des droits).

### Branding public vs Paramètres privés

Les utilisateurs sans `SETTINGS_READ` reçoivent quand même **`branding`** via `AUTH_LOGIN` / `AUTH_SESSION` (nom usine, devise, thème) pour alimenter Topbar + `ThemeSync`.

## Shared (`shared/`)

Code **sans React** consommé par main et renderer :

- `ipc-channels.ts`
- `permissions.ts`
- `settings-keys.ts`
- `schemas/*` — validations Zod IPC (inventaire, **production**, **RH/paie**, **ventes**).
- `pos/types.ts` — **contrats POS futurs** (ports scanner code-barres, file impression thermique, session caisse rapide) sans implémentation matérielle.

## RH & Paie (Phase 4)

- `electron/services/payroll-engine.ts` — moteur `calculatePayrollForWorker` (mensuel/journalier, HS, ajustements, récupération d’avances, snapshot JSON).
- `electron/services/hr-service.ts` — parsing dates pointage, recalcul cycle (`computePayrollCycle`), statuts avances.
- `electron/ipc/hr-handlers.ts` — canaux `hr:*` (effectifs, présences bulk/jour, shifts, cycles paie, avances, dashboard, exports CSV).
- **RBAC** — `hr.read|write`, `payroll.read|execute|adjust|report`.

## Ventes & facturation (Phase 5)

- `electron/services/sales-service.ts` — totaux lignes/facture, génération `StockMovement` `SALES_OUT` à la validation (transaction Prisma), annulations avec `RETURN_IN`, enregistrement paiements (`PaymentRecord`) et transitions `InvoiceStatus` / `InvoicePaymentStatus`.
- `electron/ipc/sales-handlers.ts` — canaux `sales:*` (clients, produits, factures, dashboard, exports CSV, compteurs navigation).
- **RBAC** — `sales.read|write|validate|cancel|payment|report`.
- **UI** — `SalesLayout` : tableau de bord commercial, clients + fiche, catalogue produits, factures (brouillon → validation → paiement), rapports CSV ; **PDF facture** via IPC `reports:pdf:invoice` (`electron/services/reporting/pdf-document-builder.ts`).

## Reporting, analytique & documents (Phase 6)

- **`electron/services/reporting/`** — agrégats Prisma (inventaire, production, RH, ventes), **KPI cockpit** (`reporting-metrics.ts`), **rentabilité opérationnelle** (factures validées vs coûts MP lots + masses paie + pertes péremption/déchet estimées ; ranking produits par coût moyen MP par recette clôturée), **TTL cache** léger (`reporting-cache.ts`), presets `SavedReportPreset` par utilisateur.
- **`excel-export-builder.ts`** — classeurs multi-feuilles `exceljs` (KPIs, synthèse mensuelle, ventes/stock péremptions, RH, synthèse rentabilité).
- **`pdf-document-builder.ts`** — `pdf-lib` A4 (+ type `PdfPageProfile` **THERMAL_80MM** pour extension thermique).
- **`electron/ipc/reports-handlers.ts`** — canaux `reports:*`, logging `ActivityLog` sur exports sensibles ; payload binaire **`base64`** consommé par `src/lib/binary-download.ts`.
- **RBAC** — `reports.read|export|financial`, `analytics.read`.
- **UI** — `ReportingLayout` sous `/rapports` (centre, analytiques, rentabilité, synthèse direction, journal audit).

## Production (couche métier)

- `electron/services/production-service.ts` — échelle nomenclature vs rendement, prévisualisation ruptures, cycle de vie batch, clôture transactionnelle avec **posting** `PRODUCTION_OUT`, enregistrement pertes, signaux dashboard.
- `electron/ipc/production-handlers.ts` — canaux `production:*`, rapports CSV (`batches`, consommations, coûts, déchets).
- **Coûts** : agrégation MP à la clôture (`costIngredientTotal`, `costPerOutputUnit` dans `metadata` selon implémentation courante) pour analytique marge future ; ajustements MS / frais réservés aux rôles `production.adjust.cost`.

## Prisma (`prisma/`)

- Schéma SQLite unique fichier.
- Migrations versionnées sous `prisma/migrations/`.

## Scripts npm

Voir `README.md`.

## Future scaling notes

- **Packaging** : `electron-builder` (NSIS + portable x64) — voir `docs/deployment-guide.md` et `docs/production-checklist.md`.
- **Migrations runtime** : aujourd’hui les migrations sont appliquées via CLI (`migrate deploy`) avant livraison ; pour upgrade auto en prod embarquée, prévoir exécution contrôlée au démarrage + journaux.
- **IPC** : ajouter des namespaces par module (`inventory:*`, `production:*`) tout en gardant la whitelist preload.
- **Performance SQLite** : WAL déjà pertinent ; surveiller checkpoints lors des sauvegardes à chaud (déjà tentative `PRAGMA wal_checkpoint`).
- **Multi-postes** : hors périmètre runtime Phase 12 ; l’architecture ajoute seulement les frontières nécessaires (`electron/repositories/db-context.ts`, `OperationalVersion`, `OperationalLock`, `SyncEnvelope`).

## Phase 12 — extension LAN & industrielle optionnelle

La Phase 12 reste **local-first mono-poste par défaut**. Les ajouts sont des contrats et tables préparatoires :

```
Renderer React
  │ window.samy.invoke
Electron IPC handlers
  │ validation + RBAC
Business services
  │ runDbTransaction / RepositoryExecutionContext
Prisma SQLite local
  ├─ données métier actuelles
  └─ tables Phase 12 : versions, locks, barcodes, maintenance, forecasts, sync envelopes
```

- **Accès DB isolé** — `electron/database.ts` expose `getDatabaseRuntimeProfile()` et `runDbTransaction()` ; `electron/repositories/db-context.ts` décrit le contexte repository futur sans déplacer les services existants.
- **Concurrence future** — `electron/services/concurrency-service.ts` centralise les politiques invoice / stock / paie / batch / présence et prépare `OperationalVersion` + `OperationalLock`.
- **Code-barres & impression** — `shared/pos/types.ts` porte les contrats scanner / thermique / tactile ; `electron/services/barcode-print-service.ts` résout SKU, mappings et plans étiquettes sans pilote matériel.
- **Maintenance machines** — `MachineAsset`, `MachineMaintenanceSchedule`, `MachineDowntime`, `MachineRepairRecord` couvrent mixers, freezers et équipements.
- **Prévision achats & analytics** — `industrial-expansion-service.ts` calcule snapshots de réassort, utilisation machine, efficacité production, efficacité main-d’œuvre et débit.

Voir aussi `docs/lan-deployment-strategy.md`, `docs/concurrency-strategy.md` et `docs/future-cloud-sync.md`.

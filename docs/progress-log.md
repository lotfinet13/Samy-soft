# Journal de progression — SAMY SOFT

Convention : **chaque phase terminée** ajoute une entrée datée + liste livrables vérifiables.

---

## Release candidate v1.0.0-rc1 (2026-05-16)

### Certification release

- Tag prévu : `v1.0.0-rc1`.
- Message tag : `SAMY SOFT first production release candidate`.
- Périmètre : baseline ERP industrielle local-first, Phase 12 préparatoire LAN/industrie incluse, sans activation réseau.

### Vérifications release

- `git status --short` — OK, propre avant certification.
- `npx prisma validate` — OK.
- `npm run lint` — OK.
- `npm run build` — OK.
- `npm run e2e` — OK, 3 tests Playwright passés.

### Note rollback

Rollback applicatif : revenir au tag précédent ou au commit baseline précédent. Rollback données : restaurer la dernière sauvegarde ZIP vérifiée avant toute migration ou installation candidate.

---

## Phase 12 — Multi-user LAN & expansion industrielle (2026-05-16)

### Livré

- **Préparation LAN sans réseau** — `OperationalVersion`, `OperationalLock`, `SyncEnvelope`, `runDbTransaction()`, `RepositoryExecutionContext`.
- **Concurrence** — politiques centralisées dans `concurrency-service.ts` pour facture, stock, paie, batch production et présence.
- **Code-barres / thermique / tactile** — mapping code-barres, templates impression, contrats scanner/thermal/touch, résolution SKU et plans étiquettes.
- **Maintenance machines** — modèles mixers/freezers/machines, plans maintenance, downtime, réparations.
- **Prévision achats & analytics industriels** — snapshots réassort, utilisation machine, efficacité production, efficacité main-d’œuvre, débit opérationnel.
- **Docs** — stratégies LAN, concurrence, cloud sync futur, architecture multi-postes mise à jour.

### Vérifications

- À exécuter en fin de phase : `npx prisma validate`, `npx prisma generate`, `npm run lint`, `npm run build`.

### Note de compatibilité

La Phase 12 ne modifie pas les routes IPC existantes et ne force aucun serveur. Les nouvelles tables sont optionnelles et vides tant qu’un module futur ne les utilise pas.

---

## Phase 10 — Finition commerciale & déploiement (2026-05-16)

### Livré

- **Invalidation cache TTL** — `src/lib/cache-keys.ts`, `invalidate-ui-cache.ts` ; branchements mouvements stock, achats, ajustements tableau matières, lots production, déchets atelier, catalogue produits / factures (ventes & stock), cycles paie ; clé dashboard `CACHE_KEYS.INVENTORY_DASHBOARD_SUMMARY`.
- **Édition compacte** — ajustement physique **F2** liste matières (`InlineInventoryQtyCell`), prix catalogue inline (`InlineProductPriceCell`), **Ctrl+Entrée** sur bloc lignes facture brouillon, menus **⋯** par ligne inventaire.
- **Recherche / filtres opérateur** — filtres factures (texte + statut + paiement) + puces mémorisées ; journal audit + mémorisation recherche ; recherche texte lots production côté IPC (`productionBatchListSchema.q`).
- **Diagnostics** — page `/diagnostics` + liens Paramètres / barre supérieure (`SystemHealthPage`).
- **Windows packaging** — `publisherName`, `requestedExecutionLevel`, NSIS langue FR, semver `0.2.0`, script `verify:desktop`.
- **Docs** — `release-process.md`, `system-health-guide.md`, mises à jour déploiement / opérateur / perf / journal phase.

### Vérifications

- `npm run lint` — OK (TypeScript renderer + electron).

### À produire côté équipe (captures)

Installer NSIS + page diagnostic + grille matières après génération locale `npm run dist:win` — non automatisé dans cet environnement.

---

## Phase 9 — Passage à l’échelle perf, bundle & onboarding (2026-05-16)

### Livré

- **Virtualisation** — `DataTable` (seuil 18 lignes) avec `@tanstack/react-virtual` ; scroll + flèches/PageUp/PageDown ; **présence jour** virtualisée ≥ 16 employés ; grilles inventaire/mouvements/factures/journal audit concernées via `DataTable`.
- **Code splitting** — `src/pages/lazy-pages.ts` + `Suspense` dans `AppShell` (`RouteFallback`) ; graphique dashboard `DashboardProductionChart` en lazy + suspense.
- **Bundle Vite** — `manualChunks` : `recharts`, `@tanstack/*`, `icons` ; chunk principal d’entrée réduit (cf. `docs/performance-strategy.md`).
- **Cache TTL** — `src/lib/ttl-cache.ts` ; tableau de bord — IPC résumé inventaire avec TTL 45 s + refresh interval 2 min sans cache.
- **Premier lancement** — `FirstLaunchWizard` (admin, `onboarding.wizard_done`), clé `APP_SETTING_KEYS.ONBOARDING_WIZARD_DONE`.
- **Docs** — `performance-strategy.md`, `future-multiuser-architecture.md` ; mises à jour guides existants.

### Vérifications

- `npm run lint`, `npm run build` — OK.

### Mesures (build local)

- Voir sortie `vite build` : fichiers `dist/assets/index-*.js`, `recharts-*.js`, chunks lazy par module.

---

## Phase 8 — Stabilisation production, clavier atelier & intégrité métier (2026-05-16)

### Livré

- **Raccourcis poste** — `GlobalShortcuts.tsx` : Ctrl+K / Ctrl+F (palette), Ctrl+Shift+N (mode flux opérateur), Alt+1–9 (modules sidebar, hors champs texte Ctrl+S formulaires conservé).
- **Palette** — `CommandPalette.tsx` : filtre texte, navigation clavier (↑/↓, Entrée, Tab), modes `nav` / `quick`, actions rapides `src/lib/quick-actions.ts`.
- **Intégrité données** — `electron/services/data-integrity-service.ts` + IPC `db:data-integrity:scan` : stocks négatifs, mouvements incohérents, factures vs paiements, paie vs cycle verrouillé, lots complétés sans quantité ; journal `DATA_INTEGRITY_SCAN` ; UI Paramètres « Scanner cohérence métier ».
- **Documentation** — `deployment-guide.md`, `production-checklist.md`, `backup-recovery-guide.md`, `operator-guide.md` ; mises à jour architecture / sécurité / roadmap / phase suivante.

### Vérifications

- `npm run lint`, `npm run build` — OK.

### Notes

- Installateur Windows : `npm run dist:win` (artefacts locaux `release/`) ; captures d’écran à régénérer sur poste cible.

---

## Phase 7 — Bureau industriel durci & déploiement Windows (2026-05-17)

### Livré

- **Sauvegardes ZIP** — `electron/services/backup-service.ts` : archive `{ database.sqlite + manifest.json }`, empreinte globale ZIP, pré-contrôle restaurations, quota de rétention + nettoyage, planificateur `backup-scheduler.ts`.
- **IPC système** — `electron/ipc/system-handlers.ts` : santé backup, vérif ZIP, audits paginés + export CSV, maintenance SQLite (`PRAGMA` intégrité, FK checker, liste migrations Prisma, VACUUM), sonde mise à jour abstraite.
- **Sécurité process** — verrouillage navigation `BrowserWindow`, journal `userData/logs/samy-soft-main.log`, IPC preload normalisé erreurs.
- **UI** — paramètres (rétention, session idle/verrou, centre maintenance JSON), palette commande Ctrl+K, raccourcis globaux légers, toasts session, erreur renderer encapsulée, journal audit filtres/export.
- **Packaging** — `electron-builder` (NSIS + portable x64), script `npm run dist:win`.

### Vérifications

- `npm run lint`, `npm run build`, `prisma db push` — OK (CI migrations shadow DB encore à traiter en équipe).

### Captures écran / installateur

- Génération locale après `npm run dist:win` (artefacts `release/` non versionnés par défaut).

---

## Phase 6 — Reporting mega, analytics, PDF & Excel (2026-05-16)

### Livré

- **Prisma** — `SavedReportPreset` (+ relation `User`), index `ProductionBatch.finishedAt`.
- **Services** — `electron/services/reporting/*` : agrégats analytiques multi-modules, KPI cockpit, rentabilité opérationnelle, exports `exceljs` / `pdf-lib`, cache TTL, presets filtres utilisateur.
- **IPC** — `reports-handlers.ts`, canaux `reports:*`, exports `{ base64 }` téléchargés côté renderer.
- **RBAC** — `reports.read|export|financial`, `analytics.read` ; seed rôles.
- **UI** — `ReportingLayout` `/rapports` (centre, analytiques Recharts, rentabilité, synthèse direction, journal audit), `downloadBase64Blob`, PDF facture sur fiche détail vente.

### Vérifications

- `npm run lint`, `npm run build` — OK.

### Fichiers d’exemple

- Produire localement depuis l’application (Excel direction, PDF stock/lots/présences, PDF facture) — non inclus dans Git.

---

## Phase 5 — Mega ventes, clients, facturation & grand-livre (2026-05-16)

### Livré

- **Prisma** — `Product`, enrichissement `Customer`, `Invoice` (+ montants, `InvoicePaymentStatus`, `PaymentMethod`, audit créateur/validateur), `InvoiceItem` (snapshots, remises), `PaymentRecord` ; `InvoiceStatus` aligné `DRAFT → VALIDATED → PAID|CANCELLED`.
- **Métier** — `sales-service.ts` : aucune mutation stock hors `StockMovement` ; validation → `SALES_OUT` par ligne produit avec emballage ; annulation validée sans paiement → `RETURN_IN` ; paiements avec contrôle solde.
- **IPC** — `sales-handlers.ts` + `shared/schemas/sales.ts` + canaux `sales:*`.
- **Permissions** — `sales.read|write|validate|cancel|payment|report` ; seed MANAGER / OPERATOR / VIEWER mis à jour.
- **UI** — `SalesLayout`, cockpit `/ventes`, clients, catalogue, factures (workflow complet), rapports CSV ; badge sidebar impayés + brouillons (`SALES_NAV_COUNTS`).
- **POS-ready** — `shared/pos/types.ts` (ports abstraits, sans pilotes USB).

### Vérifications effectuées

- `npm run lint`, `npm run build` — OK (compilation Electron incluse).

### Captures d’écran

- À produire localement (`npm run dev`) : centre ventes, fiche facture validée, catalogue produits — non versionnées par défaut.

---

## Phase 4 — Mega RH, présences & paie ledger (2026-05-16)

### Livré

- **Prisma** — `AttendanceRecord` (unique jour × employé), `Shift`, `WorkerShift`, `PayrollCycle`, enrichissement `Worker`, `PayrollRecord` (+ HS / récup. avances), `SalaryAdvance`, `PayrollAdvanceRecovery`, `PayrollAdjustment` ; enums salaire/statuts paie/cycle.
- **Moteur** — `calculatePayrollForWorker` (`electron/services/payroll-engine.ts`) : mensuel vs journalier, HS, primes/retenues/corrections, récupération d’avances ordonnée ; snapshot JSON dans `metadata`.
- **Services** — `hr-service.ts` (`computePayrollCycle`, dates stockées midi UTC, refresh statuts avances).
- **IPC** — `electron/ipc/hr-handlers.ts` + canaux `shared/ipc-channels.ts` ; validations `shared/schemas/hr.ts`.
- **Permissions** — `hr.read|write`, `payroll.read|execute|adjust|report` dans `shared/permissions.ts` ; seed MANAGER / OPERATOR / VIEWER mis à jour.
- **UI** — `HrLayout`, `/rh/*` : tableau de bord cockpit, effectifs + fiche employé, présence jour (bulk), calendrier synthèse mensuelle, shifts, cycles paie (calcul + verrouillage + ajustements), avances, rapports CSV.
- **Docs** — `database-schema.md`, `project-architecture.md`, `erp-modules-roadmap.md`, `next-phase.md`, journal ici.

### Vérifications effectuées

- `npm run lint`, `npm run build` — OK.
- Schéma appliqué localement via `npx prisma db push` (migrate dev peut échouer sur shadow DB `P3006` — connu, à traiter en équipe).

### Captures d’écran

- À produire sur poste cible (`npm run dev`) : « RH centre », « Présence jour », « Cycle paie » — non versionnées par défaut.

---

## Phase UX industrielle — coque poste atelier (2026-05-16)

### Livré

- **Design system workstation** : palettes neutres industriels, rayon compact, typography 13 px de base dans `tailwind.config.ts` + `globals.css`.
- **`LoginPage` refondu** : mise en page split desktop (panneau branding + bloc auth), données poste/version via IPC `APP_WORKSTATION_INFO`, santé SQLite live, pied de page légal + raccourci `Ctrl+Entrée`.
- **Sidebar industrielle permanente** : thème foncé indépendant, rail compact, mise en valeur module par barre gauche accent, footer opérationnel.
- **Topbar cockpit** : horloge algerienne `fr-DZ`, pastilles statut SQLite / hors ligne, quick actions (Rapports, Paramètres), zone notifications vierge désactivée, logout compact.
- **Dashboard opérationnel** : grille KPI industriels, tableau alertes stock simulées, vignettes RH/présences, graphique fabrication indicateur Phase 2, journal opérationnel connecté IPC `ACTIVITY_LIST` lorsque permission `activity.read`, colonne cockpit technique (hostname + version Electron).
- **IPC** : nouveau canal **`app:workstation-info`** (hostname, version `app.getVersion()`, plateforme).
- Documentation **`docs/ui-design-system.md`** réécrite, **`docs/next-phase.md`** harmonisée, entrée de journal ici.
- Architecture **`docs/project-architecture.md`** annotée (canal IPC poste).

### Vérifications effectuées

- `npm run lint` — OK.
- `npm run build` — bundle Vite + compile Electron OK.
- **Screenshots bureau** : régénération manuelle conseillée (fenêtre 1366×768) : poste `Login split + Dashboard centre opérations` à archiver ensuite dans capture interne (non versionnées ici faute périmètre dépôt).

### Notes suivantes acceptées

- Widgets KPI / alertes / présences comportent placeholders tant que modules métier Phase 2 pas branchés ; comportement fonctionnel livré : grille réelle IPC + santé système uniquement où données vivantes existantes.

---

## Phase 3 — Production industrielle & recettes (2026-05-16)

### Livré

- **Prisma** — modèles enrichis recette / nomenclature / lot / journal mélangeur ; énumérations mouvements incl. `PRODUCTION_WASTE` (aligner schéma avec `prisma db push` ou migration dédiée selon politique d’équipe).
- **Services** — `production-service.ts` (échelle consommation vs `yield`, ruptures, duplication recette, workflow batch, clôture avec `PRODUCTION_OUT`, pertes sol atelier).
- **IPC** — canaux `production:*` (recettes, lots, preview ruptures, déchet, logs, dashboard, exports CSV + déchets).
- **Shared** — `shared/schemas/production.ts` (Zod), permissions `production.read|write|execute|adjust.cost|report`.
- **UI** — `ProductionLayout` + centre de contrôle (`centre`), recettes + BOM, lots, mélangeurs, déchets, rapports CSV.
- **Seed** — MANAGER (production complet), OPERATEUR (read + execute), VIEWER (read + report).

### Vérifications conseillées

- `npm run lint` / `npm run build`.
- Flux : créer recette + lignes → créer lot → démarrer (contrôle stock) → terminer (mouvements `PRODUCTION_OUT`) → export consommation.

### Notes

- Historique migrations : en cas d’écart shadow DB (`P3006`), documenter procédure équipe (baseline ou `db push` développement).

---

## Phase 1 — Fondation industrielle & mémoire projet (2026-05-15)

### Livré

- Stack **Electron + React + Vite + Tailwind** avec TypeScript strict (`npm run lint`).
- **Preload sécurisé** — whitelist des canaux IPC (`window.samy.invoke`).
- **SQLite + Prisma** — schéma complet demandé + migration initiale `20260516000000_init`.
- **Seed** — rôles (`ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER`), utilisateur `admin`, réglages par défaut.
- **Auth locale** — bcrypt côté main, session persistante, RBAC basé sur liste de permissions JSON string.
- **Navigation modules** (Dashboard, Inventaire, Production, Ventes, Employés, Paie, Rapports, Paramètres).
- **Paramètres** — nom usine, devise, thème, dossier sauvegarde (dialog natif), imprimante (champs persistés).
- **Sauvegardes** — export fichier SQLite + liste `BackupRecord` + restauration (avec rechargement session).
- **Journal activité** — infra `ActivityLog` + liste dans Rapports pour utilisateurs autorisés.
- **Design system** — composants ERP réutilisables listés dans `docs/ui-design-system.md`.
- **Documentation mémoire IA** — fichiers `/docs/*` + `README.md`.

### Vérifications effectuées par l’agent

- `npm run lint` — exécuté après stabilisation TypeScript.
- `npm run build` — bundle Vite + compilation Electron OK.
- `npx prisma migrate deploy` + `npx prisma db seed` — OK après correction chemin Prisma CLI (`file:../.data/...`).
- Démarrage Electron — correction URL SQLite Windows + **ESM `import.meta.url`** pour chemins preload/HTML.

### Notes techniques importantes

- **DATABASE_URL Prisma CLI** : `file:../.data/samy-soft.sqlite` dans `.env` (relatif au dossier `prisma/`).
- **DATABASE_URL Electron** : définie dans `electron/database.ts` (format `file:D:/...` sous Windows).

### Dettes connues (acceptées Phase 1)

- Modules métier sont des **placeholders** — données réelles branchées Phase 2 via IPC dédiés.
- Sauvegarde automatique planifiée : **paramètres persistés**, scheduler non branché (Phase 2).

---

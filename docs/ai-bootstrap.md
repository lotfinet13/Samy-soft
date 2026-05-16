# SAMY SOFT — mémoire IA & bootstrap

Ce document permet à une nouvelle session IA de reprendre le développement **sans perte de contexte**.

## Vision produit

SAMY SOFT est un ERP **secteur glacerie / industriel léger**, pensé pour une **utilisation réelle en usine** :

- **Local-first** : tout fonctionne sans Internet.
- **Français** interface, **LTR** uniquement.
- **Grand confort tactile / clic** (zones actives larges, densité maîtrisée).
- **Rapidité de navigation** et workflows orientés productivité.

## Décisions d’architecture

- **Electron + React + Vite** — renderer isolé, IPC typée.
- **SQLite** comme unique magasin de données ; **Prisma** comme couche d’accès.
- **Zustand** pour l’état UI/session côté renderer ; **electron-store** pour la session **dans le main** (sécurité).
- **React Hook Form + Zod** pour tous les formulaires métier et écrans config Phase 1.
- **HashRouter** pour compatibilité `file://` en build bureau.
- **Pas de cloud**, pas de Docker, pas de Next.js — périmètre volontairement sobre.

## Standards de code

- TypeScript **`strict: true`** (sans « shortcuts » type `any` pour contourner le typage).
- **Imports propres** (`verbatimModuleSyntax` non activé volontairement pour compatibilité ecosystem).
- Pas de **magie** : clés paramètres dans `shared/settings-keys.ts`, canaux IPC dans `shared/ipc-channels.ts`, droits dans `shared/permissions.ts`.
- **Une seule voie** pour les mutations IPC sensibles : handlers dans `electron/ipc/handlers.ts`.

## Philosophie de dossiers

- `electron/` — processus principal, services DB/sauvegarde/auth, IPC.
- `shared/` — constantes partagées **sans dépendance React**.
- `src/` — UI React (pages, modules, composants, stores, hooks).
- `prisma/` — schéma, migrations, seed.
- `docs/` — mémoire projet (ce fichier + annexes).

## Stratégie modules ERP

Les modules sont introduits **par phases** ; Phase 1 pose navigation + sécurité + réglages + infra logs/sauvegardes.

Le cœur métier (stocks, production, paie détaillée…) sera implémenté **sur la base du grand livre** (voir philosophie DB).

## Règles Electron sécurité (résumé)

Voir `docs/security-rules.md` — non négociables :

- `contextIsolation: true`
- `nodeIntegration: false` dans le renderer
- `sandbox: true` sur `BrowserWindow`
- Preload **whitelist** des canaux IPC

## Philosophie base de données

- **Ne jamais muter directement une quantité « stock »** hors mouvements comptables (`StockMovement`, futurs modules).
- Présences → `AttendanceEntry`, paie → `PayrollRecord`, production → `ProductionBatch` + liaisons mouvements.

Les champs JSON métier sensibles sont stockés en **TEXT JSON** (compatibilité SQLite stricte avec migrations Prisma).

## UI / cohérence

Voir `docs/ui-design-system.md`.

## Patterns interdits

- Exposer `ipcRenderer` ou Prisma au renderer.
- « Backend générique » type proxy SQL depuis le renderer.
- Quantités stock « en place » sans mouvement traçable.

## TypeScript strict — règles projet

- Pas d’erreurs `tsc` sur `npm run lint`.
- Préférer typer les réponses IPC (DTO dédiés dans `src/types/ipc.ts` quand nécessaire).

## Reprise rapide pour une IA

1. Lire `docs/project-architecture.md`
2. Lire `docs/database-schema.md`
3. Lire `docs/progress-log.md` puis `docs/next-phase.md`
4. Vérifier `shared/ipc-channels.ts` avant d’ajouter un canal

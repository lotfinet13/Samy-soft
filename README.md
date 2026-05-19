# SAMY SOFT

ERP industriel **local-first**, **hors ligne**, pour glacerie (Algérie) — bureau Windows (Electron), interface **React + Vite**, données **SQLite + Prisma**.

## Prérequis

- Node.js **20+** (recommandé LTS)
- npm

## Installation

```bash
npm install
```

## Base de données (SQLite)

### Chemin partagé CLI ↔ Electron (très important)

- Prisma résout les chemins relatifs du `datasource` **depuis le dossier `prisma/`**.
- Le fichier `.env` utilise : `DATABASE_URL="file:../.data/samy-soft.sqlite"`  
  → fichier physique : **`<racine-projet>/.data/samy-soft.sqlite`** (canal `production`, Electron non packagé).
- Le processus principal assigne la même base via `electron/database.ts` → `configureDatabaseUrl()` (format `file:D:/...` sous Windows).

Autres canaux en dev (`SAMY_RELEASE_CHANNEL`) : voir `docs/release-channels.md`.

### Database Lifecycle

| Étape | Quand | Ce qui se passe |
|-------|--------|-----------------|
| **1. Résolution du chemin** | Démarrage Electron (`app.whenReady`) | `configureDatabaseUrl()` crée le dossier parent si besoin (`fs.mkdirSync`). |
| **2. Création du fichier `.sqlite`** | Premier accès Prisma (connexion + écriture) | SQLite crée le fichier à ce moment — **pas** à `git clone` seul. |
| **3. Schéma (bootstrap runtime)** | Premier lancement, base vide | `ensureDatabaseSchemaReady()` (`electron/services/database-schema-service.ts`) exécute `prisma/bootstrap-schema.sql` si la table `AppSetting` est absente et qu’aucune autre table applicative n’existe. |
| **4. Compte administrateur** | Après schéma | Si aucun utilisateur : écran `/setup` (`createInitialAdmin`) **ou** seed CLI (voir ci‑dessous). |
| **5. Assistant usine** | Connexion admin | Clé `onboarding.wizard_done` (premier lancement métier). |

**Rôle de `bootstrap-schema.sql`**

- DDL canonique généré depuis `prisma/schema.prisma` : `npm run db:bootstrap-schema`.
- Vérification anti‑dérive : `npm run verify:bootstrap-schema` (compare au diff Prisma vide → schéma).
- À l’exécution, le main enregistre une entrée `_prisma_migrations` nommée `bootstrap-schema` (idempotent si déjà présente).
- Copié dans le paquet Electron (`electron-builder` → `resources/prisma/bootstrap-schema.sql`).

**Bootstrap runtime vs `prisma migrate deploy`**

| | Bootstrap runtime (app) | `prisma migrate deploy` (CLI) |
|--|---------------------------|-------------------------------|
| **Déclencheur** | Lancement Electron, fichier SQLite vide ou sans tables métier | Commande manuelle / CI / procédure upgrade |
| **Source** | `prisma/bootstrap-schema.sql` | Dossiers `prisma/migrations/*` |
| **Usage typique** | Installateur usine, `npm run dev` premier run | Clone dev, montée de version contrôlée, `npm run verify:migrate-deploy` |
| **Ne remplace pas** | Les migrations incrémentales ultérieures sur une base **déjà** migrée | Le bootstrap automatique sur une base vide (chemins différents, même schéma cible) |

Sur un clone frais **sans** lancer l’app, `npx prisma migrate status` peut échouer (`P1003` — fichier absent) : **normal**. Soit lancer l’app une fois (bootstrap), soit initialiser via CLI :

```bash
npx prisma migrate deploy   # ou npm run db:push en itération dev
npx prisma db seed          # optionnel : compte admin seed (dev/E2E)
```

**Emplacements des fichiers**

| Contexte | Chemin |
|----------|--------|
| **Dev / Electron non packagé** (`production`) | `<racine>/.data/samy-soft.sqlite` |
| **Dev canal `beta` / `dev`** | `<racine>/.data/beta/samy-soft-beta.sqlite`, `.data/dev/samy-soft-dev.sqlite` |
| **Production packagée** | `%APPDATA%/<app>/userData/samy-soft.sqlite` (ou `userData/beta|dev/` selon canal) |
| **E2E / CI Playwright** | `<racine>/.data/e2e/samye2e.sqlite` (`SAMY_E2E_DATABASE_PATH`, prioritaire si `SAMY_E2E=1`) |
| **Contrôle CI schéma** | `.data/ci-db-push-check/fresh.sqlite` (éphémère, `verify:desktop`) |

Détail récupération / sauvegardes : `docs/database-recovery-and-migration.md`. Déploiement : `docs/deployment-guide.md`.

### Développement schéma (itération)

```bash
npm run db:migrate    # prisma migrate dev
npm run db:push       # push rapide (E2E utilise ce mode)
```

Après modification de `schema.prisma` : régénérer le bootstrap (`npm run db:bootstrap-schema`) puis `npm run verify:bootstrap-schema` avant release.

### Compte seed / mot de passe administrateur

- **Seed CLI** (`npm run db:seed`) : utilisateur **`admin`**, mot de passe **`Admin123!`** (ou **`SAMY_SEED_ADMIN_PASSWORD`**).
- **Premier lancement sans seed** : création via l’UI `/setup` (un seul admin autorisé).

### Vérification release (`verify:desktop`)

Enchaîne notamment : lint, `prisma validate`, `db push` sur SQLite vierge, `verify:bootstrap-schema`, `verify:schema-checksum`, tests unitaires + couverture, build, `e2e:ensure-db`, suite Playwright (17 scénarios). **N’utilise pas** `.data/samy-soft.sqlite` de dev — base E2E isolée.

```bash
npm run verify:desktop
```

## Scripts

| Script | Rôle |
|--------|------|
| `npm run dev` | Vite + compilation Electron + fenêtre connectée au serveur de dev |
| `npm run build` | `tsc` (main/preload) + build Vite + `prisma generate` |
| `npm run lint` / `typecheck` | Contrôle TypeScript strict (renderer + Electron) |
| `npm run verify:desktop` | Pipeline confiance release (schéma, bootstrap, build, E2E) |
| `npm run verify:bootstrap-schema` | Dérive `bootstrap-schema.sql` vs `schema.prisma` |
| `npm run db:seed` | Ré-exécute le seed Prisma |
| `npm run db:studio` | Prisma Studio |

## Développement

```bash
npm run dev
```

## Build « production locale » (sans installateur)

```bash
npm run build
```

Puis lancer Electron **sans** `VITE_DEV_SERVER_URL` pour charger `dist/index.html`.

## État Phase 1

- Auth locale bcrypt + session persistante (electron-store, processus principal).
- IPC whitelistée via preload (`window.samy.invoke`).
- Paramètres persistés (`AppSetting`), sauvegardes SQLite (`BackupRecord`), journal `ActivityLog`.
- Navigation modules + design system ERP (composants réutilisables).
- Documentation projet dans `/docs` (mémoire IA / bootstrap).

Voir `docs/progress-log.md` et `docs/next-phase.md`.

## Sécurité (résumé)

Voir `docs/security-rules.md` — en particulier : pas de `nodeIntegration`, isolation de contexte, preload minimal, sandbox fenêtre, aucune exposition générique de Prisma au renderer.

## Évolution / mise à l’échelle

Voir « Future scaling notes » dans `docs/project-architecture.md` et `docs/next-phase.md`.

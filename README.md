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
  → fichier physique : **`<racine-projet>/.data/samy-soft.sqlite`** (identique au mode développement Electron non packagé).

### Première initialisation

```bash
npx prisma migrate deploy
npx prisma db seed
```

Développement (itération schéma) :

```bash
npm run db:migrate
```

### Compte seed / mot de passe administrateur

- Utilisateur : **`admin`**
- Mot de passe par défaut : **`Admin123!`** (variable optionnelle **`SAMY_SEED_ADMIN_PASSWORD`** lors du seed)

## Scripts

| Script | Rôle |
|--------|------|
| `npm run dev` | Vite + compilation Electron + fenêtre connectée au serveur de dev |
| `npm run build` | `tsc` (main/preload) + build Vite + `prisma generate` |
| `npm run lint` | Contrôle TypeScript strict (renderer + Electron) |
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

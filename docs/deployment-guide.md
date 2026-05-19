# Guide de déploiement — SAMY SOFT

## Prérequis

- Windows x64 (cible principale).
- Droits administrateur local pour l’installation NSIS (si politique poste l’exige).
- Espace disque : base SQLite + dossier sauvegardes (prévoir plusieurs Go selon rétention ZIP).

## Artéfacts

- **Installateur** : `npm run dist:win` → `release/` (NSIS + portable, voir `package.json` → `build.win`).
- Script de **pré-flight build** équipe : `npm run verify:desktop` (lint + bundle + validation schéma Prisma).
- **Base de données** : fichier SQLite créé au **premier lancement** (écriture Prisma), pas à l’installation NSIS seule. Emplacement : `userData` packagé, `.data/samy-soft.sqlite` en dev — voir **Database Lifecycle** dans `README.md` et `docs/database-recovery-and-migration.md`.

## Première installation

1. Exécuter l’installateur ou le binaire portable.
2. Au premier lancement :
   - le processus principal crée le dossier données et le fichier SQLite si absent ;
   - **`ensureDatabaseSchemaReady()`** applique `prisma/bootstrap-schema.sql` sur une base vide (bootstrap runtime — **pas** `migrate deploy` automatique à l’exécution) ;
   - les diagnostics de démarrage signalent une dérive éventuelle bootstrap / migrations.
3. **Premier administrateur** : écran de configuration initiale (`/setup`) si aucun utilisateur — en dev uniquement, seed CLI possible (`admin` / mot de passe seed — **à changer** avant production).
4. **Assistant première installation** (compte **Administrateur**) : assistant modal (usine, dossier sauvegarde, imprimante, session) jusqu’à « Terminer » ou « Ignorer » — clé persistée `onboarding.wizard_done`.
5. **Paramètres** : nom usine, devise, dossier des sauvegardes ZIP, durée d’inactivité session, imprimante (champs persistés).

## Build renderer (aperçu)

- `npm run build` produit plusieurs chunks JS : entrée principale, routes lazy, bundle **Recharts** séparé, TanStack ; voir `docs/performance-strategy.md`.

## Variables d’environnement (développement / CI)

- `DATABASE_URL` pour CLI Prisma : typiquement `file:../.data/samy-soft.sqlite` depuis le dossier `prisma/` (aligné sur Electron dev non packagé).
- `SAMY_E2E` + `SAMY_E2E_DATABASE_PATH` : base isolée `.data/e2e/samye2e.sqlite` pour Playwright (`npm run verify:desktop`).
- `SAMY_RELEASE_CHANNEL` : bases séparées beta/dev — `docs/release-channels.md`.

## Mises à jour

- Distribution d’un nouvel installateur ou remplacement du portable.
- **Avant mise à jour** : sauvegarde ZIP depuis Paramètres (`backup.export`).
- Après mise à jour : vérifier journal d’audit, ouvrir le **Centre diagnostic** (`/diagnostics`, lien Paramètres + icône *Santé* barre supérieure lorsque disponible), et lancer un **scanner cohérence métier** si suspicion d’écarts.

## Diagnostics embarqués

Voir `docs/system-health-guide.md`. La page agrège santé SQLite, dossier backups, informations poste/version, prévisualisation maintenance et déclenchement du scan métier hors Paramètres lourds.

## Réseau

- L’ERP est **local-first** ; aucune connectivité obligatoire. La sonde `app:updates-probe` est abstraite (Phase 7+) pour canal interne futur.

## Dépannage rapide

- Échec ouverture SQLite : droits dossier `userData`, antivirus, chemin avec caractères spéciaux.
- Blocage Prisma shadow DB (`P3006`) en CI : voir `docs/next-phase.md`.

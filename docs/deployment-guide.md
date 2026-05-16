# Guide de déploiement — SAMY SOFT

## Prérequis

- Windows x64 (cible principale).
- Droits administrateur local pour l’installation NSIS (si politique poste l’exige).
- Espace disque : base SQLite + dossier sauvegardes (prévoir plusieurs Go selon rétention ZIP).

## Artéfacts

- **Installateur** : `npm run dist:win` → `release/` (NSIS + portable, voir `package.json` → `build.win`).
- Script de **pré-flight build** équipe : `npm run verify:desktop` (lint + bundle + validation schéma Prisma).
- **Base de données** : créée au premier lancement dans le répertoire applicatif (`userData`, voir `electron/database.ts` et `.data/` en développement).

## Première installation

1. Exécuter l’installateur ou le binaire portable.
2. Au premier lancement, l’application initialise SQLite et exécute les migrations Prisma attendues (flux équipe : CLI `prisma migrate deploy` avant packaging si procédure interne l’impose).
3. **Premier administrateur** : compte seedé en développement (`admin`, mot de passe seed — **à changer immédiatement** en production) ; en production sans seed, prévoir procédure équipe (création utilisateur initiale via script ou première connexion guidée).
4. **Assistant première installation** (compte **Administrateur**) : assistant modal (usine, dossier sauvegarde, imprimante, session) jusqu’à « Terminer » ou « Ignorer » — clé persistée `onboarding.wizard_done`.
5. **Paramètres** : nom usine, devise, dossier des sauvegardes ZIP, durée d’inactivité session, imprimante (champs persistés).

## Build renderer (aperçu)

- `npm run build` produit plusieurs chunks JS : entrée principale, routes lazy, bundle **Recharts** séparé, TanStack ; voir `docs/performance-strategy.md`.

## Variables d’environnement (développement / CI)

- `DATABASE_URL` pour CLI Prisma : typiquement `file:../.data/samy-soft.sqlite` depuis le dossier `prisma/` (voir `docs/progress-log.md` Phase 1).

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

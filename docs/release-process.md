# Release process — SAMY SOFT

## Objectifs

Réduire les surprises en production sur poste Windows (NSIS / portable), aligner versioning et documentation, garder SQLite + Prisma vérifiables avant empaquetage.

## Prérequis locale

1. Dépendances : `npm install`
2. Prisma à jour : `npx prisma generate`
3. Vérifications : `npm run verify:desktop`
   - enchaîne `lint`, build Vite + bundle Electron compilé (`tsc electron`), puis `prisma validate`.
4. Fumée fonctionnelle (manuel post-build) :
   - connexion utilisateur administrateur ou compte test ;
   - **Centre diagnostic** (`/diagnostics`) : heartbeat DB OK, préflight sauvegardes acceptable, scan métier ;
   - **Inventaire** : ajustement rapide tableau + cohérence alertes tableau de bord après invalidation TTL ;
   - **Ventes** : brouillon, `Ctrl`+`Entrée` sur bloc lignes, validation simple.

## Versioning affichée

- `package.json` → champ `version` (semver interne artefacts).
- `electron` → `app.getVersion()` relit cette version sur le renderer (voir page diagnostic & barre système lorsque configurée dans l’installer NSIS portable).

Pour une release officielle : augmenter semver, tag Git local (si repo initialisé), archiver artefacts `release/*.exe`.

## Sortie artefacts Windows

Script : `npm run dist:win`

- Sortie dossier configurée : `release/` (electron-builder).
- Cibles : installer NSIS + exécutable **portable** (cf. `package.json → build.win.target`).

## Notes & marketing

Architecture **release notes courte** :

| Emplacement                                  | Usage                                      |
| ------------------------------------------- | ------------------------------------------ |
| `docs/progress-log.md`                      | journal technique synthétique par phase |
| `README.md`                                  | changelog court grand public DSI          |
| (optionnel) fichier `CHANGELOG.md` projet   | semver détaillé si équipe agrandit scope  |

Rédiger en français métier : périmètre module, corrections bloquantes, actions opérateurs (ex. nouveau raccourci, nouvelle page santé système).

## Après diffusion

Prévenir les postes industriels : fermer SAMY SOFT, sauvegarder SQLite via module Paramètres, remplacer binaire puis smoke test diagnostics + connexion.


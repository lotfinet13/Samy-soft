# Stratégie performance — SAMY SOFT

## Objectifs

- **Démarrage** : bundle renderer réduit (code-splitting routes, isolation Recharts).
- **Listes longues** : virtualisation corps de tableau (`@tanstack/react-virtual` + `@tanstack/react-table`).
- **Données répétées** : cache TTL court côté renderer pour limiter les rafales IPC non critiques.

## Virtualisation des tableaux

- Composant `DataTable` : virtualisation automatique lorsque le nombre de lignes ≥ **18** (seuil configurable via props). En dessous, rendu classique pour éviter l’overhead sur les petites listes.
- **Présence journalière** (`HrAttendanceDayPage`) : même principe à partir de **16** employés ; lignes éditables restent pilotées par l’état React (pas de perte de saisie hors écran autre que le démontage normal des lignes).

Navigation clavier dans le conteneur scrollable des `DataTable` virtualisés :

- **Flèches haut / bas** : défilement par pas de ligne estimé.
- **Page haut Page bas** : défilement par ~85 % de la hauteur visible.

## Bundle Vite

- `manualChunks` : `recharts`, `@tanstack/*`, `lucide-react` extraits pour mettre en cache navigateur / chargement parallèle.
- Routes métier : `React.lazy` dans `src/pages/lazy-pages.ts`, boundary **`Suspense`** dans `AppShell` avec `RouteFallback`.

## Graphique tableau de bord

- `DashboardProductionChart` chargé en **lazy** avec suspense local sur la page d’accueil pour ne pas bloquer le premier rendu.

## Cache TTL renderer

- Module `src/lib/ttl-cache.ts` : `cacheGetOrSet`, `cacheInvalidatePrefix`.
- Tableau de bord : résumé inventaire (IPC `inventory:dashboard:summary`) — cache **45 s** sur le premier chargement ; **rafraîchissement périodique toutes les 2 min** sans cache pour limiter la dérive ; clé `CACHE_KEYS.INVENTORY_DASHBOARD_SUMMARY`.

**Invalidation TTL (Phase 10)** : après mutations critiques (mouvements `/ achats`, ajustements express matières, lots clôturés ou annulés, ventes `validate/cancel/lines/header`, paiements, paie cycles & ajustements, produits catalogue), les pages appellent les helpers dans `src/lib/invalidate-ui-cache.ts` qui purgent les préfixes `ipc:inventory:*`, `ipc:sales:*`, `ipc:hr:*`, `ipc:reports:*` selon les domaines. L’alerte rupture tableau de bord relit alors un IPC réel au prochain `cacheGetOrSet`.

## Profilage Chromium (recommandé)

1. Ouvrir les DevTools (inspecteur distant Electron ou `ELECTRON_ENABLE_LOGGING`).
2. **Performance** : enregistrer 20–30 s pendant scroll dans une grille virtualisée (mouvements stock, factures).
3. **Memory** : snapshot avant/après navigation module ; vérifier que les instances de graphiques ne croissent pas indéfiniment (take heap snapshot).
4. **Rendering** : activer « Paint flashing » pour valider la zone invalidee lors du scroll virtualisé.

## Pistes suivantes

- Pagination IPC serveur pour les très grands exports (CSV déjà côté métier).
- Import dynamique additionnel des écrans **Reporting** les plus lourds si besoin.

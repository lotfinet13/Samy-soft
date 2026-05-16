# UI — système SAMY SOFT (ERP industriel poste fermé)

## Philosophie UX

SAMY SOFT n’est pas un tableau SaaS marketing : c’est une **application de pilotage fabrication** destinée aux **postes atelier**. La hiérarchie visuelle doit rappeler **Odoo, terminaux POS / WMS industriels**, clients comptabilité desktop et autres logiciels industriels :

- densité fonctionnelle prioritaire ;
- **Chrome sombre durable** dans la sidebar (toujours actif même en thème clair contenu), surfaces contenu sobres ;
- parcours clavier évidents : puces TAB/Entrée, raccourcis documentés ;
- zéro **hero marketing**, aucune « carte géante » ;
- palettes **sans dégradés expressifs**.

## Cibles fenêtre / densité

- **Primaire** : 1366×768 px (notebook atelier catalogue).
- **Secondaire** : 1920×1080 (open space / supervision bureau).
- `AppShell`, `Sidebar`, `Dashboard` utilisent grids flexibles : pas de comportement « mobile-first » (Electron démarre fenêtre minimale déjà bureau).

Tokens globaux : Tailwind **`min-h-touch` / `min-w-touch`** abaissés à **≈ 36 px** pour gagner densité ; éviter agrandissement non raisonné des gabarits.

## Couleurs

| Token CSS | Usage |
|-----------|-------|
| `--color-sidebar-*` | Navigation modules (toujours gris/indigo sombre `#1c2129` tonalité) ; lisibilité forte sur poste retardé luminosité. |
| `--color-surface*` | Zones contenu : couches empilées très proches neutre (différenciations minimales comme les logiciels industriels anciens revisités). |
| `--color-border*` | Séparateurs fins (par défaut léger ; forte pour cases à cocher critiques). |
| `--color-accent` | Actions primaires ; bleus **sans glow** ni halo marketing. |
| `--color-danger*` | États critiques (auth KO, santé SQLite dégradée). |

Guidelines :

- Sidebar **≠** surface contenu : ne pas recycler la même teinte ; évite faux positif « thème monochrome startup ».

## Typographie & titres opérationnels

- Base **≈ 13 px**, interligne resserré (`line-height 1.38`).
- Étiquettes de champs : capitales géométriques ; niveaux titre page **≤ 20 px** pour limiter rupture avec logiciels anciens encore déployés.
- Prévoir `font-mono` uniquement où utile : valeurs KPI, métadonnées machine, timestamps.

Éviter : typography « landing » (lettres géantes et marges abyssales).

## Spacing compact

Référencées via classes utilitaires + variables `--erp-radius-panel` :

| Usage | Guidance |
|-------|----------|
| Panneaux / cartes KPI | rayon **4 px** (`--erp-radius-panel`), padding **`p-3`–`p-4`**. |
| Champs | `.control-chrome` (coins **3 px**). |
| `AppShell.main` | `px-5 py-4` : plus dense que ancien gabarit `p-8` + `max-w-7xl`. |

## Composants clés (`src/components/ui/` — alignement ERP)

| Composant | Notes industrielles |
|-----------|---------------------|
| `StatCard` | KPI compacts : label uppercase petite taille ; valeur en `tabular-nums` ; ombre **interne**. |
| `PageHeader` | Titre **`text-xl`** + sous-texte fonctionnel ; slot actions petits boutons bord `.control-chrome`-like (pas géants pills). |
| `FormField` | Labels uppercase légers ; espacement `< 24 px vertical`. |

Autres primitives existantes conservées (`DataTable`, `Modal`, `ConfirmDialog`, `EmptyState`…) mais doivent hériter de la grille compacte : éviter **`rounded-[32px]`** sauf motifs historiques précis ; défaut désormais `rounded-*` fins.

## Patterns layout

| Surface | Obligation |
|---------|------------|
| `layouts/AppShell` | Sidebar industrielle + Topbar opérationnelle + Outlet pleine largeur. |
| Sidebar | Badge **plate** `SS`, **barre gauche accent** lorsque module actif ; collapsed **« narrow rail ». |
| Topbar | Horloge française `fr-DZ` ; pastilles santé ; quick actions ; utilisateur ; logout. |
| `LoginPage` | Split **desktop** : panneau métadonnées + formulaire ; pied de page légal / raccourcis. |
| `DashboardPage` | « Centre des opérations » : KPIs industriels ; tableau alertes ; grille présences (placeholders jusqu’Phase 2–3). |

## Charts

- Restent **discrets**, barres rectangles (`radius 2`).
- Tooltip minimal (bord léger ; typo 12 px).

## Accessibilité

- Maintien `focus-ring` (accent + offset léger : **1 px**) pour Electron clavier physique.
- Raccourci documentés (ex. `Ctrl + Entrée` sur Login).
- États désactivés explicites (notifications placeholder).

## Thème utilisateur (`ThemeSync`)

- Le corps (`html.dark`) peut re-colorer zones contenu ; **sidebar conserve tokens `--color-sidebar-*` dédiés** pour perception « ERP classique » même utilisateur passe en fond sombre contenu — barre conserve identité forte.

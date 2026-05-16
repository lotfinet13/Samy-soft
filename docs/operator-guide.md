# Guide opérateur — raccourcis & flux quotidiens

SAMY SOFT est optimisé pour un usage **clavier + souris** sur poste industriel Windows.

## Tableaux (longues listes)

Les grilles **inventaire, mouvements, factures, journal d’audit**, etc., **virtualisent** le corps du tableau lorsque la liste dépasse environ **18 lignes** : seules les lignes visibles sont rendues — défilement fluide sur poste atelier.

- Cliquez dans la zone du tableau (elle prend le focus) puis utilisez **Flèche bas / haut** et **Page bas / haut** pour faire défiler sans la souris.
- La **grille présence jour** se virtualise au-delà de **16** employés (saisie inchangée).

Détails techniques : `docs/performance-strategy.md`.

## Raccourcis globaux

| Raccourci | Action |
|-----------|--------|
| **Ctrl+K** | Ouvre la palette de navigation (recherche / filtres). |
| **Ctrl+F** | Idem — recherche rapide (même palette). |
| **Ctrl+Shift+N** | Ouvre la palette en mode **flux opérateur** (achats, mouvements, lots, factures, présence, paie en tête de liste). |
| **Alt+1 … Alt+9** | Bascule vers le **nième** module visible dans la barre latérale (selon permissions). *Désactivé pendant la saisie dans un champ texte.* |
| **Ctrl+S** | Dans un formulaire : déclenche le premier bouton **Envoyer** actif du formulaire courant. |
| **Échap** | Ferme la palette si elle est ouverte. |
| **Icône *Santé* (XL écran)** | Ouvre **`/diagnostics`** (droits lecture paramètres) — préflight santé SQLite & sauvegardes. |

## Inventaire express

- Dans **Matières / Emballages**, **F2** sur la colonne quantité ouvre un ajustement `MANUAL_ADJUSTMENT` ciblé (droits `inventory.adjust`) ; **Entrée** valide, **Échap** annule.
- Menu **⋯** par ligne : fiche complète ou copie SKU presse-papiers.

## Facturation brouillon

- Sur le bloc **Lignes (brouillon)**, placez le focus dans la section puis **Ctrl+Entrée** déclenche **Appliquer lignes** (équivalent bouton).

## Filtres mémorisés

- **Inventaire matières**, **Factures ventes**, **Journal d’audit** : puces *récent / mémorisé* pour réappliquer une recherche ; bouton **Mémoriser** pour enregistrer une vue textuelle.

## Palette de navigation

- Champ **Filtrer** : tapez quelques lettres pour réduire la liste.
- **Flèches haut / bas** : parcourir les entrées.
- **Entrée** : ouvrir la page sélectionnée.
- **Tab / Maj+Tab** : cycle de sélection dans la liste (sans quitter la palette).

## Flux recommandés (minimum de clics)

- **Entrée stock** : `Ctrl+Shift+N` → « Nouvel achat fournisseur » ou « Mouvements & ajustements stock ».
- **Lancer production** : palette → Production / Lots (ou raccourci module **Alt+3** si Inventaire=2, Production=3 — selon liste permise).
- **Facturation** : palette → Ventes / factures ou action « Factures & brouillons ».
- **Pointage du jour** : action rapide « Présence du jour ».
- **Rapports & audit** : module Rapports ou bouton « Journal » dans la barre supérieure.

## Cohérence des données (admin / responsable)

Sous **Paramètres** ou **Centre diagnostic**, le bouton **Scanner cohérence métier** contrôle en lecture seule : stocks théoriques négatifs, anomalies facture/paiement, bulletins de paie vs cycle verrouillé, lots terminés sans quantité, incohérences de mouvements stock. En cas d’alerte, transmettre le **code** affiché (ex. `STOCK_NEGATIVE_RAW`) au support technique.

## Sessions longues

- Utiliser le **verrouillage d’inactivité** pour les postes partagés.
- Laisser l’application se mettre en pause plutôt que de multiplier les onglets système inutiles (une instance ERP suffit par session métier).

Pour le déploiement et les sauvegardes, voir `docs/deployment-guide.md` et `docs/backup-recovery-guide.md`.

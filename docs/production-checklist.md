# Check-list lancement production — SAMY SOFT

Utiliser cette liste avant bascule « exploitation » sur un poste ou un parc.

## Sécurité & comptes

- [ ] Mots de passe par défaut du seed **changés** (compte admin / opérateurs de test).
- [ ] Rôles RBAC vérifiés pour chaque profil réel (inventaire, production, ventes, paie, rapports).
- [ ] Verrouillage session (idle + overlay) configuré selon politique atelier.

## Données & intégrité

- [ ] `PRAGMA integrity_check` / diagnostic SQLite (Paramètres → maintenance) **OK**.
- [ ] **Scanner cohérence métier** exécuté : stocks, factures, paie, lots (Paramètres).
- [ ] Aucune anomalie `foreign_key_check` non traitée avant exploitation.

## Sauvegardes

- [ ] Dossier de sauvegarde ZIP défini, accessible en écriture, inclus dans la stratégie de copie hors poste.
- [ ] Test **restauration** sur poste de secours (archive + redémarrage applicatif).
- [ ] Quota de rétention et planification (scheduler Phase 7) validés.

## impression & export

- [ ] Imprimante par défoint et format papier renseignés (Paramètres).
- [ ] Tirage test PDF facture / bulletin / inventaire selon périmètre client.

## Build & packaging

- [ ] `npm run lint` et `npm run build` sans erreur.
- [ ] `npm run dist:win` produit NSIS + portable ; installation test sur machine vierge.

## Exploitation

- [ ] Poste stabilisé (alimentation, session Windows, pas de mise veille agressive sur ligne de saisie).
- [ ] Opérateurs formés : raccourcis clavier (`docs/operator-guide.md`) et flux « brouillon → validation ».

## Après mise en service

- [ ] Point hebdo : consulter santé sauvegardes (badge / Paramètres) et journal d’audit.

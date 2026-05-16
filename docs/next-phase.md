# Phase suivante — SAMY SOFT

> **Phase 12** prépare le multi-postes LAN et les extensions industrielles sans casser le mono-poste local-first — voir `docs/progress-log.md`.

## Priorités recommandées

1. **POC maintenance UI** — écrans machines, planning préventif, downtime et historique réparations.
2. **POC codes-barres** — saisie scanner USB clavier, mapping SKU, impression étiquette sans pilote propriétaire.
3. **Prévision achats UI** — tableau matières à risque, fournisseur principal, date de réassort recommandée.
4. **Mode tactile opérateur** — profils POS / présence / journal production avec cibles ≥ 48 px.
5. **POC LAN contrôlé** — serveur local de test, jamais partage direct du fichier SQLite.

## Technique

- Brancher progressivement `OperationalVersion` sur les transitions critiques si le besoin multi-utilisateur devient réel.
- Garder `SyncEnvelope` comme journal conceptuel tant que la stratégie cloud n’est pas décidée.
- Valider les migrations Phase 12 sur une copie de production avant tout déploiement atelier.

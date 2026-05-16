# Préparation cloud sync future — SAMY SOFT

## Non-objectif Phase 12

Aucun cloud sync n’est implémenté. Aucun service externe, token, webhook ou télémétrie réseau n’est ajouté.

## Philosophie offline-first

```
SQLite local / SQL atelier
  → export signé
  → SyncEnvelope
  → import contrôlé
  → scan intégrité
  → validation opérateur
```

## Frontières préparées

- `SyncEnvelope` journalise export/import, checksum, statut et erreurs.
- Les services métier restent côté main/Node et peuvent être exposés plus tard par API.
- Les snapshots prévisionnels et analytiques sont dérivés et régénérables.

## Réplication conceptuelle

1. Exporter un lot d’événements métier append-only : mouvements stock, factures validées, paiements, clôtures batch, paie verrouillée.
2. Signer ou hasher le payload.
3. Importer dans une zone de staging.
4. Vérifier versions, clés uniques et invariants.
5. Appliquer ou rejeter avec rapport opérateur.

## Conflits non fusionnables

- Stock physique négatif.
- Facture déjà validée/annulée.
- Cycle paie verrouillé.
- Batch déjà clôturé.
- Présence existante pour salarié/jour.

## Préparation sécurité

- Chiffrement au repos et en transit à décider uniquement lors du POC cloud.
- Pas de données RH ou financières envoyées automatiquement.
- Support via bundles diagnostics exportables, jamais par télémétrie cachée.

# Stratégie de concurrence — SAMY SOFT

## Principe

La version actuelle reste mono-utilisateur. La Phase 12 documente les points de verrouillage pour éviter d’éparpiller les décisions quand un serveur LAN sera ajouté.

```
Commande utilisateur
  → IPC handler
  → service métier
  → transaction
  → optimistic version check
  → pessimistic lock si transition critique
  → commit + ActivityLog
```

## Workflows critiques

| Workflow | Risque futur | Garde recommandée |
| --- | --- | --- |
| Validation facture | double validation, stock emballage négatif | version `Invoice` + verrou stock court |
| Mouvement stock | solde lu par deux postes | transaction + append-only `StockMovement` |
| Verrou paie | recalcul pendant clôture | verrou pessimiste `PayrollCycle` |
| Clôture batch | double consommation MP | verrou `ProductionBatch` + relire ruptures |
| Présence | deux saisies même salarié/jour | unique `workerId/workedDate` + recharge UI |

## Philosophie de conflit

- Le système ne fusionne pas silencieusement les écritures financières, stock ou paie.
- Le premier commit valide gagne si l’invariant métier reste correct.
- Le second opérateur recharge l’écran, voit l’état à jour, puis rejoue l’action.
- Les corrections passent par mouvements, ajustements ou logs audités.

## Tables préparatoires

- `OperationalVersion` : version logique par entité métier.
- `OperationalLock` : verrou court avec propriétaire, expiration et raison.
- `ActivityLog` : audit humain et support.

## Compatibilité mono-poste

Ces tables peuvent rester vides. Les workflows actuels continuent via les transactions Prisma existantes.

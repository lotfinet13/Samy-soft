# Stratégie de déploiement LAN — SAMY SOFT

## Position Phase 12

SAMY SOFT reste mono-poste local-first. Le LAN est préparé, pas activé.

## Topologie recommandée

```
Atelier
  ├─ Poste caisse / ventes
  ├─ Poste production tactile
  ├─ Poste RH / direction
  └─ Mini-serveur local
        ├─ API SAMY SOFT future
        ├─ PostgreSQL ou SQL Server
        ├─ sauvegardes planifiées
        └─ onduleur + partage administré
```

## Règles de déploiement

- Garder la base SQLite actuelle pour les installations mono-poste.
- Ne pas partager directement le fichier SQLite sur SMB/NAS pour l’usage simultané.
- Pour le vrai LAN, centraliser les écritures derrière un serveur applicatif local.
- Garder les exports ZIP comme plan de reprise tant que le LAN n’est pas livré.

## Chemin de migration

1. Certifier le poste actuel avec scan intégrité et sauvegarde ZIP.
2. Installer serveur atelier isolé du Wi-Fi invité.
3. Migrer les données vers SQL central.
4. Tester validation facture, clôture lot, verrou paie et présence simultanée.
5. Activer les postes clients un par un.

## Points de surveillance

- Latence validation facture < 300 ms en réseau filaire.
- Sauvegarde serveur quotidienne + test restauration mensuel.
- Journaux d’audit conservés après migration.
- Imprimantes thermiques exposées par poste, pas par base de données.

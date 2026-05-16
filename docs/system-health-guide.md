# Guide — Centre diagnostic / santé système

SAMY SOFT expose une page **Centre diagnostic** (route **`/diagnostics`**, lien depuis **Paramètres** ou icône **Santé** dans la barre supérieure si `settings.read`).

## Accès et permissions

Navigation visible aux profils ayant **`settings.read`**. Actions de maintenance SQLite lourdes (VACUUM) restent depuis **Paramètres** ; cette page se concentre sur **lectures** et **contrôle métier** rapide avant campagne industrielle ou après incident poste.

## Panneaux

1. **Base de données** — ping `IPC db:health` (`SELECT 1`). Incident = problème fichier SQLite, fichier verrou ou corruption bas niveau nécessitant restauration sauvegarde.
2. **Sauvegardes** — `backup:health` : dernier ZIP, dernier résultat d’intégrité archive, alarme péremption TTL.
3. **Poste & build** — hôte réseau, version packagée Electron, plateforme (win32 darwin linux).
4. **Prêt production** — synthèse booléenne (ping DB, PRAGMA intégrité, violations FK présumées vide, archive backup fraîche, dernier scan métier si exécuté).
5. **Maintenance SQLite & stockage** — extrait PRAGMA, listing approximatif lignes grandes tables métier (`ActivityLog`, `Invoice`, `InventoryMovement`, `ProductionBatch`, `BackupRecord`), chemin fichier base + taille fichier.
6. **Contrôle métier** — lance **`db:data-integrity:scan`** (lecture seule) : anomalies stocks négatifs, mouvements incohérents, désalignements cycle paie vs bulletins brouillon, lots complétés sans volume, alertes paiements si implémentées côté service.

## Interprétation rapide opérateur

| Indicateur rouge ou libellé « À traiter »                     | Action typique                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| SQLite incident                                               | Consulter dossier données, fermer autres instances du fichier, envisager restore   |
| PRAGMA différent `ok`                                         | Export immédiat + support technique DSI                                            |
| Clés étrangères SQLite                                        | Suspicion corruption logique ; éviter validations massives, lancer scan métier      |
| Sauvegarde périmée                                            | Déclencher export ZIP depuis Paramètres                                            |
| Findings erreur niveau métier (`STOCK_NEGATIVE_*`, etc.)       | Pause campagne stock ; corriger mouvements / support technique                     |

## Après mise à niveau SAMY SOFT

Ouvrir le centre → **Ping DB OK** puis **Actualiser synthèse** maintenance → au besoin **Lancer scan** métier avant réouverture grands flux atelier.


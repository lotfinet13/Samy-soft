# Sauvegarde & restauration — SAMY SOFT

## Format Phase 7 (ZIP_V1)

Les sauvegardes sont des archives ZIP contenant au minimum :

- Fichier base **`database.sqlite`** (copie cohérente au moment de l’export).
- **`manifest.json`** (méta + empreintes pour contrôle d’intégrité).

Le service `electron/services/backup-service.ts` vérifie l’archive avant restauration lorsque l’option de vérification est active.

## Bonnes pratiques

1. **Fréquence** : alignée sur le rythme métier (quotidien minimum conseillé en usine).
2. **Rétention** : paramètre `backup.retention.max_archives` — rotation automatique des fichiers les plus anciens au-delà du quota.
3. **Hors poste** : copier les ZIP vers un média ou partage réseau **read-only** pour limiter ransomware.
4. **Avant restauration** : informer les utilisateurs connectés ; la restauration remplace la base active.

## Restauration (Paramètres)

1. Choisir l’enregistrement dans l’historique ou utiliser un chemin déjà référencé par `BackupRecord`.
2. Lancer **Vérifier ZIP** si l’archive n’a pas été contrôlée récemment.
3. **Restaurer** : opération sensible (permission `backup.restore`) ; relancer l’application si le flux l’exige.
4. Après restauration : ouvrir l’ERP, vérifier session, lancer **scanner cohérence métier** et un échantillon de flux (stock, facture).

## VACUUM & intégrité SQLite

- `PRAGMA integrity_check` et `foreign_key_check` sont exposés dans la section maintenance (Paramètres).
- **VACUUM** compacte le fichier ; peut prendre du temps — à planifier hors pointe.

## En cas d’incident

- Ne pas modifier manuellement le fichier SQLite sous l’application ouverte.
- Préférer une restauration depuis ZIP validé plutôt qu’un copier-coller brut, pour respecter le manifeste Phase 7.

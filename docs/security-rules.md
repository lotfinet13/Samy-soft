# Règles de sécurité — SAMY SOFT (Electron + données locales)

## Modèle de menace (réaliste usine)

- Poste partagé / accès physique.
- Utilisateurs honnêtes mais risque d’erreur / manipulation fichier SQLite.
- Pas d’exposition Internet requise — surface d’attaque **principalement locale**.

## Principes non négociables

1. **Renderer sans Node** — `nodeIntegration: false`.
2. **Isolation de contexte** — `contextIsolation: true`.
3. **Sandbox navigateur** — `sandbox: true` sur la fenêtre principale Phase 1.
4. **Preload minimal** — uniquement `invoke` sur canaux whitelist (`shared/ipc-channels.ts`).
5. **Secrets** — pas de secrets serveur ; mot de passe utilisateur = **hash bcrypt** uniquement dans SQLite.
6. **Session** — stockée côté **main** via `electron-store` (pas dans localStorage renderer).

## CSP renderer

- `index.html` définit une CSP stricte pour `default-src 'self'`.
- En développement, `connect-src` inclut `127.0.0.1:5173` pour Vite — **revoir avant packaging** si endpoints réseau internes ajoutés.

## Sauvegarde / restauration

- Archives **ZIP Phase 7** `{ database.sqlite , manifest.json }` — vérif automatique avant restauration.
- Rotation locale (`backup.retention.max_archives`) + historique dans `BackupRecord`.
- Chemins restrints : dossier configuré **ou** enregistrements connus dans `BackupRecord`.
- Session **Electron main** peut expirer côté UI (minutes + verrou facultatif configurables).

## Idle & ergonomie industrielle

- Verrouillage inactivité (overlay) ou déconnexion guidée après délai.
- Palette **Ctrl+K** / **Ctrl+F**, mode création **Ctrl+Shift+N**, modules **Alt+1–9** (voir `docs/operator-guide.md`), **Ctrl+S** sur formulaires.

## Diagnostics & audit

- Scan **cohérence métier** (stocks, factures, paie, lots) : IPC lecture seule, résultat journalisé (`DATA_INTEGRITY_SCAN`) ; ne remplace pas les contrôles SQLite PRAGMA.

## À implémenter plus tard

- Chiffrement au repos du fichier SQLite (sélection SME).
- Politique de mot de passe / rotation forcée configurable.
- Signature ou contrôle d’intégrité des bundles pour mise à jour offline.

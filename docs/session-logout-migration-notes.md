# Session / logout reliability — migration notes (0.2.x)

## Schema changes

**None required.** `ActivityLog.userId` remains optional; orphan sessions write `userId: null` with `previousUserId` in `metadata` JSON.

Optional future hardening (not in this patch):

```prisma
user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
```

## Runtime behavior changes

| Area | Before | After |
|------|--------|-------|
| Session file | Global `session.json` per app | `session-<db-hash>.json` scoped to SQLite path |
| Logout | Always `LOGOUT` with stored `userId` | Validates user row; `LOGOUT` or `LOGOUT_ORPHAN` |
| Startup | Stale session until failed logout | `reconcileStaleSessionAtStartup` → `SESSION_INVALIDATED` |
| ActivityLog insert | Blind FK | Rejects unknown `userId` at `logActivity` (defense in depth) |

## Related fix: settings persistence on restart

`ensureDefaultSettings()` previously **overwrote** all `AppSetting` rows on every `bootstrap:status` poll (each app launch). It now uses `upsert` with `update: {}` so only **missing** keys are inserted. This restores SQLite-backed settings (factory name, backup path, etc.) across cold restarts.

## Operator impact

- After upgrade, first launch may clear an invalid desktop session once (user re-logs in).
- Session file name changes from `session.json` to `session-<db-hash>.json` (one-time re-login; old file is ignored).
- Audit journal may show `SESSION_INVALIDATED` or `LOGOUT_ORPHAN` rows after E2E-style DB resets — expected, not data corruption.

## E2E / CI

Re-run `npm run e2e:ensure-db` and `npm run factory:simulation` after pulling this patch.

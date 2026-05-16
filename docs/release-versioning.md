# Release versioning — SAMY SOFT

## Semantic versioning

SAMY SOFT uses semantic versioning:

- `MAJOR` changes persisted data contracts, deployment topology, or operator workflows in incompatible ways.
- `MINOR` adds backward-compatible modules, screens, reports, or hardware-ready architecture.
- `PATCH` fixes bugs without changing supported workflows.
- Pre-release suffixes mark certification state: `-alpha`, `-beta`, `-rc.N`.

Current milestone: `v1.0.0-rc1`.

## Tag names

- Release candidate: `v1.0.0-rc1`, `v1.0.0-rc2`.
- Stable release: `v1.0.0`.
- Hotfix release: `v1.0.1`.
- Internal LAN proof of concept: `lan-poc/YYYY-MM-DD` only if explicitly approved.

## Release branches

Create release branches from `main`:

```bash
git checkout -b release/v1.0.0
```

Only allow fixes, docs, migrations already approved for the release, and certification updates. New features return to `feature/*` or `develop`.

## Migration safety

- Every Prisma schema change must have a migration in `prisma/migrations/`.
- Test migrations against a copied production database before tagging.
- Keep derived analytics and forecast snapshots regenerable.
- Back up before migration, run integrity scans after migration, and document any manual repair.

## Tagging checklist

Before creating a tag:

```bash
npx prisma validate
npm run lint
npm run build
npm run e2e
```

Then tag the verified commit:

```bash
git tag -a v1.0.0-rc1 -m "SAMY SOFT first production release candidate"
```

Production tags must point to commits with clean status and no ignored runtime data forced into Git.

## Release history

### `v1.0.0-rc1` — first production release candidate

- Scope: production-certified local-first industrial ERP baseline.
- Verification: clean Git status, Prisma validation, TypeScript lint, production build, and E2E suite.
- Migration policy: Prisma migrations preserved under `prisma/migrations/`; generated SQLite databases remain ignored.

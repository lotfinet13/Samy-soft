# Release versioning — SAMY SOFT

## Semantic versioning

SAMY SOFT uses semantic versioning:

- `MAJOR` changes persisted data contracts, deployment topology, or operator workflows in incompatible ways.
- `MINOR` adds backward-compatible modules, screens, reports, or hardware-ready architecture.
- `PATCH` fixes bugs without changing supported workflows.
- Pre-release suffixes mark certification state: `-alpha`, `-beta`, `-rc.N`.

Current milestone: `v1.0.0-rc`.

## Tag names

- Release candidate: `v1.0.0-rc.1`, `v1.0.0-rc.2`.
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
```

Then tag the verified commit:

```bash
git tag -a v1.0.0-rc.1 -m "SAMY SOFT v1.0.0 release candidate 1"
```

Production tags must point to commits with clean status and no ignored runtime data forced into Git.

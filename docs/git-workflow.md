# Git workflow — SAMY SOFT

## Branches

- `main` : production-ready baseline. Only merge verified release, hotfix, or stabilization work.
- `develop` : optional integration branch for multi-feature phases.
- `feature/<scope>` : isolated development, for example `feature/maintenance-ui`.
- `lan/<scope>` : future LAN experiments. Never mix with emergency fixes.
- `release/vX.Y.Z` : release hardening, packaging, migration checks, and final docs.
- `hotfix/vX.Y.Z+N` : urgent production repair from `main`, merged back into active release/develop lines.

## Commit conventions

Use concise conventional commits:

- `feat:` user-visible functionality.
- `fix:` production bug or data correctness repair.
- `docs:` documentation only.
- `test:` automated test or fixture work.
- `chore:` repository, build, packaging, or maintenance work.
- `refactor:` internal change without behavior change.
- `perf:` measurable performance improvement.

Keep commits recovery-friendly: one business concern per commit, migrations beside the code that needs them, and docs updated in the same commit when behavior changes.

## Review checklist

- No `.env`, SQLite databases, backups, logs, installers, or build artifacts are tracked.
- Prisma migrations under `prisma/migrations/` are preserved.
- `npm run lint`, `npm run build`, and `npx prisma validate` pass before release branches.
- Data-changing workflows include rollback notes or migration safety notes.

## Rollback strategy

1. Prefer `git revert <sha>` for production history.
2. Restore data from the latest verified ZIP/server backup when a migration changed persisted data.
3. For release branches, tag the last known good commit before applying risky migrations.
4. Never rewrite published production history unless the repository owner explicitly approves it.

## Initial baseline

The first repository baseline is the production-certified local-first ERP state. Future LAN work must stay isolated until it has its own migration, backup, and conflict-resolution validation.

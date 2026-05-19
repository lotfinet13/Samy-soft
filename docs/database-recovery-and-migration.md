# Database recovery and migration strategy

SAMY SOFT ships as a **local-first Electron ERP** using **SQLite** and **Prisma**. Production installs rely on **`bootstrap-schema.sql`** (generated from `prisma/schema.prisma`) when `prisma migrate deploy` is not the primary path.

---

## Fresh install process

1. Install the desktop build (NSIS/portable).
2. On first launch, the main process:
   - Resolves the database file under user data (or `SAMY_E2E_DATABASE_PATH` in tests).
   - Applies `bootstrap-schema.sql` if the file is new or empty.
   - Runs `ensureDefaultSettings` and seed only when no admin user exists.
3. Complete the onboarding wizard (`onboarding.wizard_done`).
4. Verify health: **Paramètres → Santé système** or IPC `system:startup-diagnostics`.

**Developer / CI fresh DB:**

```bash
npm run e2e:ensure-db    # push + seed + fixtures (isolated .data/e2e/)
npm run verify:bootstrap-schema
```

---

## Backup strategy

| Layer | Mechanism |
|-------|-----------|
| Operator | **Paramètres → Sauvegardes** — export ZIP via `backup:export` |
| Automatic | Optional scheduler (`backup.auto.*` settings) |
| File-level | Copy the SQLite file while the app is **closed** |

**Recommended factory practice:** daily ZIP export to a network share + weekly cold copy of the `.sqlite` file after closing SAMY SOFT.

---

## Migration recovery

### Current state (0.2.x)

- `prisma/migrations/` contains the historical chain (`init` → phase migrations).
- Packaged/runtime bootstrap uses **`electron/resources/bootstrap-schema.sql`**, kept in sync via:

```bash
npm run db:bootstrap-schema
npm run verify:bootstrap-schema
```

### If `prisma migrate deploy` fails on an existing DB

1. **Do not delete** the production database.
2. Export a backup ZIP from the app.
3. Compare drift: `npm run verify:bootstrap-schema`.
4. For dev clones: `prisma db push` against a **copy** of the file, then regenerate bootstrap SQL.
5. Planned stabilization: **squash** migrations to a single baseline matching `bootstrap-schema.sql` (see roadmap below).

**Release gates (0.2.x):**

```bash
npm run verify:schema-checksum    # SHA-256 manifest (prisma/schema-checksums.json)
npm run verify:bootstrap-schema   # drift vs schema.prisma
npm run verify:migrate-deploy     # clean SQLite + migrate deploy
npm run db:backup-before-migrate  # copy DB before local migrate dev
```

### Idempotent bootstrap

- Bootstrap SQL uses `CREATE TABLE IF NOT EXISTS` / guarded indexes where applicable.
- Second startup must **not** duplicate seed users: seed runs only when `User` count is zero.
- E2E restart spec asserts fixture supplier count remains **1**.

---

## Corruption handling

| Symptom | Action |
|---------|--------|
| `database disk image is malformed` | Stop app → restore latest backup ZIP → restart |
| FK violations at startup | Run integrity scan (`db:data-integrity-scan`); repair data or restore backup |
| Blank modules / IPC errors | Check `e2e/artifacts/preload-error.log` (dev); reinstall build |
| Schema drift warning | Regenerate bootstrap from current `schema.prisma`; ship patch release |

---

## Rollback expectations

| Change type | Rollback |
|-------------|----------|
| App version downgrade | Restore **matching-era** DB backup; mixed schema/app versions are unsupported |
| Failed migration | Restore pre-migration `.sqlite` copy; forward-fix migration in next release |
| Settings-only | Restore `app_setting` rows from backup or re-enter in UI |

**There is no automatic down-migration** in the field. Operators should always backup before upgrades.

---

## Roadmap: migration squash

1. Freeze schema at release tag.
2. Generate `bootstrap-schema.sql` as canonical DDL.
3. Replace `prisma/migrations` with one `0_baseline` migration equivalent to bootstrap.
4. Document `legacy_migrations` folder for archaeology only.
5. CI gate: `verify:desktop` (migrate status + bootstrap drift + E2E restart).

---

## Verification commands

```bash
npm run verify:bootstrap-schema
npm run verify:desktop          # full pipeline including E2E
npx prisma migrate status       # against target DATABASE_URL
```

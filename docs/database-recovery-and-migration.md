# Database recovery and migration strategy

SAMY SOFT ships as a **local-first Electron ERP** using **SQLite** and **Prisma**. Factory installs typically get schema from **runtime bootstrap** (`bootstrap-schema.sql`); developers and upgrade runbooks may use **`prisma migrate deploy`** or **`db push`** on isolated databases.

See also: **Database Lifecycle** in `README.md` (operator summary).

---

## Database Lifecycle (canonical)

### When is `samy-soft.sqlite` created?

The file appears on **first Prisma write**, not at repository clone:

1. Electron calls `configureDatabaseUrl()` → creates parent directory (`electron/database.ts`).
2. `getPrisma().$connect()` then `ensureDatabaseSchemaReady()` (`electron/services/database-schema-service.ts`).
3. SQLite creates the file when bootstrap DDL or migrations run.

Until then, `npx prisma migrate status` with default `.env` may report **P1003** (database file does not exist) — expected on a fresh clone before first app launch or CLI init.

### First launch bootstrap flow (packaged or `npm run dev`)

```
app.whenReady
  → configureDatabaseUrl()
  → registerIpcHandlers()
  → Prisma $connect
  → ensureDatabaseSchemaReady()
       ├─ AppSetting exists → OK (existing DB)
       ├─ other tables but no AppSetting → ERROR (restore backup)
       └─ empty DB → apply prisma/bootstrap-schema.sql + record _prisma_migrations "bootstrap-schema"
  → runStartupDiagnostics()
  → createMainWindow
```

Admin user: **setup UI** if `User` count is 0 (`bootstrap-service.ts`), not automatic seed in production.

### `bootstrap-schema.sql` role

| Concern | Detail |
|---------|--------|
| **Generation** | `npm run db:bootstrap-schema` → `scripts/generate-bootstrap-schema.ts` |
| **Drift gate** | `npm run verify:bootstrap-schema` → `scripts/bootstrap-schema-drift.ts` (Prisma `migrate diff` vs file on disk) |
| **Runtime** | Read once per empty DB; `readFileSync` in `applyBootstrapSchema` (not a hot path) |
| **Packaging** | `electron-builder` copies `prisma/bootstrap-schema.sql` into app resources |

### Bootstrap vs `prisma migrate deploy`

| Path | When to use |
|------|-------------|
| **Runtime bootstrap** | End-user first launch; empty SQLite; no manual CLI |
| **`migrate deploy`** | Dev machine setup, upgrade testing, `npm run verify:migrate-deploy` |
| **`db push`** | Schema iteration, E2E DB (`.data/e2e/samye2e.sqlite`), `verify:desktop` fresh-db check |

Both paths must converge on the same logical schema; CI enforces bootstrap parity via `verify:bootstrap-schema` and a clean `db push` via `scripts/verify-fresh-db-push.ts` inside `verify:desktop`.

### Database file locations

| Context | Path |
|---------|------|
| Dev unpackaged (`production` channel) | `<repo>/.data/samy-soft.sqlite` |
| Dev `beta` / `dev` channel | `.data/beta/samy-soft-beta.sqlite`, `.data/dev/samy-soft-dev.sqlite` |
| Packaged app | `app.getPath("userData")[/channel]/samy-soft.sqlite` |
| Prisma CLI (`.env`) | `file:../.data/samy-soft.sqlite` (relative to `prisma/`) |
| E2E | `.data/e2e/samye2e.sqlite` (`SAMY_E2E=1` + `SAMY_E2E_DATABASE_PATH`) |
| `verify:desktop` parity check | `.data/ci-db-push-check/fresh.sqlite` (temporary) |

---

## Fresh install process

1. Install the desktop build (NSIS/portable).
2. On first launch, the main process:
   - Resolves the database file under user data (or `SAMY_E2E_DATABASE_PATH` in tests).
   - Creates the SQLite file if missing; applies `bootstrap-schema.sql` only when no application tables exist (see lifecycle above).
   - Presents `/setup` when no admin user exists (seed is optional and mainly for dev/E2E).
3. Complete the onboarding wizard (`onboarding.wizard_done`).
4. Verify health: **Paramètres → Santé système** or IPC `system:startup-diagnostics`.

**Developer / CI fresh DB:**

```bash
npm run e2e:ensure-db    # push + seed + fixtures (isolated .data/e2e/)
npm run verify:bootstrap-schema
npm run verify:desktop   # full gate including E2E
```

**Optional dev DB without launching Electron:**

```bash
npx prisma migrate deploy
npx prisma db seed
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

- `prisma/migrations/` contains the historical chain (`init` → phase migrations) — **dev/CI only**; not copied into the Windows installer.
- Packaged runtime ships **`resources/prisma/bootstrap-schema.sql`** (`electron-builder` `extraResources`), kept in sync via:

```bash
npm run db:bootstrap-schema
npm run verify:bootstrap-schema
```

### Packaged app migration strategy

| Artifact | Shipped in installer? | Runtime role |
|----------|----------------------|--------------|
| `prisma/bootstrap-schema.sql` | **Yes** (`extraResources`) | Empty DB → `ensureDatabaseSchemaReady()` |
| `prisma/migrations/` | **No** | `migrate deploy` on dev machines / upgrade runbooks only |
| Prisma CLI | **No** | Build & CI scripts only |

**Health / startup diagnostics (packaged):** verify bootstrap SQL **presence** under `process.resourcesPath`; skip folder-level `prisma/migrations` parity (no false pending migrations). Content drift is enforced at **build time** via `verify:bootstrap-schema`.

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

# Release channels

SAMY SOFT supports isolated runtime profiles via `SAMY_RELEASE_CHANNEL`.

Database creation timing and bootstrap vs migrations: **README.md** § Database Lifecycle.

## Channels

| Channel | `SAMY_RELEASE_CHANNEL` | SQLite path (dev unpackaged) |
|---------|------------------------|------------------------------|
| Production | `production` (default) | `.data/samy-soft.sqlite` |
| Internal beta | `beta` | `.data/beta/samy-soft-beta.sqlite` |
| Developer | `dev` | `.data/dev/samy-soft-dev.sqlite` |

Packaged builds use `userData/[channel]/` when not production.

## Usage

```powershell
# Dev channel — separate DB from production sample data
$env:SAMY_RELEASE_CHANNEL = "dev"
npm run dev

# Feature flag example
$env:SAMY_FEATURE_EXPERIMENTAL_REPORTS = "1"
```

## CI / E2E

E2E continues to use `SAMY_E2E_DATABASE_PATH` (`.data/e2e/samye2e.sqlite`) which takes precedence over channel paths.

## Future

- NSIS installer channel selector (beta vs production)
- Auto-update feed per channel
- Stricter migration gate on `production` channel only

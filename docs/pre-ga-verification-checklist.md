# Pre-GA verification checklist

Complete before declaring **general availability**. Each item should be evidenced (CI run URL, signed test log, or operator sign-off).

## Automated gates

- [ ] `npm run verify:desktop` green on **3+ consecutive** CI runs on `windows-latest`
- [ ] `npm run e2e:stability` (≥5 runs) with **100% pass rate** documented in `docs/e2e-stability-metrics.md`
- [ ] `npm run verify:schema-checksum` and `npm run verify:bootstrap-schema` green
- [ ] `npm run verify:migrate-deploy` green on clean SQLite (developer/CI script)

## Persistence & data

- [ ] `e2e/restart-persistence.spec.ts` passes repeatedly (fixture counts, supplier cardinality)
- [ ] Cold machine install: NSIS installer → first launch → wizard → module smoke
- [ ] Offline behavior: disconnect network, confirm core IPC and SQLite operations
- [ ] Corrupted DB recovery: restore from ZIP backup after intentional corruption test
- [ ] Backup/restore round-trip via **Paramètres → Sauvegardes**
- [ ] Installer upgrade path: N-1 build → N build over existing user data

## Operational readiness

- [ ] Rotating logs under `%APPDATA%/…/logs/` (`samy-soft-main.log`, `samy-soft-events.jsonl`)
- [ ] **Diagnostics & santé système** page shows migration/integrity status
- [ ] `system:diagnostics-export` produces support bundle
- [ ] Startup diagnostics log migration pending + bootstrap drift warnings

## Release readiness estimate (target)

| Stage | Target |
|-------|--------|
| Internal beta | ~90% |
| Internal production | ~85% |
| Factory pilot | ~78% |
| General availability | **not until checklist complete** |

# SAMY SOFT — Next Engineering Phase (Hardening Only)

Roadmap for **stability, maintainability, production readiness, offline reliability, ERP scalability, factory UX, and secure local DB architecture** — **no new product features**.

Phases are ordered by risk reduction. Each phase has exit criteria verifiable by existing scripts (`verify:desktop`, E2E, lint).

---

## Phase 1 — Stability & release confidence (2–3 weeks)

**Goal:** Zero-regression deploy path; every developer/CI run matches production DB behavior.

| Workstream | Actions | Exit criteria |
|------------|---------|---------------|
| Script parity | Add `typecheck` → `lint`; document in README | `npm run typecheck` passes in CI |
| DB ops clarity | Single “First run” doc: bootstrap vs `migrate deploy` vs seed | New clone: documented steps produce working app |
| Automated gate | Require `verify:desktop` before `dist:win` / release tag | CI/local checklist enforced |
| E2E stability | Schedule `e2e:stability` on release branches | Flake rate tracked < agreed threshold |
| Packaged smoke | One manual/scripted launch of built `dist` + Electron without Vite | Window + login + one IPC call |

**Stability focus:** Main-process DB failure already blocks startup — keep; add telemetry export on startup diagnostics warnings.

**Offline reliability:** Confirm all critical paths use local SQLite only (no network fetch in auth/inventory/sales) — audit `fetch(` in `src/` periodically.

---

## Phase 2 — Maintainability & dead-code retirement (3–4 weeks)

**Goal:** Codebase surface matches runtime behavior; schema models justified.

| Workstream | Actions |
|------------|---------|
| Orphan services | Resolve `barcode-print`, `industrial-expansion`, `concurrency` (implement thin IPC or remove + migration) |
| UI dead code | Remove `ModulePlaceholder` or route it |
| IPC DTO tests | Cover inventory/sales/production DTO serializers |
| Coverage gates | Raise thresholds on `serialize-for-ipc`, payroll, sales calculators (already partially tested) |
| Doc consolidation | One architecture source of truth linked from README |

**ERP scalability (code structure):** Keep domain handlers split (`*-handlers.ts` + `*-service.ts`); avoid monolithic handler file growth — extract shared validation to `shared/schemas`.

---

## Phase 3 — Production readiness (4–6 weeks)

**Goal:** Installable Windows build with predictable upgrades and recovery.

| Workstream | Actions |
|------------|---------|
| Installer CI | Run `dist:win` on release runner; `qa:certs-installer` |
| Upgrade path | `verify:migrate-deploy` + `db:backup-before-migrate` in upgrade runbook |
| Versioning | Align `package.json` version with migration notes (`docs/release-versioning.md`) |
| Crash reporting | Extend `logger-service` + optional user-export diagnostic bundle (existing IPC) |
| Performance baseline | `qa:perf-sample` on reference hardware (factory PC spec) |

**Production readiness exit:** Signed installer smoke; upgrade from N-1 with data preserved (E2E `restart-persistence` pattern extended).

---

## Phase 4 — Secure local database architecture (parallel track, 4–8 weeks)

**Goal:** Defensible single-user local ERP data model; prepared for future LAN without opening renderer.

| Workstream | Actions |
|------------|---------|
| Encryption at rest | Evaluate SQLCipher or OS-level volume encryption for `samy-soft.sqlite` |
| Backup integrity | Already has verify/export — add scheduled restore drill in QA |
| Session hardening | Review electron-store path permissions; optional OS user binding |
| IPC audit | Periodic diff: `IPC_CHANNELS` vs registered handlers (automated test exists pattern in `assertIpcChannelRegistry`) |
| E2E guard | `app.isPackaged` check before relaxing sandbox |
| Raw SQL review | Minimize `$queryRawUnsafe`; parameterize where dynamic |

**Future multi-user (docs/future-multiuser-architecture.md):** Do not expose Prisma to renderer; keep version/lock tables or remove until LAN phase approved.

---

## Phase 5 — Offline reliability & factory workflow UX (6–10 weeks)

**Goal:** Shop-floor resilience under stress (slow disk, long shifts, repeated modals).

| Workstream | Actions |
|------------|---------|
| IPC timeouts | `useAsyncLoad` already has timeout/retry — standardize across pages |
| Idle/session | `SessionIdleGate` — validate lock on shared factory account |
| Large lists | Virtualization in `DataTable` / HR attendance — extend to movements/invoices if row counts grow |
| Error UX | User-visible handling for renderer `unhandledrejection` + IPC failures (toast policy) |
| Keyboard | `GlobalShortcuts` + modal escape — E2E modal suite as regression gate |
| Stock conflicts | When concurrency service removed or implemented, document invoice/production locking behavior |

**Factory usability:** High-contrast theme, large touch targets (existing design system) — usability testing on production floor, not code-heavy.

---

## Phase 6 — ERP scalability (structural, 8+ weeks)

**Goal:** Multi-year data growth without UI/main-process degradation.

| Workstream | Actions |
|------------|---------|
| SQLite maintenance | Scheduled `VACUUM`/integrity via existing `db-maintenance` IPC |
| Index review | Prisma schema indexes on `ActivityLog`, `StockMovement`, `Invoice` filters |
| Pagination | Enforce server-side limits on all list IPC handlers |
| Reporting | Stream large exports (Excel/PDF builders) — avoid loading full tables in memory |
| Archival | Policy for old activity logs / closed payroll cycles |
| Channel DB paths | `release-channel.js` multi-db — document backup per channel |

---

## Cross-cutting priorities (mapped)

| Priority | Phases |
|----------|--------|
| Stability | 1, 3 |
| Maintainability | 2, 6 |
| Production readiness | 3 |
| Offline reliability | 1, 5 |
| ERP scalability | 2, 6 |
| Factory workflow usability | 5 |
| Secure local DB | 4 |

---

## Metrics to track (no new features)

| Metric | Tool |
|--------|------|
| Build + lint green | `npm run build`, `npm run lint` |
| Unit + coverage | `test:unit:coverage` |
| E2E pass rate | `e2e`, `e2e:stability` |
| Bootstrap drift | `verify:bootstrap-schema` |
| Schema checksum | `verify:schema-checksum` |
| Migration deploy | `verify:migrate-deploy` |
| Installer artifacts | `qa:certs-installer` |

---

## Explicitly out of scope (product features)

- Cloud sync, multi-site replication
- New ERP modules (POS hardware, MES integration) unless orphan code is **activated**, not expanded
- UI redesign beyond accessibility/performance fixes

---

## Phase 1 immediate checklist (copy-paste)

- [ ] `npm run verify:desktop` on clean clone
- [ ] Document first-run DB path in README
- [ ] Add `typecheck` npm alias
- [ ] Product decision on orphan services (barcode / forecast / concurrency)
- [ ] Packaged app smoke (no Vite URL)

---

*Aligned with LOCAL_AUDIT_REPORT.md — 2026-05-19.*

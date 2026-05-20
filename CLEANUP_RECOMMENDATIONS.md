# SAMY SOFT — Cleanup Recommendations

Prioritized engineering cleanup (no new features). Effort: **S** (<2h), **M** (2–8h), **L** (>8h). Risk: **Low / Med / High**.

---

## P0 — High value, low risk

| # | Item | Effort | Risk | Rationale |
|---|------|--------|------|-----------|
| 1 | Add `"typecheck": "npm run lint"` script alias | S | Low | Removes operator confusion (`typecheck` was requested but missing) |
| 2 | Delete or wire `src/pages/ModulePlaceholder.tsx` | S | Low | Dead file; documented in prior cleanup report |
| 3 | Update README “first init” to mention bootstrap-on-first-launch vs `migrate deploy` | S | Low | `prisma migrate status` fails without DB file; reduces support noise |

---

## P1 — Dead code removal (maintainability)

| # | Item | Effort | Risk | Action |
|---|------|--------|------|--------|
| 4 | Remove or integrate `electron/services/barcode-print-service.ts` | M | Med | Zero imports; schema has `BarcodeMapping` — either expose IPC + UI hook or delete service + trim schema in dedicated migration |
| 5 | Remove or integrate `electron/services/industrial-expansion-service.ts` | M | Med | Zero imports; models `PurchaseForecastSnapshot`, `IndustrialAnalyticsSnapshot` unused at runtime |
| 6 | Remove or integrate `electron/services/concurrency-service.ts` | M | Med | Documented “future”; `OperationalLock` / `OperationalVersion` tables unused — decide: implement locks or drop tables + service |
| 7 | Prune `docs/project-architecture.md` references to removed services | S | Low | Keep docs truthful after (4–6) |

**What NOT to change yet:** Do not drop Prisma models until product confirms POS/forecast/concurrency roadmap abandoned (schema migration + data loss review required).

---

## P2 — Test & coverage hygiene

| # | Item | Effort | Risk | Rationale |
|---|------|--------|------|-----------|
| 8 | Add unit tests for `electron/ipc/dto/inventory-dto.ts` | M | Low | Coverage report: ~33% lines — IPC shape bugs are high impact |
| 9 | Add smoke test importing orphan services (fail CI if re-introduced without use) | S | Low | Optional: `assertNoOrphanServices` script in `verify:desktop` |
| 10 | Run `npm run e2e:stability` periodically on release candidates | S | Low | Already scripted; not run in this audit |

---

## P3 — Security & runtime hardening (cleanup, not features)

| # | Item | Effort | Risk | Rationale |
|---|------|--------|------|-----------|
| 11 | Guard E2E relax mode: assert `!app.isPackaged` when disabling sandbox | S | Med | Prevents accidental packaged weak mode |
| 12 | Renderer: toast or boundary on `unhandledrejection` (keep `preventDefault` optional) | M | Low | Today only `console.error` in `main.tsx` |
| 13 | Remove E2E artifact writes from `main.ts` in non-E2E builds | S | Low | `fs.writeFileSync` to `e2e/artifacts` on every window create |

---

## P4 — Dependency & tooling

| # | Item | Effort | Risk | Rationale |
|---|------|--------|------|-----------|
| 14 | Plan Prisma 7 `prisma.config.ts` migration | M | Med | Deprecation warnings on every Prisma invoke |
| 15 | Audit `recharts` bundle weight (416 kB chunk) | M | Low | Code-split already per route; consider lighter charts on dashboard-only pages |
| 16 | Confirm `happy-dom` stays dev-only | S | Low | Already devDependency — OK |

**Unused npm packages:** None confidently flagged; all declared production deps have import sites.

---

## P5 — Repository hygiene

| # | Item | Effort | Risk | Rationale |
|---|------|--------|------|-----------|
| 17 | `.gitignore` / clean script for `.data/ci-db-push-check/`, playwright reports | S | Low | Artifacts from `verify:desktop` |
| 18 | Consolidate overlapping audit docs (`docs/full-application-audit.md` vs this report) | M | Low | Point docs to `LOCAL_AUDIT_REPORT.md` datestamp |
| 19 | Archive stale `e2e/artifacts/main-boot.txt` from old E2E runs | S | Low | Misleading timestamps |

---

## Duplicate services

**Finding:** No duplicate class definitions (e.g. two `inventory-service.ts`). Overlap is **conceptual**:

- `bootstrap-service.ts` vs `database-schema-service.ts` — distinct phases (admin user vs DDL)
- `inventory-service.ts` vs `inventory-costing.ts` — intentional split (used)
- `qa-metrics-service.ts` vs `deployment-cert-service.ts` — complementary

**No merge recommended** without design review.

---

## What NOT to change yet

1. **ERP feature surfaces** — inventory/sales/production/HR/reporting flows (E2E green).
2. **Bootstrap vs migrate dual path** — works in production E2E; changing strategy is a Phase 2 architecture task, not a quick cleanup.
3. **IPC channel inventory** — large but consistent; renaming channels breaks clients.
4. **electron-builder / NSIS config** — not validated in this audit.
5. **Auth/session model** — electron-store session is appropriate for single-user local.
6. **HashRouter** — required for Electron `file://`; do not switch to BrowserRouter without test plan.

---

## Suggested cleanup sequence

```
Week 1:  (1)(2)(3)(11)(13)     — scripts, docs, guards, small deletes
Week 2:  (4)(5)(6) + schema decision — dead services (product sign-off)
Week 3:  (8)(14)               — tests + Prisma 7 prep
```

---

*Generated from local stability audit 2026-05-19.*

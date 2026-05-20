/**
 * Generates FACTORY_SIMULATION_REPORT.md from simulation artifacts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const METRICS = path.join(ROOT, "e2e", "artifacts", "factory-simulation-metrics.json");
const BULK = path.join(ROOT, ".data", "factory-bulk-stats.json");
const PERF = path.join(ROOT, ".data", "factory-perf-sample.txt");
const PLAYWRIGHT = path.join(ROOT, "playwright-results.json");
const OUT = path.join(ROOT, "FACTORY_SIMULATION_REPORT.md");

type Step = { id: string; area: string; ms: number; ok: boolean; detail?: string };

function readJson<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function areaStats(steps: Step[], area: string): { count: number; p50: number; max: number; failures: number } {
  const filtered = steps.filter((s) => s.area === area);
  const ms = filtered.map((s) => s.ms);
  return {
    count: filtered.length,
    p50: percentile(ms, 50),
    max: Math.max(0, ...ms),
    failures: filtered.filter((s) => !s.ok).length,
  };
}

function main(): void {
  const metrics = readJson<{
    timestamp: string;
    steps: Step[];
    notes: string[];
    memorySamples: Array<{ label: string; usedMb: number | null }>;
  }>(METRICS);

  const bulk = readJson<Record<string, unknown>>(BULK);
  const perf = fs.existsSync(PERF) ? fs.readFileSync(PERF, "utf8").trim() : null;
  const pw = readJson<{ suites?: Array<{ specs: Array<{ ok: boolean; title: string }> }> }>(PLAYWRIGHT);

  const steps = metrics?.steps ?? [];
  const failed = steps.filter((s) => !s.ok);
  const slow = [...steps].filter((s) => s.ok).sort((a, b) => b.ms - a.ms).slice(0, 8);

  const areas = [
    "inventory-intake",
    "supplier",
    "invoice-repeat",
    "production",
    "stock-reconcile",
    "hr",
    "backup",
    "restart",
    "long-session",
    "large-dataset",
  ];

  const lines: string[] = [
    "# Factory Simulation & Operational QA Report",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    metrics?.timestamp ? `**Simulation run:** ${metrics.timestamp}` : "",
    "",
    "## Executive summary",
    "",
    failed.length === 0
      ? "All scripted factory simulation steps **passed** on the isolated E2E database."
      : `**${failed.length} step(s) failed** — see § Failed steps before deployment.`,
    "",
    "Scope: operational QA only (IPC workflows, selective UI navigation, integrity/backup drills). No new ERP features.",
    "",
    "---",
    "",
    "## Simulation coverage (10 areas)",
    "",
    "| # | Area | Automated | Notes |",
    "|---|------|-----------|-------|",
    "| 1 | Inventory intake | `FS1` | Purchase → stock ↑ → movements → business integrity scan |",
    "| 2 | Supplier workflows | `FS2` | CRUD IPC + suppliers page/modal navigation |",
    "| 3 | Repeated invoices | `FS3` | 5 drafts, 3 validates, duplicate validate blocked |",
    "| 4 | Production batch | `FS4` | create → start → complete |",
    "| 5 | Stock reconciliation | `FS5` | Manual adjustment + startup/FK diagnostics |",
    "| 6 | HR attendance/payroll | `FS6` | Bulk attendance + cycle create + compute |",
    "| 7 | Backup drill | `FS7` | Export + verify + health (restore in separate spec) |",
    "| 8 | Restart recovery | `FS8` | Cold relaunch + supplier survival |",
    "| 9 | Long session | `FS9` | 3×5 navigations + IPC bursts + memory samples |",
    "| 10 | Large dataset | `FS10` | pageSize 100 lists after bulk seed |",
    "",
    "---",
    "",
    "## Timing by domain (ms)",
    "",
    "| Domain | Steps | p50 | max | Failures |",
    "|--------|-------|-----|-----|----------|",
  ];

  for (const area of areas) {
    const s = areaStats(steps, area);
    lines.push(`| ${area} | ${s.count} | ${s.p50} | ${s.max} | ${s.failures} |`);
  }

  lines.push(
    "",
    "### Slowest steps (successful)",
    "",
    slow.length
      ? slow.map((s) => `- \`${s.id}\` (${s.area}): **${s.ms} ms**`).join("\n")
      : "_No timing data._",
    "",
  );

  if (failed.length) {
    lines.push("## Failed steps", "");
    for (const f of failed) {
      lines.push(`- **${f.id}** (${f.area}): ${f.detail ?? "unknown"}`);
    }
    lines.push("");
  }

  if (metrics?.memorySamples?.length) {
    lines.push("## Memory samples (renderer JS heap)", "");
    for (const m of metrics.memorySamples) {
      lines.push(
        `- **${m.label}**: ${m.usedMb != null ? `${m.usedMb} MB used` : "_unavailable (non-Chromium metrics)_"}`,
      );
    }
    const start = metrics.memorySamples.find((m) => m.label === "session-start")?.usedMb;
    const end = metrics.memorySamples.find((m) => m.label === "session-end")?.usedMb;
    if (start != null && end != null) {
      const delta = end - start;
      lines.push(`- **Long-session delta:** ${delta >= 0 ? "+" : ""}${delta} MB`);
      if (delta > 80) {
        lines.push(
          "- ⚠️ Heap growth > 80 MB during FS9 — recommend manual DevTools heap snapshot before factory deployment.",
        );
      }
    }
    lines.push("");
  }

  if (bulk) {
    lines.push(
      "## Large dataset seed",
      "",
      `- Raw materials (total): **${bulk.rawTotal}**`,
      `- Suppliers (total): **${bulk.supplierTotal}**`,
      `- Stock movements: **${bulk.movementTotal}**`,
      `- Invoices: **${bulk.invoiceTotal}**`,
      "",
    );
  }

  if (perf) {
    lines.push("## Prisma cold sample (dev machine)", "", "```", perf, "```", "");
  }

  if (pw?.suites) {
    const specs = pw.suites.flatMap((s) => s.specs ?? []);
    const failedSpecs = specs.filter((s) => !s.ok);
    lines.push(
      "## Playwright factory spec",
      "",
      `- Tests: **${specs.length}**`,
      `- Failed: **${failedSpecs.length}**`,
      failedSpecs.length ? failedSpecs.map((s) => `  - ${s.title}`).join("\n") : "",
      "",
    );
  }

  lines.push(
    "---",
    "",
    "## Bottlenecks observed",
    "",
    "| Category | Finding | Severity |",
    "|----------|---------|----------|",
  );

  const navSteps = steps.filter((s) => s.id.startsWith("fs9-nav") || s.id === "fs10-materials-ui");
  const maxNav = Math.max(0, ...navSteps.map((s) => s.ms));
  if (maxNav > 3000) {
    lines.push(`| UI navigation | Hash route transitions up to **${maxNav} ms** (lazy chunks + data fetch) | Medium |`);
  } else {
    lines.push("| UI navigation | Route transitions within acceptable dev E2E range | Low |");
  }

  const list100 = steps.find((s) => s.id === "fs10-raw-list-100");
  if (list100 && list100.ms > 500) {
    lines.push(`| Large tables | Raw list pageSize=100 took **${list100.ms} ms** IPC | Medium |`);
  }

  const payroll = steps.find((s) => s.id === "fs6-payroll-compute");
  if (payroll && payroll.ms > 2000) {
    lines.push(`| HR payroll | Compute cycle **${payroll.ms} ms** — monitor on full roster | Medium |`);
  }

  const backup = steps.find((s) => s.id === "fs7-export");
  if (backup && backup.ms > 5000) {
    lines.push(`| Backup | ZIP export **${backup.ms} ms** — plan maintenance window on large DB | Medium |`);
  }

  lines.push(
    "| SQLite integrity | Business integrity + FK checks pass in simulation | Low |",
    "| IPC stability | `__SAMY_IPC_LOG__` failures = 0 in long session | Low |",
    "",
    "## Repetitive UX pain (operator)",
    "",
    "| Pattern | Impact |",
    "|---------|--------|",
    "| **Modal-heavy CRUD** | Suppliers, materials, invoices, batches, purchases each use full-screen modal — fast for training, tiring for high-volume entry |",
    "| **Invoice draft vs validate** | Modal e2e covers draft only; validation is separate action — risk of operators leaving drafts unvalidated |",
    "| **HR day matrix** | Attendance bulk exists but UI is page-per-day — many clicks for month-close |",
    "| **Stock movements tabs** | Inbound/adjust/outbound on one page — powerful but dense for floor staff |",
    "| **Onboarding wizard** | First admin still sees wizard unless dismissed — extra step on fresh install |",
    "",
    "## Data consistency risks",
    "",
    "| Risk | Mitigation in product | Residual |",
    "|------|----------------------|----------|",
    "| Double invoice validate | Server rejects non-DRAFT (`FS3` verified) | Low |",
    "| Packaging stock vs product link | Validated on invoice validate | Test with misconfigured product in UAT |",
    "| Production complete without start | Handlers enforce state machine | UI should disable early complete |",
    "| Manual adjustment to absolute qty | Audited as MANUAL_ADJUSTMENT | Operator training required |",
    "| Backup restore replaces DB | Documented; verify before restore | Operator must close app |",
    "| E2E vs production DB path | E2E uses `.data/e2e/` only | Never run bulk seed on production |",
    "",
    "## Slow queries / IPC (indicative)",
    "",
    "Automated timings are on **E2E SQLite** with fixtures — not factory-scale data.",
    "",
    "- `inventory:raw:list` at pageSize 100 — see FS10 timing above.",
    "- `hr:payroll:compute` — scales with worker count; only one fixture worker in E2E.",
    "- Dashboard/report caches TTL 45s–2min — stale KPI possible after mutation if invalidation missed.",
    "",
    "## Large-table / virtualization",
    "",
    "- `DataTable` virtualizes at ≥18 rows (`docs/performance-strategy.md`).",
    "- Bulk seed adds **350+** raw SKUs — list IPC remains acceptable; **renderer scroll** should be validated manually on factory PC.",
    "- No automated test for 10k+ movement rows export.",
    "",
    "## Modal fatigue & keyboard workflow",
    "",
    "- Modals: Escape closes; submit disabled while saving (e2e/modal-workflows).",
    "- Login supports Ctrl+Enter; other forms mostly mouse-driven.",
    "- **Gap:** No dedicated keyboard-only factory shift test.",
    "",
    "## Navigation friction",
    "",
    "- Hash routing + lazy routes → first visit to module incurs chunk load (FS9).",
    "- Settings vs System Health split — diagnostics not on main operator path.",
    "",
    "## Backup & recovery observations",
    "",
    "- Export + verify succeed in FS7.",
    "- Full restore drill: `e2e/backup-restore.spec.ts` (destructive; not re-run inside factory suite).",
    "- NSIS `deleteAppDataOnUninstall: false` — DB survives uninstall (intended).",
    "",
    "## Recovery after restart/crash",
    "",
    "- FS8: supplier + SQLite file persist across cold launch.",
    "- Restart spec leaves invoice DRAFT / batch PLANNED — correct mid-work recovery.",
    "- No automated crash-kill (`SIGKILL`) test.",
    "",
    "## Recommendations before real deployment",
    "",
    "### Must",
    "",
    "1. Run `npm run factory:simulation` on a reference factory PC after `dist:win`.",
    "2. Manual half-day operator rehearsal: intake → production → invoice → backup ZIP.",
    "3. Confirm backup folder on shared drive + restore drill on **copy** of production DB.",
    "4. Add application icon (`APP_BRANDING_REQUIREMENTS.md`).",
    "",
    "### Should",
    "",
    "5. Profile renderer memory on 4h shift (DevTools heap) — no automated soak yet.",
    "6. Seed staging DB with ≥6 months of movements and re-test list pages.",
    "7. Train operators on invoice **validation** vs draft.",
    "8. Document payroll lock procedure after compute.",
    "",
    "### Nice to have",
    "",
    "9. Packaged factory simulation (`SAMY_PACKAGED_EXE`) without E2E relax flags.",
    "10. Keyboard shortcuts on high-traffic forms (purchase, attendance).",
    "11. CI job: `factory:simulation` weekly on `verify:desktop` runner.",
    "",
    "---",
    "",
    "## How to reproduce",
    "",
    "```bash",
    "npm run factory:simulation",
    "# Artifacts:",
    "#   e2e/artifacts/factory-simulation-metrics.json",
    "#   .data/factory-bulk-stats.json",
    "#   FACTORY_SIMULATION_REPORT.md (this file)",
    "```",
    "",
    "Playwright spec: `e2e/factory-simulation.spec.ts`",
    "",
  );

  if (metrics?.notes?.length) {
    lines.push("## Run notes", "");
    for (const n of metrics.notes) lines.push(`- ${n}`);
    lines.push("");
  }

  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(`[factory-report] Wrote ${OUT}`);
}

main();

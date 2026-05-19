/**
 * Repeated E2E runs to surface flaky tests and timing variance.
 * Usage: npm run e2e:stability [-- --runs=5]
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const METRICS_PATH = path.join(ROOT, "docs", "e2e-stability-metrics.md");

type SpecTiming = {
  title: string;
  file: string;
  durationMs: number;
  retries: number;
};

type RunResult = {
  run: number;
  ok: boolean;
  durationMs: number;
  failedSpecs: string[];
  bootArtifactMs?: number;
  bootIso?: string;
  specTimings: SpecTiming[];
  totalRetries: number;
};

type PlaywrightJson = {
  suites?: PlaywrightSuite[];
};

type PlaywrightSuite = {
  title?: string;
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
};

type PlaywrightSpec = {
  title: string;
  ok: boolean;
  file?: string;
  tests?: Array<{
    results?: Array<{ duration?: number; retry?: number; status?: string }>;
  }>;
};

function parseRunsArg(): number {
  const flag = process.argv.find((a) => a.startsWith("--runs="));
  if (flag) {
    const n = Number.parseInt(flag.split("=")[1] ?? "", 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) return n;
  }
  return 5;
}

function readBootTiming(): number | undefined {
  const bootPath = path.join(ROOT, "e2e", "artifacts", "main-boot.txt");
  if (!fs.existsSync(bootPath)) return undefined;
  const stat = fs.statSync(bootPath);
  return stat.mtimeMs;
}

function readBootIso(): string | undefined {
  const bootPath = path.join(ROOT, "e2e", "artifacts", "main-boot.txt");
  if (!fs.existsSync(bootPath)) return undefined;
  const firstLine = fs.readFileSync(bootPath, "utf8").split("\n")[0]?.trim();
  if (!firstLine) return undefined;
  const parsed = Date.parse(firstLine);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function collectSpecTimings(suite: PlaywrightSuite, parentFile = ""): SpecTiming[] {
  const file = suite.file ?? parentFile;
  const out: SpecTiming[] = [];
  for (const spec of suite.specs ?? []) {
    const results = spec.tests?.flatMap((t) => t.results ?? []) ?? [];
    const durationMs = results.reduce((max, r) => Math.max(max, r.duration ?? 0), 0);
    const retries = results.reduce((sum, r) => sum + (r.retry ?? 0), 0);
    out.push({
      title: spec.title,
      file: spec.file ?? file,
      durationMs,
      retries,
    });
  }
  for (const child of suite.suites ?? []) {
    out.push(...collectSpecTimings(child, file));
  }
  return out;
}

function collectFailedSpecs(suite: PlaywrightSuite): string[] {
  const failed: string[] = [];
  for (const spec of suite.specs ?? []) {
    if (!spec.ok) failed.push(spec.title);
  }
  for (const child of suite.suites ?? []) {
    failed.push(...collectFailedSpecs(child));
  }
  return failed;
}

function parsePlaywrightResults(): { failedSpecs: string[]; specTimings: SpecTiming[]; totalRetries: number } {
  const resultsPath = path.join(ROOT, "playwright-results.json");
  if (!fs.existsSync(resultsPath)) {
    return { failedSpecs: [], specTimings: [], totalRetries: 0 };
  }
  try {
    const json = JSON.parse(fs.readFileSync(resultsPath, "utf8")) as PlaywrightJson;
    const specTimings: SpecTiming[] = [];
    const failedSpecs: string[] = [];
    for (const suite of json.suites ?? []) {
      failedSpecs.push(...collectFailedSpecs(suite));
      specTimings.push(...collectSpecTimings(suite));
    }
    const totalRetries = specTimings.reduce((s, t) => s + t.retries, 0);
    return { failedSpecs, specTimings, totalRetries };
  } catch {
    return { failedSpecs: ["(could not parse playwright-results.json)"], specTimings: [], totalRetries: 0 };
  }
}

function timingVarianceMs(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function runPlaywrightOnce(runIndex: number): RunResult {
  const started = Date.now();
  const env = {
    ...process.env,
    SAMY_E2E: "1",
    SAMY_SKIP_DEVTOOLS: "1",
    SAMY_E2E_DATABASE_PATH: ".data/e2e/samye2e.sqlite",
  };

  if (process.platform === "win32") {
    try {
      execSync("taskkill /F /IM electron.exe /T 2>nul", { cwd: ROOT, stdio: "ignore", shell: true });
    } catch {
      /* no orphan processes */
    }
  }

  execSync("npm run e2e:ensure-db", { cwd: ROOT, stdio: "inherit", env, shell: true });
  execSync("npm run build:electron && vite build", { cwd: ROOT, stdio: "inherit", env, shell: true });

  const bootBefore = readBootTiming();
  const proc = spawnSync(
    "npx",
    ["cross-env", "SAMY_E2E=1", "SAMY_SKIP_DEVTOOLS=1", "SAMY_E2E_DATABASE_PATH=.data/e2e/samye2e.sqlite", "playwright", "test"],
    { cwd: ROOT, env, shell: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );

  if (proc.status !== 0) {
    if (proc.stdout) process.stdout.write(proc.stdout);
    if (proc.stderr) process.stderr.write(proc.stderr);
  }

  const durationMs = Date.now() - started;
  const bootAfter = readBootTiming();
  const bootArtifactMs = bootBefore && bootAfter && bootAfter > bootBefore ? bootAfter - bootBefore : undefined;

  let { failedSpecs, specTimings, totalRetries } = parsePlaywrightResults();

  if (proc.status !== 0 && failedSpecs.length === 0) {
    failedSpecs = ["(playwright exited non-zero — see console)"];
  }

  const bootIso = readBootIso();

  console.log(`\n[e2e-stability] Run ${runIndex}: ${proc.status === 0 ? "PASS" : "FAIL"} in ${(durationMs / 1000).toFixed(1)}s\n`);
  return {
    run: runIndex,
    ok: proc.status === 0,
    durationMs,
    failedSpecs,
    bootArtifactMs,
    bootIso,
    specTimings,
    totalRetries,
  };
}

function renderMarkdown(runs: RunResult[], totalRuns: number): string {
  const passed = runs.filter((r) => r.ok).length;
  const avgMs = runs.reduce((s, r) => s + r.durationMs, 0) / runs.length;
  const minMs = Math.min(...runs.map((r) => r.durationMs));
  const maxMs = Math.max(...runs.map((r) => r.durationMs));
  const flaky = runs.filter((r) => !r.ok);
  const failureCounts = new Map<string, number>();
  for (const r of runs) {
    for (const f of r.failedSpecs) {
      failureCounts.set(f, (failureCounts.get(f) ?? 0) + 1);
    }
  }

  const totalRetries = runs.reduce((s, r) => s + r.totalRetries, 0);
  const bootDeltas = runs.map((r) => r.bootArtifactMs).filter((v): v is number => v !== undefined);
  const bootVariance = timingVarianceMs(bootDeltas);
  const runVariance = timingVarianceMs(runs.map((r) => r.durationMs));

  const specMaxDuration = new Map<string, { file: string; maxMs: number }>();
  for (const r of runs) {
    for (const t of r.specTimings) {
      const key = `${t.file} :: ${t.title}`;
      const prev = specMaxDuration.get(key);
      if (!prev || t.durationMs > prev.maxMs) {
        specMaxDuration.set(key, { file: t.file, maxMs: t.durationMs });
      }
    }
  }
  const slowestSpecs = [...specMaxDuration.entries()]
    .sort((a, b) => b[1].maxMs - a[1].maxMs)
    .slice(0, 8);

  const lastRun = runs[runs.length - 1];
  const flakySpecs = [...failureCounts.entries()].filter(([, c]) => c > 0 && c < totalRuns);

  const lines: string[] = [
    "# E2E stability metrics",
    "",
    `> Generated: ${new Date().toISOString()} · Runs: ${totalRuns} · Host: ${process.platform}`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Pass rate | ${passed}/${totalRuns} (${((passed / totalRuns) * 100).toFixed(0)}%) |`,
    `| Average runtime | ${(avgMs / 1000).toFixed(1)}s |`,
    `| Runtime range | ${(minMs / 1000).toFixed(1)}s – ${(maxMs / 1000).toFixed(1)}s |`,
    `| Run duration σ | ${runVariance !== undefined ? `${(runVariance / 1000).toFixed(2)}s` : "n/a"} |`,
    `| Flaky runs (failures) | ${flaky.length} |`,
    `| Playwright retries (all runs) | ${totalRetries} |`,
    `| Boot artifact timing σ | ${bootVariance !== undefined ? `${bootVariance.toFixed(0)}ms` : "n/a"} |`,
    "",
    "## Per-run results",
    "",
    "| Run | Result | Duration (s) | Failed specs |",
    "|-----|--------|--------------|--------------|",
  ];

  for (const r of runs) {
    lines.push(
      `| ${r.run} | ${r.ok ? "PASS" : "**FAIL**"} | ${(r.durationMs / 1000).toFixed(1)} | ${r.failedSpecs.length ? r.failedSpecs.join("; ") : "—"} |`,
    );
  }

  if (failureCounts.size > 0) {
    lines.push("", "## Intermittent failures (by spec)", "", "| Spec | Fail count |", "|------|------------|");
    for (const [spec, count] of [...failureCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${spec} | ${count}/${totalRuns} |`);
    }
  } else {
    lines.push("", "## Flaky tests observed", "", "None in this campaign.", "");
  }

  if (slowestSpecs.length > 0) {
    lines.push("## Slowest specs (max duration across campaign)", "", "| Spec | File | Max (s) |", "|------|------|---------|");
    for (const [key, { file, maxMs }] of slowestSpecs) {
      const title = key.includes(" :: ") ? key.split(" :: ").slice(1).join(" :: ") : key;
      lines.push(`| ${title} | ${path.basename(file)} | ${(maxMs / 1000).toFixed(1)} |`);
    }
    lines.push("");
  }

  if (lastRun?.specTimings.length) {
    const lastTotal = lastRun.specTimings.reduce((s, t) => s + t.durationMs, 0);
    lines.push(
      "## Last-run spec timing (representative)",
      "",
      `Playwright-reported spec time sum: **${(lastTotal / 1000).toFixed(1)}s** (excludes rebuild overhead).`,
      "",
    );
  }

  lines.push(
    "## CI parity (local vs GitHub Actions)",
    "",
    "| Setting | Local stability | CI (`verify-desktop` / nightly) |",
    "|---------|-----------------|----------------------------------|",
    "| Playwright config | `playwright.config.ts` | Same |",
    "| Workers / parallel | `workers: 1`, `fullyParallel: false` | Same |",
    "| Retries | `0` (non-CI and CI) | Same |",
    "| Env | `SAMY_E2E=1`, `SAMY_SKIP_DEVTOOLS=1`, `SAMY_E2E_DATABASE_PATH=.data/e2e/samye2e.sqlite` | Same (+ `CI=true` on Actions) |",
    "| DB seed | `npm run e2e:ensure-db` each run | Same via `verify:desktop` |",
    "| Build | `build:electron` + `vite build` each stability run | `verify:desktop` once per gate |",
    "| OS | win32 (this host) | `windows-latest` |",
    "",
    "## Monitored risk areas",
    "",
    "1. **Electron startup** — preload exposure, renderer boot, `main-boot.txt` artifact, startup diagnostics (E2E relax mode skips migration false-negatives).",
    "2. **SQLite contention** — backup/restore + app restart (`backup-restore.spec.ts`), locked DB / lingering handles.",
    "3. **Async UI** — modals, cache invalidation after mutations, toast timing, IPC round-trips.",
    "4. **Session persistence** — onboarding suppression (`__SAMY_E2E__`), auth restore, route hydration after restart.",
    "5. **Operational vs workflow** — system health checks separated from business workflow specs.",
    "",
    "## Known intermittent risks (watch list)",
    "",
    flakySpecs.length
      ? flakySpecs.map(([spec, count]) => `- **${spec}** — failed ${count}/${totalRuns} runs (investigate before factory pilot).`).join("\n")
      : [
          "- Backup export/restore + restart (historical flake; now 0 failures this campaign).",
          "- Invoice draft → validate → stock → reload persistence.",
          "- Modal timing on inventory/sales forms under Windows load.",
          "- Migration drift warnings in non-E2E runs only (E2E uses relax diagnostics).",
        ].join("\n"),
    "",
    "## Factory pilot gate",
    "",
    `- Target: **5/5** clean minimum, ideally **10/10** — current campaign: **${passed}/${totalRuns}**.`,
    `- Zero silent failures, renderer crashes, non-deterministic modal failures.`,
    "",
    "## Notes",
    "",
    "- Run locally: `npm run e2e:stability` (default 5 consecutive passes).",
    "- Extended: `npm run e2e:stability -- --runs=10`.",
    "- CI gate: `npm run verify:desktop` on `windows-latest` (`.github/workflows/verify-desktop.yml`).",
    "- Nightly flake detection: `.github/workflows/e2e-stability-schedule.yml` (3 runs).",
    "- Investigate failures with `playwright-report/` and `test-results/` artifacts.",
    "",
  );

  return lines.join("\n");
}

const runs = parseRunsArg();
console.log(`[e2e-stability] Starting ${runs} consecutive full E2E runs\n`);

const results: RunResult[] = [];
for (let i = 1; i <= runs; i += 1) {
  results.push(runPlaywrightOnce(i));
}

fs.mkdirSync(path.dirname(METRICS_PATH), { recursive: true });
fs.writeFileSync(METRICS_PATH, renderMarkdown(results, runs), "utf8");
console.log(`[e2e-stability] Metrics written to ${METRICS_PATH}`);

const allPassed = results.every((r) => r.ok);
if (!allPassed) process.exit(1);

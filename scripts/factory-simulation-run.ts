/**
 * Factory Simulation & Operational QA — orchestrator.
 * Usage: npm run factory:simulation
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PERF_OUT = path.join(ROOT, ".data", "factory-perf-sample.txt");

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): number {
  console.log(`\n[factory-sim] > ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return r.status ?? 1;
}

function main(): void {
  fs.mkdirSync(path.join(ROOT, ".data"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "e2e", "artifacts"), { recursive: true });

  let code = run("npm", ["run", "e2e:ensure-db"]);
  if (code !== 0) process.exit(code);

  code = run("npx", [
    "cross-env",
    "DATABASE_URL=file:../.data/e2e/samye2e.sqlite",
    "tsx",
    "scripts/factory-simulation-bulk-seed.ts",
  ]);
  if (code !== 0) process.exit(code);

  const perf = spawnSync("npx", ["tsx", "scripts/performance-sample.ts"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      DATABASE_URL: "file:../.data/e2e/samye2e.sqlite",
    },
  });
  fs.writeFileSync(PERF_OUT, `${perf.stdout ?? ""}${perf.stderr ?? ""}`.trim(), "utf8");

  code = run("npx", ["playwright", "test", "e2e/factory-simulation.spec.ts"]);
  if (code !== 0) {
    console.warn("[factory-sim] Playwright exited non-zero — still generating report.");
  }

  const reportCode = run("npx", ["tsx", "scripts/factory-simulation-report.ts"]);
  process.exit(code !== 0 ? code : reportCode);
}

main();

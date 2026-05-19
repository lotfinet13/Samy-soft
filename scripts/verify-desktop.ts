/**
 * Single-command desktop release confidence gate.
 * Usage: npm run verify:desktop
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type Step = { name: string; cmd: string; env?: NodeJS.ProcessEnv };

const E2E_DB = "file:.data/e2e/samye2e.sqlite";

const steps: Step[] = [
  { name: "Typecheck (lint)", cmd: "npm run lint" },
  { name: "Prisma validate", cmd: "npx prisma validate" },
  {
    name: "Prisma db push (clean SQLite, E2E parity)",
    cmd: "tsx scripts/verify-fresh-db-push.ts",
  },
  { name: "Bootstrap schema drift", cmd: "npm run verify:bootstrap-schema" },
  { name: "Schema checksum manifest", cmd: "npm run verify:schema-checksum" },
  { name: "Unit tests + coverage thresholds", cmd: "npm run test:unit:coverage" },
  { name: "Build renderer + electron", cmd: "npm run build" },
  { name: "E2E database prepare", cmd: "npm run e2e:ensure-db" },
  {
    name: "Playwright full business E2E suite",
    cmd: "npx cross-env SAMY_E2E=1 SAMY_SKIP_DEVTOOLS=1 SAMY_E2E_DATABASE_PATH=.data/e2e/samye2e.sqlite playwright test",
  },
];

function run(step: Step): void {
  console.log(`\n=== ${step.name} ===\n`);
  execSync(step.cmd, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...step.env },
    shell: true,
  });
}

console.log("[verify:desktop] SAMY SOFT release confidence pipeline\n");

for (const step of steps) {
  try {
    run(step);
  } catch (error) {
    console.error(`\n[verify:desktop] FAILED at step: ${step.name}`);
    process.exit(1);
  }
}

console.log("\n[verify:desktop] All steps passed.\n");

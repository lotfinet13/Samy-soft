import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)));

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: path.join(ROOT, "e2e"),
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCi ? 0 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-results.json" }],
  ],
  use: {
    trace: isCi ? "retain-on-failure" : "off",
    screenshot: isCi ? "only-on-failure" : "off",
    video: isCi ? "retain-on-failure" : "off",
  },
  outputDir: "test-results",
});

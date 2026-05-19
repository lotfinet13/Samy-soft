import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electronPath from "electron";
import { _electron as electron } from "@playwright/test";

export const E2E_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const E2E_DB_PATH = path.join(E2E_ROOT, ".data", "e2e", "samye2e.sqlite");

export const E2E_LAUNCH_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  SAMY_E2E: "1",
  SAMY_SKIP_DEVTOOLS: "1",
  SAMY_E2E_DATABASE_PATH: E2E_DB_PATH,
};

export async function launchSamyElectron() {
  fs.mkdirSync(path.join(E2E_ROOT, "e2e", "artifacts"), { recursive: true });
  return electron.launch({
    cwd: E2E_ROOT,
    args: [".", "--samy-e2e"],
    executablePath: electronPath,
    env: { ...process.env, ...E2E_LAUNCH_ENV },
  });
}

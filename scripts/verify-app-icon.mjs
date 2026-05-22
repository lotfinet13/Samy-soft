/**
 * Pre-flight check for Windows packaging icons.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICO = path.join(ROOT, "build", "icon.ico");
const MIN_BYTES = 1024;

function fail(msg) {
  console.error(`[icons:verify] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(ICO)) {
  fail(`Missing ${ICO} — run: npm run icons:generate`);
}

const stat = fs.statSync(ICO);
if (!stat.isFile() || stat.size < MIN_BYTES) {
  fail(`icon.ico too small (${stat.size} bytes) — regenerate with npm run icons:generate`);
}

const logoPng = path.join(ROOT, "build", "samy-soft-logo.png");
const placeholder = path.join(ROOT, "build", ".icon-is-placeholder");
if (fs.existsSync(logoPng)) {
  console.log(`[icons:verify] Branding source: build/samy-soft-logo.png`);
} else if (fs.existsSync(placeholder)) {
  console.warn("[icons:verify] Placeholder icon in use — add build/samy-soft-logo.png for factory branding.");
}

console.log(`[icons:verify] OK — build/icon.ico (${stat.size} bytes)`);

/**
 * Generates build/icon.png (512) and build/icon.ico (16/32/48/256) for electron-builder.
 * Replace build/icon-source.svg and re-run `npm run icons:generate` for factory branding.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "build");
const SOURCE_SVG = path.join(BUILD, "icon-source.svg");
const OUT_PNG = path.join(BUILD, "icon.png");
const OUT_ICO = path.join(BUILD, "icon.ico");
const PLACEHOLDER_MARKER = path.join(BUILD, ".icon-is-placeholder");

const SIZES_ICO = [16, 32, 48, 256];
const SIZE_PNG = 512;

const DEFAULT_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="192" fill="#0F4C81"/>
  <rect x="64" y="64" width="896" height="896" rx="160" fill="#1565A8"/>
  <text x="512" y="580" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="420" font-weight="700" fill="#FFFFFF">S</text>
  <text x="512" y="820" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="88" font-weight="600" fill="#B8D4EC" letter-spacing="8">SAMY</text>
</svg>`;

async function loadSvgBuffer() {
  if (fs.existsSync(SOURCE_SVG)) {
    return fs.readFileSync(SOURCE_SVG);
  }
  fs.mkdirSync(BUILD, { recursive: true });
  if (!fs.existsSync(SOURCE_SVG)) {
    fs.writeFileSync(SOURCE_SVG, DEFAULT_SVG, "utf8");
  }
  return Buffer.from(DEFAULT_SVG, "utf8");
}

async function rasterize(svg, size) {
  return sharp(svg, { density: Math.max(144, Math.round((size / 1024) * 384)) })
    .resize(size, size, { fit: "contain", background: { r: 15, g: 76, b: 129, alpha: 1 } })
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true });
  const svg = await loadSvgBuffer();

  const png512 = await rasterize(svg, SIZE_PNG);
  await fs.promises.writeFile(OUT_PNG, png512);

  const icoBuffers = await Promise.all(SIZES_ICO.map((s) => rasterize(svg, s)));
  const ico = await toIco(icoBuffers);
  await fs.promises.writeFile(OUT_ICO, ico);

  const isCustom = fs.existsSync(SOURCE_SVG) && fs.readFileSync(SOURCE_SVG, "utf8") !== DEFAULT_SVG;
  if (isCustom) {
    await fs.promises.unlink(PLACEHOLDER_MARKER).catch(() => undefined);
  } else {
    await fs.promises.writeFile(
      PLACEHOLDER_MARKER,
      "Generated placeholder icon — replace build/icon-source.svg before factory branding finalization.\n",
      "utf8",
    );
  }

  console.log(`[icons] Wrote ${OUT_PNG} (${SIZE_PNG}px)`);
  console.log(`[icons] Wrote ${OUT_ICO} (${SIZES_ICO.join(", ")}px)`);
  if (!isCustom) {
    console.warn("[icons] Using default SAMY placeholder — customize build/icon-source.svg for production branding.");
  }
}

main().catch((err) => {
  console.error("[icons] generation failed:", err);
  process.exit(1);
});

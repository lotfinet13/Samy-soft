/**
 * Generates build/icon.png (512) and build/icon.ico (16/32/48/256) for electron-builder.
 * Primary source: build/samy-soft-logo.png (factory branding).
 * Fallback: build/icon-source.svg
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "build");
const LOGO_PNG = path.join(BUILD, "samy-soft-logo.png");
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

async function rasterizePng(input, size) {
  return sharp(input)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function rasterizeSvg(svg, size) {
  return sharp(svg, { density: Math.max(144, Math.round((size / 1024) * 384)) })
    .resize(size, size, { fit: "contain", background: { r: 15, g: 76, b: 129, alpha: 1 } })
    .png()
    .toBuffer();
}

async function loadSvgBuffer() {
  if (fs.existsSync(SOURCE_SVG)) {
    return fs.readFileSync(SOURCE_SVG);
  }
  fs.mkdirSync(BUILD, { recursive: true });
  fs.writeFileSync(SOURCE_SVG, DEFAULT_SVG, "utf8");
  return Buffer.from(DEFAULT_SVG, "utf8");
}

async function generateFromLogoPng() {
  const logo = fs.readFileSync(LOGO_PNG);
  const png512 = await rasterizePng(logo, SIZE_PNG);
  await fs.promises.writeFile(OUT_PNG, png512);

  const icoBuffers = await Promise.all(SIZES_ICO.map((s) => rasterizePng(logo, s)));
  const ico = await toIco(icoBuffers);
  await fs.promises.writeFile(OUT_ICO, ico);

  await fs.promises.unlink(PLACEHOLDER_MARKER).catch(() => undefined);
  console.log(`[icons] Source: ${path.basename(LOGO_PNG)}`);
  console.log(`[icons] Wrote ${OUT_PNG} (${SIZE_PNG}px)`);
  console.log(`[icons] Wrote ${OUT_ICO} (${SIZES_ICO.join(", ")}px)`);
}

async function generateFromSvg() {
  const svg = await loadSvgBuffer();
  const png512 = await rasterizeSvg(svg, SIZE_PNG);
  await fs.promises.writeFile(OUT_PNG, png512);

  const icoBuffers = await Promise.all(SIZES_ICO.map((s) => rasterizeSvg(svg, s)));
  const ico = await toIco(icoBuffers);
  await fs.promises.writeFile(OUT_ICO, ico);

  const isCustom = fs.existsSync(SOURCE_SVG) && fs.readFileSync(SOURCE_SVG, "utf8") !== DEFAULT_SVG;
  if (isCustom) {
    await fs.promises.unlink(PLACEHOLDER_MARKER).catch(() => undefined);
  } else {
    await fs.promises.writeFile(
      PLACEHOLDER_MARKER,
      "Generated placeholder icon — add build/samy-soft-logo.png or replace build/icon-source.svg.\n",
      "utf8",
    );
    console.warn("[icons] Using default SAMY placeholder — add build/samy-soft-logo.png for factory branding.");
  }

  console.log(`[icons] Source: ${path.basename(SOURCE_SVG)}`);
  console.log(`[icons] Wrote ${OUT_PNG} (${SIZE_PNG}px)`);
  console.log(`[icons] Wrote ${OUT_ICO} (${SIZES_ICO.join(", ")}px)`);
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true });

  if (fs.existsSync(LOGO_PNG)) {
    await generateFromLogoPng();
    return;
  }

  await generateFromSvg();
}

main().catch((err) => {
  console.error("[icons] generation failed:", err);
  process.exit(1);
});

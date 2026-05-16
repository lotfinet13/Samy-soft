/**
 * Vérifie la présence et la taille plausible des artefacts electron-builder (sortie `release/`).
 * Offline — ne signe pas cryptographiquement l’installateur.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "release");

const MIN_EXE_BYTES = 8 * 1024 * 1024;

function main(): void {
  if (!fs.existsSync(OUT)) {
    console.error(`[cert-installer] dossier release/ introuvable — lancer npm run dist:win avant.`);
    process.exitCode = 2;
    return;
  }
  const entries = fs.readdirSync(OUT);
  const exe = entries.filter((e) => e.toLowerCase().endsWith(".exe"));
  if (exe.length === 0) {
    console.error("[cert-installer] aucun .exe dans release/");
    process.exitCode = 1;
    return;
  }
  let ok = true;
  for (const name of exe) {
    const p = path.join(OUT, name);
    const stat = fs.statSync(p);
    const pass = stat.size >= MIN_EXE_BYTES;
    if (!pass) ok = false;
    console.log(`${pass ? "OK" : "WARN"}  ${name.padEnd(42)} ${Math.round(stat.size / (1024 * 1024))} Mo`);
  }
  if (!ok) {
    console.error("[cert-installer] fichier(s) trop petit(s) — build possiblement incomplet.");
    process.exitCode = 1;
  } else {
    console.log("[cert-installer] contrôle taille minimal passé.");
  }
}

main();

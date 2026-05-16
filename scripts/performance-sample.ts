/**
 * Jalons performance artisanaux hors labo — rapport texte stdout.
 * Ne remplace pas un profiler — donne une base reproductible sur poste développement.
 */
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  console.log("[perf] SAMY SOFT — mesures locales (cold Prisma)");

  const t0 = performance.now();
  const prisma = new PrismaClient();
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  const t1 = performance.now();

  const inv = await prisma.rawMaterial.count();
  const t2 = performance.now();

  await prisma.$disconnect();

  console.log(`[perf] Connexion + SELECT 1 : ${(t1 - t0).toFixed(1)} ms`);
  console.log(`[perf] count RawMaterial (${inv} lignes) : ${(t2 - t1).toFixed(1)} ms`);
  console.log(`[perf] Racine projet : ${ROOT}`);
  console.log("[perf] Voir aussi docs/performance-strategy.md pour gammes attendues.");
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});

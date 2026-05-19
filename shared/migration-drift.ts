/** Pure migration drift helper (no Electron / Prisma imports). */
export function computePendingMigrationNames(expected: string[], appliedFinished: string[]): string[] {
  const applied = new Set(appliedFinished);
  return expected.filter((name) => !applied.has(name));
}

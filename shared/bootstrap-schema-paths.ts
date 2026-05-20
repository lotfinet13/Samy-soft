import path from "node:path";

/** Ordered bootstrap SQL lookup paths (first existing wins). */
export function buildBootstrapSchemaSqlCandidates(input: {
  resourcesPath: string;
  cwd: string;
  /** Typically `…/prisma/bootstrap-schema.sql` next to compiled main (dev tree / ASAR). */
  devTreeBootstrapPath: string;
  isPackaged: boolean;
}): string[] {
  const resources = path.join(input.resourcesPath, "prisma", "bootstrap-schema.sql");
  const cwdBootstrap = path.join(input.cwd, "prisma", "bootstrap-schema.sql");
  if (input.isPackaged) {
    return [resources, cwdBootstrap, input.devTreeBootstrapPath];
  }
  return [cwdBootstrap, resources, input.devTreeBootstrapPath];
}

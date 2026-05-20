import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildBootstrapSchemaSqlCandidates } from "../../shared/bootstrap-schema-paths.ts";

describe("bootstrap-schema-paths", () => {
  it("prefers extraResources path when packaged", () => {
    const candidates = buildBootstrapSchemaSqlCandidates({
      resourcesPath: "C:/app/resources",
      cwd: "C:/cwd",
      devTreeBootstrapPath: "C:/repo/prisma/bootstrap-schema.sql",
      isPackaged: true,
    });
    expect(candidates[0]).toBe(
      path.join("C:/app/resources", "prisma", "bootstrap-schema.sql"),
    );
  });

  it("prefers cwd prisma when unpackaged dev", () => {
    const candidates = buildBootstrapSchemaSqlCandidates({
      resourcesPath: "C:/app/resources",
      cwd: "C:/repo",
      devTreeBootstrapPath: "C:/repo/prisma/bootstrap-schema.sql",
      isPackaged: false,
    });
    expect(candidates[0]).toBe(path.join("C:/repo", "prisma", "bootstrap-schema.sql"));
  });
});

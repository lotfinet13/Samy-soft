import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "../../electron/services/database-schema-service.ts";

describe("splitSqlStatements", () => {
  it("ignores comment lines and splits on semicolons", () => {
    const sql = `
-- header
CREATE TABLE "AppSetting" ("id" TEXT NOT NULL);
CREATE INDEX "AppSetting_key_key" ON "AppSetting"("key");
`;
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("CREATE TABLE");
    expect(parts[1]).toContain("CREATE INDEX");
  });
});

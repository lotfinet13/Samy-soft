import { describe, expect, it } from "vitest";
import { isSqliteLockError } from "../../electron/services/sqlite-connection.js";

describe("isSqliteLockError", () => {
  it("detects database is locked", () => {
    expect(isSqliteLockError(new Error("database is locked"))).toBe(true);
  });

  it("detects SQLITE_BUSY", () => {
    expect(isSqliteLockError(new Error("SQLITE_BUSY: database is locked"))).toBe(true);
  });

  it("detects unable to open", () => {
    expect(isSqliteLockError(new Error("Unable to open the database file"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isSqliteLockError(new Error("constraint failed"))).toBe(false);
  });
});

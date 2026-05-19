import { describe, expect, it } from "vitest";
import { computePendingMigrationNames } from "../../shared/migration-drift.ts";

describe("startup-diagnostics — migration drift", () => {
  it("computePendingMigrationNames lists only unapplied folders", () => {
    const expected = ["20260516000000_init", "20260516121200_phase12", "20260517093000_phase7"];
    const applied = ["20260516000000_init", "bootstrap-schema"];
    expect(computePendingMigrationNames(expected, applied)).toEqual([
      "20260516121200_phase12",
      "20260517093000_phase7",
    ]);
  });

  it("returns empty when all expected migrations are applied", () => {
    const names = ["a", "b"];
    expect(computePendingMigrationNames(names, names)).toEqual([]);
  });
});

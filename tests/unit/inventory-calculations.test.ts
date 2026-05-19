import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";
import {
  assertNonNegativeQtyAfter,
  computeNextWeightedUnitCost,
  decimalToString,
  parseDecimal,
} from "../../electron/services/inventory-costing.ts";

describe("inventory-service — decimal & costing", () => {
  it("decimalToString normalizes Prisma decimals without trailing zeros", () => {
    expect(decimalToString(new Decimal("12.500000"))).toBe("12.5");
    expect(decimalToString(null)).toBe("0");
  });

  it("parseDecimal rejects invalid input", () => {
    expect(parseDecimal("3.25").toFixed(2)).toBe("3.25");
    expect(() => parseDecimal("not-a-number")).toThrow(/invalide/i);
  });

  it("computeNextWeightedUnitCost — weighted average on inbound", () => {
    const next = computeNextWeightedUnitCost({
      stockBeforeInbound: new Decimal(10),
      currentCostUnit: new Decimal(100),
      qtyIn: new Decimal(10),
      unitPrice: new Decimal(200),
    });
    expect(next.toFixed(2)).toBe("150.00");
  });

  it("assertNonNegativeQtyAfter rejects negative stock", () => {
    expect(() => assertNonNegativeQtyAfter(new Decimal(-1))).toThrow(/négatif/i);
  });

  it("computeNextWeightedUnitCost — empty stock adopts inbound price", () => {
    const next = computeNextWeightedUnitCost({
      stockBeforeInbound: new Decimal(0),
      currentCostUnit: new Decimal(0),
      qtyIn: new Decimal(5),
      unitPrice: new Decimal(42),
    });
    expect(next.toFixed(2)).toBe("42.00");
  });
});

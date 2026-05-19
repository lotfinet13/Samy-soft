import { Decimal } from "../prisma-client.js";

export function decimalToString(value: unknown): string {
  try {
    if (value == null || value === "") return "0";
    if (value instanceof Decimal) {
      return value.toFixed(6).replace(/\.?0+$/, "");
    }
    if (typeof value === "object" && value !== null && "d" in value) {
      return new Decimal(value as Decimal).toFixed(6).replace(/\.?0+$/, "");
    }
    return new Decimal(value as string | number).toFixed(6).replace(/\.?0+$/, "");
  } catch {
    return "0";
  }
}

export function parseDecimal(raw: string | number): Decimal {
  try {
    return new Decimal(String(raw));
  } catch {
    throw new Error("Montant décimal invalide.");
  }
}

function weightedAverageCost(opts: {
  beforeQty: Decimal;
  beforeCost: Decimal;
  incomingQty: Decimal;
  incomingPrice: Decimal;
}): Decimal {
  const { beforeQty, beforeCost, incomingQty, incomingPrice } = opts;
  const numerator = beforeQty.mul(beforeCost).add(incomingQty.mul(incomingPrice));
  const denom = beforeQty.add(incomingQty);
  if (denom.eq(0)) return incomingPrice;
  return numerator.div(denom);
}

export function computeNextWeightedUnitCost(opts: {
  stockBeforeInbound: Decimal;
  currentCostUnit: Decimal;
  qtyIn: Decimal;
  unitPrice: Decimal;
}): Decimal {
  return weightedAverageCost({
    beforeQty: opts.stockBeforeInbound,
    beforeCost: opts.currentCostUnit,
    incomingQty: opts.qtyIn,
    incomingPrice: opts.unitPrice,
  });
}

export function assertNonNegativeQtyAfter(after: Decimal): void {
  if (after.lt(0)) {
    throw new Error("Stock négatif interdit après mouvement.");
  }
}

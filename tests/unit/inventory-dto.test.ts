import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";
import { toInventoryMaterialListItemDto, toSupplierBriefDto } from "../../electron/ipc/dto/inventory-dto.ts";

describe("inventory-dto", () => {
  it("toSupplierBriefDto returns null for missing supplier", () => {
    expect(toSupplierBriefDto(null)).toBeNull();
    expect(toSupplierBriefDto({ id: "s", name: "ACME" })).toEqual({ id: "s", name: "ACME" });
  });

  it("toInventoryMaterialListItemDto serializes decimals and dates for IPC", () => {
    const dto = toInventoryMaterialListItemDto(
      {
        id: "m1",
        sku: "MP-001",
        labelFr: "Lait",
        category: "Frais",
        unit: "L",
        minimumStockQty: new Decimal("5"),
        costPriceUnit: new Decimal("120.5"),
        expirationTracking: true,
        expiryWarningDays: 14,
        notes: null,
        isActive: true,
        supplierId: "s1",
        supplier: { id: "s1", name: "Fournisseur A" },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      { currentQtySerialized: "12.5", isLowStock: false },
    );

    expect(dto.minimumStockQty).toBe("5");
    expect(dto.costPriceUnit).toBe("120.5");
    expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(dto.supplier?.name).toBe("Fournisseur A");
    expect(dto.isLowStock).toBe(false);
  });
});

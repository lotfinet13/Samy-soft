import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";
import {
  attendancePayFraction,
  calculatePayrollForWorker,
  enumerateDatesInclusive,
  normalizeWorkDateUtc,
} from "../../electron/services/payroll-engine.ts";
import {
  PayrollAdjustmentKind,
  SalaryType,
  AttendanceStatus,
} from "@prisma/client";
import { computeRecipeScaleMultiplier } from "../../electron/services/production-service.ts";
import { computeInvoiceHeader, computeLineAmounts } from "../../electron/services/sales-service.ts";

describe("Calculs vente — figés et reproductibles", () => {
  it("combine sous-total, TVA ligne et remise globale comme le moteur métier", () => {
    const line = computeLineAmounts({
      quantity: new Decimal(2),
      unitPrice: new Decimal(50),
      lineDiscount: new Decimal(0),
      taxRate: new Decimal(19),
    });
    expect(line.lineSubtotal.toFixed(2)).toBe("100.00");
    expect(line.lineTax.toFixed(2)).toBe("19.00");
    const header = computeInvoiceHeader({
      lines: [line],
      invoiceDiscount: new Decimal("19"),
    });
    expect(header.subtotalAmount.toFixed(2)).toBe("100.00");
    expect(header.taxAmount.toFixed(2)).toBe("19.00");
    expect(header.totalAmount.toFixed(2)).toBe("100.00");
  });
});

describe("Calculs production — consommations théoriques", () => {
  it("applique le multiplicateur de rendement formulation", () => {
    const m = computeRecipeScaleMultiplier({
      producedTargetQty: new Decimal(250),
      yieldQty: new Decimal(100),
    });
    expect(m.toFixed(6)).toBe("2.500000");
  });
});

describe("Calculs paie — snapshot contrôlé", () => {
  it("mensuel présence simplifiée (fixtures isolées)", () => {
    const periodStart = normalizeWorkDateUtc(new Date(Date.UTC(2026, 0, 5)));
    const periodEnd = normalizeWorkDateUtc(new Date(Date.UTC(2026, 0, 31)));
    const days = enumerateDatesInclusive(periodStart, periodEnd);
    expect(days.length).toBe(27);
    expect(attendancePayFraction(AttendanceStatus.HALF_DAY)).toBe(0.5);

    const computed = calculatePayrollForWorker({
      worker: {
        salaryType: SalaryType.MONTHLY,
        baseSalary: new Decimal("90000"),
        dailyWage: new Decimal("0"),
        overtimeRate: new Decimal("500"),
      },
      periodStart,
      periodEnd,
      attendanceRows: [
        {
          workedDate: new Date(Date.UTC(2026, 0, 10)),
          status: AttendanceStatus.PRESENT,
          overtimeHours: new Decimal("2"),
        },
      ],
      adjustments: [
        {
          kind: PayrollAdjustmentKind.BONUS,
          amount: new Decimal("1000"),
        },
      ],
      advancesOutstanding: [],
    });
    expect(computed.snapshot.formulaVersion).toBe(1);
    expect(computed.netAmount.gt(0)).toBe(true);
  });
});

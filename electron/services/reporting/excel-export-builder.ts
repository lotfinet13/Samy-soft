import ExcelJS from "exceljs";

import type {
  InventoryAnalyticsDTO,
  ProductionAnalyticsDTO,
  HrAnalyticsDTO,
  SalesAnalyticsDTO,
} from "./reporting-analytics.js";
import type {
  KpiOverviewDTO,
  ManagementSummaryDTO,
  ProfitabilityOverviewDTO,
} from "./reporting-metrics.js";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F2937" },
};

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: "FFCBD5F5" } },
  top: { style: "thin", color: { argb: "FFCBD5F5" } },
  left: { style: "thin", color: { argb: "FFCBD5F5" } },
  right: { style: "thin", color: { argb: "FFCBD5F5" } },
};

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL as ExcelJS.Fill;
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = BORDER_THIN as ExcelJS.Borders;
  });
}

export async function buildOperationsDirectorWorkbook(input: {
  factoryName: string;
  currency: string;
  kpi: KpiOverviewDTO;
  management: ManagementSummaryDTO;
  profitability: ProfitabilityOverviewDTO;
  analytics: {
    inventory: InventoryAnalyticsDTO;
    production: ProductionAnalyticsDTO;
    hr: HrAnalyticsDTO;
    sales: SalesAnalyticsDTO;
  };
}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SAMY SOFT";
  wb.created = new Date();

  const sKpi = wb.addWorksheet("KPI cockpit");
  sKpi.addRow(["Paramètre", "Valeur"]);
  styleHeader(sKpi.getRow(1));
  sKpi.addRow(["Structure", input.factoryName]);
  sKpi.addRow(["Devise", input.currency]);
  sKpi.addRow(["Lots clôturés (période)", input.kpi.completedBatches]);
  sKpi.addRow(["Factures validées (période)", input.kpi.salesValidatedCount]);
  sKpi.addRow(["Ratio coûts MP / CA (court)", `${(input.kpi.productionCostRatio * 100).toFixed(1)} %`]);
  sKpi.addRow(["Charge paie estimée vs CA court", `${(input.kpi.payrollBurden * 100).toFixed(1)} %`]);
  sKpi.addRow(["Déchets vs entrées MP (quantités)", `${input.kpi.wastePctOfInboundQty.toFixed(2)} %`]);
  fitColumnsSimple(sKpi);

  const sm = wb.addWorksheet("Synthèse mensuelle");
  sm.addRow(["Mois-clé", "CA est.", "Coûts MP fab.", "Masse paie net", "Écart estimé"]);
  styleHeader(sm.getRow(1));
  input.management.estimatedMonthlyPl.forEach((m) => {
    sm.addRow([m.monthKey, m.revenue, m.productionCostIngredient, m.payrollNet, m.netEstimate]);
  });
  formatNumericCols(sm, { fromCol: 2, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(sm);

  const sr = wb.addWorksheet("Ventes");
  sr.addRow(["Semaine ISO", `CA (${input.currency})`]);
  styleHeader(sr.getRow(1));
  input.analytics.sales.revenueWeekly.forEach((r) => sr.addRow([r.week, r.revenue]));
  formatNumericCols(sr, { fromCol: 2, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(sr);

  const sc = wb.addWorksheet("Top clients");
  sc.addRow(["Client", `CA (${input.currency})`, "Factures"]);
  styleHeader(sc.getRow(1));
  input.analytics.sales.topCustomers.forEach((c) => sc.addRow([c.name, c.revenue, c.invoiceCount]));
  formatNumericCols(sc, { fromCol: 2, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(sc);

  const si = wb.addWorksheet("Inventaire achats");
  si.addRow(["Semaine ISO", `Montants achats (${input.currency})`]);
  styleHeader(si.getRow(1));
  input.analytics.inventory.purchaseValueWeekly.forEach((r) =>
    si.addRow([r.week, r.amount]),
  );
  si.addRow(["Total approvisionnement période", input.analytics.inventory.inboundValueApprox]);
  formatNumericCols(si, { fromCol: 2, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(si);

  const se = wb.addWorksheet("Inventaire péremption");
  se.addRow(["Semaine ISO", `Qté perdue`, `Valeur est. (${input.currency})`]);
  styleHeader(se.getRow(1));
  input.analytics.inventory.expiryLossWeekly.forEach((r) =>
    se.addRow([r.week, r.qty, r.valueEstimate]),
  );
  formatNumericCols(se, { fromCol: 2, firstRow: 2, numFmt: "#,##0.###" });
  formatNumericCols(se, { fromCol: 3, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(se);

  const sdp = wb.addWorksheet("Dépendance fournisseurs");
  sdp.addRow(["Fournisseur", `Achat (${input.currency})`, "% du total"]);
  styleHeader(sdp.getRow(1));
  input.analytics.inventory.supplierDependency.forEach((s) =>
    sdp.addRow([s.supplierName, s.purchaseValue, `${(s.pct * 100).toFixed(1)} %`]),
  );
  formatNumericCols(sdp, { fromCol: 2, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(sdp);

  const spo = wb.addWorksheet("Production lots");
  spo.addRow(["Code lot", `Planifié`, `Réalisé`, `Rendement %`]);
  styleHeader(spo.getRow(1));
  input.analytics.production.batchEfficiency.forEach((b) =>
    spo.addRow([b.batchCode, b.planned, b.produced, b.efficiencyPct]),
  );
  fitColumnsSimple(spo);

  const sw = wb.addWorksheet("Production déchet");
  sw.addRow(["Semaine ISO", "Qté chute chantier"]);
  styleHeader(sw.getRow(1));
  input.analytics.production.wasteTrendWeekly.forEach((w_) => sw.addRow([w_.week, w_.qty]));
  fitColumnsSimple(sw);

  const sop = wb.addWorksheet("Production opérateurs");
  sop.addRow(["Opérateur", "Sessions journalisées", "Minutes cumul"]);
  styleHeader(sop.getRow(1));
  input.analytics.production.operatorProductivity.forEach((o) =>
    sop.addRow([o.operatorName, o.sessions, o.runtimeMinutes]),
  );
  fitColumnsSimple(sop);

  const sh = wb.addWorksheet("RH présences hebdo");
  sh.addRow(["Semaine", "Équivalence présences", "Absences équivalent", "Signatures HS"]);
  styleHeader(sh.getRow(1));
  input.analytics.hr.attendanceStatusWeekly.forEach((h_) =>
    sh.addRow([h_.week, h_.presentOrEquivalent, h_.absentEquivalent, h_.overtimeMarked]),
  );
  fitColumnsSimple(sh);

  const sov = wb.addWorksheet("RH heures HS");
  sov.addRow(["Mois", "Heures sup. cumul"]);
  styleHeader(sov.getRow(1));
  input.analytics.hr.overtimeMonthlyHours.forEach((o) => sov.addRow([o.month, o.hours]));
  formatNumericCols(sov, { fromCol: 2, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(sov);

  const sp = wb.addWorksheet("RH masse salariale");
  sp.addRow(["Mois", `Net versé (${input.currency})`, "Bulletins"]);
  styleHeader(sp.getRow(1));
  input.analytics.hr.payrollNetMonthly.forEach((p_) => sp.addRow([p_.month, p_.netAmount, p_.recordCount]));
  formatNumericCols(sp, { fromCol: 2, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(sp);

  const pr = wb.addWorksheet("Rentabilité synthèse");
  pr.addRow(["Indicateur", `Valeur (${input.currency})`]);
  styleHeader(pr.getRow(1));
  pr.addRow(["CA facturé validé", input.profitability.revenueValidated]);
  pr.addRow(["Coûts MP fabrication (lots clôturés)", input.profitability.productionIngredientCost]);
  pr.addRow(["Main d'œuvre estimée lots", input.profitability.productionLaborEstimate]);
  pr.addRow(["Frais généraux estimés lots", input.profitability.productionOverheadEstimate]);
  pr.addRow(["Masse salariale nette (périodes recouvrant la fenêtre)", input.profitability.payrollNetOperational]);
  pr.addRow(["Valeur estimée déchets MP", input.profitability.wasteValueEstimate]);
  pr.addRow(["Valeur estimée pertes péremption", input.profitability.expiryLossValueEstimate]);
  pr.addRow(["Marge brute opérationnelle estimée", input.profitability.grossMarginEstimate]);
  pr.addRow(["Ratio coûts opérationnels / CA", `${(input.profitability.costToRevenueRatio * 100).toFixed(1)} %`]);
  formatNumericCols(pr, { fromCol: 2, firstRow: 2, lastRow: pr.rowCount - 1, numFmt: "#,##0.00" });
  fitColumnsSimple(pr);

  const prd = wb.addWorksheet("Rentabilité produits");
  prd.addRow(["SKU", "Libellé", `CA (${input.currency})`, "Qté", "Coût MP est.", "Marge est."]);
  styleHeader(prd.getRow(1));
  input.profitability.productRanking.forEach((p_) =>
    prd.addRow([
      p_.sku,
      p_.name,
      p_.revenue,
      p_.qtySold,
      p_.estimatedCost ?? "",
      p_.marginEstimate ?? "",
    ]),
  );
  formatNumericCols(prd, { fromCol: 3, firstRow: 2, numFmt: "#,##0.00" });
  formatNumericCols(prd, { fromCol: 4, firstRow: 2, numFmt: "#,##0.###" });
  formatNumericCols(prd, { fromCol: 5, firstRow: 2, numFmt: "#,##0.00" });
  formatNumericCols(prd, { fromCol: 6, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(prd);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

export async function buildPayrollExportWorkbook(
  rows: Array<{
    workerCode: string;
    workerName: string;
    periodStart: string;
    periodEnd: string;
    gross: number;
    net: number;
    status: string;
  }>,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Paie");
  sheet.addRow([
    "Code salarié",
    "Nom",
    "Début période",
    "Fin période",
    "Brut",
    "Net",
    "Statut",
  ]);
  styleHeader(sheet.getRow(1));
  rows.forEach((r) =>
    sheet.addRow([
      r.workerCode,
      r.workerName,
      r.periodStart,
      r.periodEnd,
      r.gross,
      r.net,
      r.status,
    ]),
  );
  formatNumericCols(sheet, { fromCol: 5, firstRow: 2, numFmt: "#,##0.00" });
  formatNumericCols(sheet, { fromCol: 6, firstRow: 2, numFmt: "#,##0.00" });
  fitColumnsSimple(sheet);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

function fitColumnsSimple(sheet: ExcelJS.Worksheet): void {
  const row1 = sheet.getRow(1);
  const colCount =
    typeof row1.actualCellCount === "number" && row1.actualCellCount > 0
      ? row1.actualCellCount
      : 8;
  for (let col = 1; col <= colCount; col += 1) {
    sheet.getColumn(col).width = 22;
  }
}

function formatNumericCols(
  sheet: ExcelJS.Worksheet,
  opts: { fromCol: number; firstRow?: number; lastRow?: number; numFmt: string },
): void {
  const last = opts.lastRow ?? sheet.rowCount;
  const first = opts.firstRow ?? 2;
  for (let r = first; r <= last; r += 1) {
    const cell = sheet.getCell(r, opts.fromCol);
    if (typeof cell.value === "number") cell.numFmt = opts.numFmt;
  }
}

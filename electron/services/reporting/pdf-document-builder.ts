import { PDFDocument, StandardFonts, type PDFFont, rgb } from "pdf-lib";
import type { PrismaClient } from "@prisma/client";

import { decimalToString } from "../inventory-service.js";

const MARGIN = 48;
const FONT_SIZE = 9;
const FONT_SIZE_TITLE = 14;

function formatMoney(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Page PDF pour pagination / pied de page (profiles A4 / thermique futures). */
type ReportingPdfPage = ReturnType<PDFDocument["addPage"]>;

function drawFooter(page: ReportingPdfPage, font: PDFFont, pageIdx: number, totalPages: number): void {
  const text = `Page ${pageIdx + 1} / ${totalPages} — SAMY SOFT`;
  const wFooter = font.widthOfTextAtSize(text, 8);
  page.drawText(text, {
    x: (page.getWidth() - wFooter) / 2,
    y: 28,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
}

export type PdfPageProfile = "A4" | "THERMAL_80MM";

function pageSizeFor(profile: PdfPageProfile): { w: number; h: number } {
  if (profile === "THERMAL_80MM") return { w: 226.77, h: 842 }; // ~80mm large
  return { w: 595.28, h: 841.89 };
}

async function embeddedHelvetica(pdfDoc: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  return {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
}

export async function buildInvoicePdf(
  prisma: PrismaClient,
  invoiceId: string,
  branding: { factoryName: string; currencyCode: string },
  opts?: { profile?: PdfPageProfile },
): Promise<Uint8Array> {
  const profile = opts?.profile ?? "A4";
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
  if (!inv) throw new Error("Facture introuvable pour PDF.");

  const pdfDoc = await PDFDocument.create();
  const dims = pageSizeFor(profile);

  let page = pdfDoc.addPage([dims.w, dims.h]);
  let y = dims.h - MARGIN;

  const { regular, bold } = await embeddedHelvetica(pdfDoc);

  page.drawText(branding.factoryName.toUpperCase(), {
    x: MARGIN,
    y,
    size: FONT_SIZE_TITLE,
    font: bold,
    color: rgb(0.1, 0.12, 0.22),
  });
  y -= 28;
  page.drawText("DOCUMENT COMMERCIAL — FACTURE / AVOIR (si applicable)", {
    x: MARGIN,
    y,
    size: FONT_SIZE,
    font: regular,
    color: rgb(0.25, 0.25, 0.33),
  });
  y -= 22;
  page.drawText(`Réf.: ${inv.number}`, { x: MARGIN, y, size: FONT_SIZE + 1, font: bold });
  page.drawText(`Émis : ${inv.issuedAt.toLocaleDateString("fr-FR")}`, {
    x: dims.w - MARGIN - 180,
    y,
    size: FONT_SIZE,
    font: regular,
  });
  y -= 18;

  page.drawText(`Statut : ${inv.status} · Paiement : ${inv.paymentStatus}`, {
    x: MARGIN,
    y,
    size: FONT_SIZE - 0.5,
    font: regular,
  });
  y -= 22;

  page.drawText("Client", { x: MARGIN, y, size: FONT_SIZE, font: bold });
  y -= 14;
  page.drawText(inv.customer.name, { x: MARGIN, y, size: FONT_SIZE, font: regular });
  y -= 12;
  if (inv.customer.address) {
    page.drawText(inv.customer.address, { x: MARGIN, y, size: FONT_SIZE - 0.5, font: regular });
    y -= 12;
  }
  if (inv.customer.city) {
    page.drawText(inv.customer.city, { x: MARGIN, y, size: FONT_SIZE - 0.5, font: regular });
    y -= 12;
  }

  const idLine = [];
  if (inv.customer.taxIdentifier) idLine.push(`N.I.F.: ${inv.customer.taxIdentifier}`);
  if (idLine.length) {
    page.drawText(idLine.join(" · "), { x: MARGIN, y, size: FONT_SIZE - 1, font: regular });
    y -= 14;
  }

  y -= 10;
  page.drawText(
    `${"Article".padEnd(32)} ${"Qté".padStart(8)} PU ${("HT").padStart(14)} TVA ${("TTC").padStart(14)}`,
    { x: MARGIN, y, size: FONT_SIZE - 0.8, font: bold },
  );
  y -= FONT_SIZE;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: dims.w - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.75, 0.76, 0.82),
  });
  y -= 8;

  for (const it of inv.items) {
    if (y < MARGIN + 120) {
      page = pdfDoc.addPage([dims.w, dims.h]);
      y = dims.h - MARGIN;
    }
    const label = `${it.labelFr}`.slice(0, 40);
    const qty = decimalToString(it.quantity);
    const pu = decimalToString(it.unitPrice);
    const ttc = decimalToString(it.lineTotal);

    page.drawText(
      `${label.padEnd(38)} ${qty.padStart(6)} ${formatMoney(Number.parseFloat(pu)).padStart(
        14,
      )} ${formatMoney(Number.parseFloat(decimalToString(it.lineTax))).padStart(12)} ${formatMoney(Number.parseFloat(ttc)).padStart(14)}`,
      { x: MARGIN, y, size: FONT_SIZE - 1, font: regular },
    );
    y -= FONT_SIZE;
  }

  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: dims.w - MARGIN, y },
    thickness: 0.4,
    color: rgb(0.75, 0.76, 0.82),
  });
  y -= FONT_SIZE;

  page.drawText(
    `${"TOTAL TTC"} ${formatMoney(Number.parseFloat(decimalToString(inv.totalAmount)))} ${branding.currencyCode}`,
    {
      x: dims.w - MARGIN - 220,
      y,
      size: FONT_SIZE + 1,
      font: bold,
    },
  );
  y -= 18;
  page.drawText(
    `(HT ${formatMoney(Number.parseFloat(decimalToString(inv.subtotalAmount)))} · TVA ${formatMoney(
      Number.parseFloat(decimalToString(inv.taxAmount)),
    )})`,
    { x: dims.w - MARGIN - 220, y, size: FONT_SIZE - 1, font: regular },
  );

  const pagesAr = pdfDoc.getPages();
  pagesAr.forEach((p, i) => drawFooter(p, regular, i, pagesAr.length));

  return pdfDoc.save();
}

export async function buildPayrollSlipPdf(
  prisma: PrismaClient,
  payrollRecordId: string,
  branding: { factoryName: string },
): Promise<Uint8Array> {
  const rec = await prisma.payrollRecord.findUnique({
    where: { id: payrollRecordId },
    include: { worker: true },
  });
  if (!rec) throw new Error("Bulletin introuvable pour PDF.");

  const pdfDoc = await PDFDocument.create();
  const { w, h } = pageSizeFor("A4");
  const page = pdfDoc.addPage([w, h]);
  const { regular, bold } = await embeddedHelvetica(pdfDoc);
  let y = h - MARGIN;

  page.drawText(branding.factoryName.toUpperCase(), {
    x: MARGIN,
    y,
    size: FONT_SIZE_TITLE,
    font: bold,
  });
  y -= 24;
  page.drawText(
    `BULLETIN DE SALAIRE — du ${rec.periodStart.toLocaleDateString("fr-FR")} au ${rec.periodEnd.toLocaleDateString("fr-FR")}`,
    {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font: regular,
    },
  );
  y -= 24;
  page.drawText(`${rec.worker.firstName} ${rec.worker.lastName} · Matricule ${rec.worker.code}`, {
    x: MARGIN,
    y,
    size: FONT_SIZE + 1,
    font: bold,
  });
  y -= FONT_SIZE;

  type Line = readonly [string, string];
  const lines: Line[] = [
    ["Statut bulletin", `${rec.status}`],
    ["Salaire brut", formatMoney(Number.parseFloat(decimalToString(rec.grossAmount)))],
    ["Heures supplémentaires", formatMoney(Number.parseFloat(decimalToString(rec.overtimePay)))],
    ["Retenues diverses", formatMoney(Number.parseFloat(decimalToString(rec.deductions)))],
    ["Remboursements avances", formatMoney(Number.parseFloat(decimalToString(rec.advanceRecovery)))],
    ["NET À PAYER", formatMoney(Number.parseFloat(decimalToString(rec.netAmount)))],
    ["Devise", rec.currencyCode],
  ];

  for (const [k, val] of lines) {
    page.drawText(k, { x: MARGIN, y, size: FONT_SIZE - 0.5, font: regular });
    page.drawText(val, { x: w - MARGIN - 190, y, size: FONT_SIZE - 0.5, font: bold });
    y -= FONT_SIZE;
  }

  y -= FONT_SIZE;

  page.drawText("Mentions réglementaires : document opérationnel interne avant comptabilité formelle.", {
    x: MARGIN,
    y,
    maxWidth: w - MARGIN * 2,
    size: FONT_SIZE - 1.2,
    font: regular,
    color: rgb(0.3, 0.3, 0.35),
    lineHeight: FONT_SIZE + 1,
  });

  drawFooter(page, regular, 0, 1);

  return pdfDoc.save();
}

export async function buildInventorySummaryPdf(
  branding: { factoryName: string; currencyCode: string },
  lines: Array<{ label: string; sku: string; qty: string; value: string }>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { w, h } = pageSizeFor("A4");
  let page = pdfDoc.addPage([w, h]);
  const { regular, bold } = await embeddedHelvetica(pdfDoc);
  let y = h - MARGIN;

  page.drawText(branding.factoryName.toUpperCase(), {
    x: MARGIN,
    y,
    size: FONT_SIZE_TITLE,
    font: bold,
  });
  y -= 26;
  page.drawText(`ETAT ANALYTIQUE INVENTAIRE — ${lines.length} lignes`, {
    x: MARGIN,
    y,
    size: FONT_SIZE,
    font: regular,
  });
  y -= FONT_SIZE;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: w - MARGIN, y },
    thickness: 0.4,
    color: rgb(0.75, 0.76, 0.82),
  });
  y -= 10;

  for (const row of lines) {
    if (y < MARGIN + 72) {
      page = pdfDoc.addPage([w, h]);
      y = h - MARGIN;
    }
    const left = `${row.label} (${row.sku})`.slice(0, 74);
    page.drawText(left, {
      x: MARGIN,
      y,
      size: FONT_SIZE - 1,
      font: regular,
      maxWidth: w - MARGIN * 2 - 120,
    });
    page.drawText(`Qté ${row.qty} · Val ${row.value} ${branding.currencyCode}`, {
      x: w - MARGIN - 160,
      y,
      size: FONT_SIZE - 1,
      font: bold,
    });
    y -= FONT_SIZE + 2;
  }

  const pgCount = pdfDoc.getPages().length;
  pdfDoc.getPages().forEach((p, idx) => drawFooter(p, regular, idx, pgCount));

  return pdfDoc.save();
}

export async function buildAttendanceSummaryPdf(
  branding: { factoryName: string },
  rows: Array<{ date: string; worker: string; status: string; hours: string }>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { w, h } = pageSizeFor("A4");
  let page = pdfDoc.addPage([w, h]);
  const { regular, bold } = await embeddedHelvetica(pdfDoc);
  let y = h - MARGIN;

  page.drawText(branding.factoryName.toUpperCase(), { x: MARGIN, y, size: FONT_SIZE_TITLE, font: bold });
  y -= 24;
  page.drawText("PRÉSENCES — EXTRAIT OPÉRATIONNEL", { x: MARGIN, y, size: FONT_SIZE, font: regular });
  y -= 16;

  for (const r of rows) {
    if (y < MARGIN + 60) {
      page = pdfDoc.addPage([w, h]);
      y = h - MARGIN;
    }
    page.drawText(`${r.date} — ${r.worker}`, { x: MARGIN, y, size: FONT_SIZE - 1, font: bold });
    y -= FONT_SIZE - 2;
    page.drawText(`${r.status} · ${r.hours}`, { x: MARGIN + 10, y, size: FONT_SIZE - 2, font: regular });
    y -= FONT_SIZE;
  }

  const attendancePages = pdfDoc.getPages().length;
  pdfDoc.getPages().forEach((p, idx) => drawFooter(p, regular, idx, attendancePages));

  return pdfDoc.save();
}

export async function buildProductionSummaryPdf(
  branding: { factoryName: string },
  rows: Array<{
    code: string;
    recipeLabel: string;
    planned: string;
    produced: string;
    status: string;
    finishedIso: string;
  }>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { w, h } = pageSizeFor("A4");
  let page = pdfDoc.addPage([w, h]);
  const { regular, bold } = await embeddedHelvetica(pdfDoc);
  let y = h - MARGIN;

  page.drawText(branding.factoryName.toUpperCase(), { x: MARGIN, y, size: FONT_SIZE_TITLE, font: bold });
  y -= 24;
  page.drawText("FABRICATION — EXTRACTION LOTS SUR PÉRIODE", {
    x: MARGIN,
    y,
    size: FONT_SIZE,
    font: regular,
  });
  y -= 16;

  for (const r of rows) {
    if (y < MARGIN + 66) {
      page = pdfDoc.addPage([w, h]);
      y = h - MARGIN;
    }
    page.drawText(`${r.code} · ${r.recipeLabel}`, { x: MARGIN, y, size: FONT_SIZE - 1, font: bold });
    y -= FONT_SIZE - 2;
    page.drawText(
      `${r.status} · plan ${r.planned} → réalisé ${r.produced} · clôturé ${r.finishedIso}`,
      {
        x: MARGIN + 10,
        y,
        size: FONT_SIZE - 2,
        font: regular,
      },
    );
    y -= FONT_SIZE + 2;
  }

  const prodPages = pdfDoc.getPages().length;
  pdfDoc.getPages().forEach((p, idx) => drawFooter(p, regular, idx, prodPages));

  return pdfDoc.save();
}

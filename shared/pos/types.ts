/**
 * POS-ready contracts — implémentations futures (scanner USB/HID, ESC/POS, mode caisse rapide).
 * Le module ventes s’appuie sur les mêmes services IPC que l’interface bureau.
 */

export type BarcodeScanEvent = {
  raw: string;
  format?: string;
  scannedAt: string;
  sourceDevice?: string;
};

/** Port abstrait pour brancher un pilote scanner sans coupler l’UI */
export type BarcodeScannerPort = {
  subscribe: (handler: (evt: BarcodeScanEvent) => void) => () => void;
};

export type BarcodeMappingTarget =
  | "RAW_MATERIAL"
  | "PACKAGING_MATERIAL"
  | "PRODUCT"
  | "PRODUCTION_BATCH"
  | "INVOICE";

export type BarcodeResolution = {
  barcode: string;
  targetType: BarcodeMappingTarget;
  targetId: string;
  sku?: string | null;
  label?: string | null;
};

export type ThermalPrintJob = {
  /** Référence facture ou ticket */
  documentRef: string;
  documentType?: "receipt" | "compact-invoice" | "label" | "operation";
  paperProfile?: "THERMAL_80MM" | "LABEL_58MM" | "A4_COMPACT";
  payload: Uint8Array | string;
};

export type ThermalPrinterPort = {
  enqueue: (job: ThermalPrintJob) => Promise<{ ok: boolean; error?: string }>;
};

/** Session courte pour parcours tactile — état volatil côté renderer */
export type FastInvoiceSessionState = {
  customerId: string | null;
  lineDrafts: Array<{ productId: string | null; qty: string }>;
};

export type TouchscreenWorkflow = "pos" | "attendance" | "production-log";

export type TouchTerminalConfig = {
  workflow: TouchscreenWorkflow;
  minTargetPx: number;
  primaryActions: string[];
};

import { decimalToString } from "../../services/inventory-service.js";

export type SupplierBriefDto = {
  id: string;
  name: string;
};

export type InventoryMaterialListItemDto = {
  id: string;
  sku: string;
  labelFr: string;
  category: string | null;
  unit: string;
  minimumStockQty: string;
  costPriceUnit: string;
  expirationTracking: boolean;
  expiryWarningDays: number | null;
  notes: string | null;
  isActive: boolean;
  supplierId: string | null;
  supplier: SupplierBriefDto | null;
  createdAt: string;
  updatedAt: string;
  currentQtySerialized: string;
  isLowStock: boolean;
};

type MaterialRowBase = {
  id: string;
  sku: string;
  labelFr: string;
  category: string | null;
  unit: string;
  minimumStockQty: unknown;
  costPriceUnit: unknown;
  expirationTracking: boolean;
  expiryWarningDays: number | null;
  notes: string | null;
  isActive: boolean;
  supplierId: string | null;
  supplier?: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toSupplierBriefDto(
  supplier: { id: string; name: string } | null | undefined,
): SupplierBriefDto | null {
  if (!supplier) return null;
  return { id: supplier.id, name: supplier.name };
}

export function toInventoryMaterialListItemDto(
  row: MaterialRowBase,
  balance: { currentQtySerialized: string; isLowStock: boolean },
): InventoryMaterialListItemDto {
  return {
    id: row.id,
    sku: row.sku,
    labelFr: row.labelFr,
    category: row.category,
    unit: row.unit,
    minimumStockQty: decimalToString(row.minimumStockQty),
    costPriceUnit: decimalToString(row.costPriceUnit),
    expirationTracking: row.expirationTracking,
    expiryWarningDays: row.expiryWarningDays,
    notes: row.notes,
    isActive: row.isActive,
    supplierId: row.supplierId,
    supplier: toSupplierBriefDto(row.supplier),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    currentQtySerialized: balance.currentQtySerialized,
    isLowStock: balance.isLowStock,
  };
}

export type SupplierListItemDto = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  linkedRaw: number;
  linkedPackaging: number;
  purchaseCount: number;
};

export type SupplierMaterialBriefDto = {
  id: string;
  sku: string;
  labelFr: string;
  unit: string;
  isActive: boolean;
};

export type SupplierPurchaseBriefDto = {
  id: string;
  invoiceRef: string | null;
  purchaseDate: string;
  totalAmountSerialized: string;
  currencyCode: string;
};

export type SupplierDetailDto = SupplierListItemDto & {
  rawMaterials: SupplierMaterialBriefDto[];
  packagingMaterials: SupplierMaterialBriefDto[];
  recentPurchases: SupplierPurchaseBriefDto[];
};

export function toSupplierMaterialBrief(row: {
  id: string;
  sku: string;
  labelFr: string;
  unit: string;
  isActive: boolean;
}): SupplierMaterialBriefDto {
  return {
    id: row.id,
    sku: row.sku,
    labelFr: row.labelFr,
    unit: row.unit,
    isActive: row.isActive,
  };
}

export function toSupplierPurchaseBrief(row: {
  id: string;
  invoiceRef: string | null;
  purchaseDate: Date;
  totalAmount: unknown;
  currencyCode: string;
}): SupplierPurchaseBriefDto {
  return {
    id: row.id,
    invoiceRef: row.invoiceRef,
    purchaseDate: row.purchaseDate.toISOString(),
    totalAmountSerialized: decimalToString(row.totalAmount),
    currencyCode: row.currencyCode,
  };
}

export function toSupplierDetailDto(supplier: {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  rawMaterials: Array<{
    id: string;
    sku: string;
    labelFr: string;
    unit: string;
    isActive: boolean;
  }>;
  packagingMaterials: Array<{
    id: string;
    sku: string;
    labelFr: string;
    unit: string;
    isActive: boolean;
  }>;
  purchases: Array<{
    id: string;
    invoiceRef: string | null;
    purchaseDate: Date;
    totalAmount: unknown;
    currencyCode: string;
  }>;
  _count: { rawMaterials: number; packagingMaterials: number; purchases: number };
}): SupplierDetailDto {
  return {
    ...toSupplierListItemDto(supplier),
    rawMaterials: supplier.rawMaterials.map(toSupplierMaterialBrief),
    packagingMaterials: supplier.packagingMaterials.map(toSupplierMaterialBrief),
    recentPurchases: supplier.purchases.map(toSupplierPurchaseBrief),
  };
}

export function toSupplierListItemDto(supplier: {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { rawMaterials: number; packagingMaterials: number; purchases: number };
}): SupplierListItemDto {
  return {
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contactName,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    isActive: supplier.isActive,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
    linkedRaw: supplier._count.rawMaterials,
    linkedPackaging: supplier._count.packagingMaterials,
    purchaseCount: supplier._count.purchases,
  };
}

export type PurchaseEntryListItemDto = {
  id: string;
  supplierId: string;
  invoiceRef: string | null;
  notes: string | null;
  purchaseDate: string;
  currencyCode: string;
  totalAmountSerialized: string;
  createdAt: string;
  updatedAt: string;
  supplier: SupplierBriefDto;
  lines: Array<{
    id: string;
    materialKind: string;
    qtySerialized: string;
    unitPriceSerialized: string;
    lineTotalSerialized: string;
    expiresAt: string | null;
  }>;
};

export function toPurchaseEntryListItemDto(entry: {
  id: string;
  supplierId: string;
  invoiceRef: string | null;
  notes: string | null;
  purchaseDate: Date;
  currencyCode: string;
  totalAmount: unknown;
  createdAt: Date;
  updatedAt: Date;
  supplier: { id: string; name: string };
  lines: Array<{
    id: string;
    materialKind: string;
    qty: unknown;
    unitPrice: unknown;
    lineTotal: unknown;
    expiresAt: Date | null;
  }>;
}): PurchaseEntryListItemDto {
  return {
    id: entry.id,
    supplierId: entry.supplierId,
    invoiceRef: entry.invoiceRef,
    notes: entry.notes,
    purchaseDate: entry.purchaseDate.toISOString(),
    currencyCode: entry.currencyCode,
    totalAmountSerialized: decimalToString(entry.totalAmount),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    supplier: { id: entry.supplier.id, name: entry.supplier.name },
    lines: entry.lines.map((line) => ({
      id: line.id,
      materialKind: line.materialKind,
      qtySerialized: decimalToString(line.qty),
      unitPriceSerialized: decimalToString(line.unitPrice),
      lineTotalSerialized: decimalToString(line.lineTotal),
      expiresAt: line.expiresAt ? line.expiresAt.toISOString() : null,
    })),
  };
}

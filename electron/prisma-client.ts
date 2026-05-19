/**
 * ESM-safe re-exports for @prisma/client (CommonJS) in the packaged Electron main process.
 */
import prismaPkg from "@prisma/client";
import runtimePkg from "@prisma/client/runtime/library.js";
import type { Decimal as DecimalType } from "@prisma/client/runtime/library";
import type {
  AdvanceRepaymentStatus as AdvanceRepaymentStatusEnum,
  AttendanceRecord,
  AttendanceStatus as AttendanceStatusEnum,
  BarcodeEntityType as BarcodeEntityTypeEnum,
  BatchStatus as BatchStatusEnum,
  InventoryMovementKind as InventoryMovementKindEnum,
  InventoryUnit as InventoryUnitEnum,
  InvoicePaymentStatus as InvoicePaymentStatusEnum,
  InvoiceStatus as InvoiceStatusEnum,
  LockScope as LockScopeEnum,
  MachineMaintenanceSchedule,
  MachineStatus as MachineStatusEnum,
  MaintenanceScheduleStatus as MaintenanceScheduleStatusEnum,
  MaterialKind as MaterialKindEnum,
  PaymentMethod as PaymentMethodEnum,
  PayrollAdjustment,
  PayrollAdjustmentKind as PayrollAdjustmentKindEnum,
  PayrollCycleStatus as PayrollCycleStatusEnum,
  PayrollStatus as PayrollStatusEnum,
  PrismaClient as PrismaClientType,
  Recipe,
  RoleName as RoleNameEnum,
  SalaryType as SalaryTypeEnum,
  Worker,
} from "@prisma/client";

export const PrismaClient = prismaPkg.PrismaClient;
export const AdvanceRepaymentStatus = prismaPkg.AdvanceRepaymentStatus;
export const AttendanceStatus = prismaPkg.AttendanceStatus;
export const BarcodeEntityType = prismaPkg.BarcodeEntityType;
export const BatchStatus = prismaPkg.BatchStatus;
export const InventoryMovementKind = prismaPkg.InventoryMovementKind;
export const InventoryUnit = prismaPkg.InventoryUnit;
export const InvoicePaymentStatus = prismaPkg.InvoicePaymentStatus;
export const InvoiceStatus = prismaPkg.InvoiceStatus;
export const LockScope = prismaPkg.LockScope;
export const MachineStatus = prismaPkg.MachineStatus;
export const MaintenanceScheduleStatus = prismaPkg.MaintenanceScheduleStatus;
export const MaterialKind = prismaPkg.MaterialKind;
export const PaymentMethod = prismaPkg.PaymentMethod;
export const PayrollAdjustmentKind = prismaPkg.PayrollAdjustmentKind;
export const PayrollCycleStatus = prismaPkg.PayrollCycleStatus;
export const PayrollStatus = prismaPkg.PayrollStatus;
export const RoleName = prismaPkg.RoleName;
export const SalaryType = prismaPkg.SalaryType;

export const Decimal = runtimePkg.Decimal;

export import Prisma = prismaPkg.Prisma;

export type PrismaClient = PrismaClientType;
export type Decimal = DecimalType;
export type AdvanceRepaymentStatus = AdvanceRepaymentStatusEnum;
export type AttendanceStatus = AttendanceStatusEnum;
export type BarcodeEntityType = BarcodeEntityTypeEnum;
export type BatchStatus = BatchStatusEnum;
export type InventoryMovementKind = InventoryMovementKindEnum;
export type InventoryUnit = InventoryUnitEnum;
export type InvoicePaymentStatus = InvoicePaymentStatusEnum;
export type InvoiceStatus = InvoiceStatusEnum;
export type LockScope = LockScopeEnum;
export type MachineStatus = MachineStatusEnum;
export type MaintenanceScheduleStatus = MaintenanceScheduleStatusEnum;
export type MaterialKind = MaterialKindEnum;
export type PaymentMethod = PaymentMethodEnum;
export type PayrollAdjustmentKind = PayrollAdjustmentKindEnum;
export type PayrollCycleStatus = PayrollCycleStatusEnum;
export type PayrollStatus = PayrollStatusEnum;
export type RoleName = RoleNameEnum;
export type SalaryType = SalaryTypeEnum;

export type {
  AttendanceRecord,
  MachineMaintenanceSchedule,
  PayrollAdjustment,
  Recipe,
  Worker,
};

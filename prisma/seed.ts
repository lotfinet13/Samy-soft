import { PrismaClient, RoleName } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../shared/permissions.js";
import { DEFAULT_SETTINGS, APP_SETTING_KEYS } from "../shared/settings-keys.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const roles = [
    {
      name: RoleName.ADMIN,
      labelFr: "Administrateur",
      permissions: ["*"],
    },
    {
      name: RoleName.MANAGER,
      labelFr: "Responsable",
      permissions: [
        PERMISSIONS.DASHBOARD_READ,
        PERMISSIONS.SETTINGS_READ,
        PERMISSIONS.SETTINGS_WRITE,
        PERMISSIONS.BACKUP_EXPORT,
        PERMISSIONS.BACKUP_RESTORE,
        PERMISSIONS.ACTIVITY_READ,
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.INVENTORY_WRITE,
        PERMISSIONS.INVENTORY_PURCHASE,
        PERMISSIONS.INVENTORY_ADJUST,
        PERMISSIONS.INVENTORY_REPORT,
        PERMISSIONS.PRODUCTION_READ,
        PERMISSIONS.PRODUCTION_WRITE,
        PERMISSIONS.PRODUCTION_EXECUTE,
        PERMISSIONS.PRODUCTION_ADJUST_COST,
        PERMISSIONS.PRODUCTION_REPORT,
        PERMISSIONS.SALES_READ,
        PERMISSIONS.SALES_WRITE,
        PERMISSIONS.SALES_VALIDATE,
        PERMISSIONS.SALES_CANCEL,
        PERMISSIONS.SALES_PAYMENT,
        PERMISSIONS.SALES_REPORT,
        PERMISSIONS.HR_READ,
        PERMISSIONS.HR_WRITE,
        PERMISSIONS.PAYROLL_READ,
        PERMISSIONS.PAYROLL_EXECUTE,
        PERMISSIONS.PAYROLL_ADJUST,
        PERMISSIONS.PAYROLL_REPORT,
        PERMISSIONS.REPORTS_READ,
        PERMISSIONS.REPORTS_EXPORT,
        PERMISSIONS.REPORTS_FINANCIAL,
        PERMISSIONS.ANALYTICS_READ,
      ],
    },
    {
      name: RoleName.OPERATOR,
      labelFr: "Opérateur",
      permissions: [
        PERMISSIONS.DASHBOARD_READ,
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.INVENTORY_PURCHASE,
        PERMISSIONS.INVENTORY_ADJUST,
        PERMISSIONS.PRODUCTION_READ,
        PERMISSIONS.PRODUCTION_EXECUTE,
        PERMISSIONS.SALES_READ,
        PERMISSIONS.SALES_WRITE,
        PERMISSIONS.SALES_VALIDATE,
        PERMISSIONS.SALES_PAYMENT,
        PERMISSIONS.HR_READ,
        PERMISSIONS.HR_WRITE,
        PERMISSIONS.REPORTS_READ,
        PERMISSIONS.REPORTS_EXPORT,
      ],
    },
    {
      name: RoleName.VIEWER,
      labelFr: "Consultation",
      permissions: [
        PERMISSIONS.DASHBOARD_READ,
        PERMISSIONS.ACTIVITY_READ,
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.INVENTORY_REPORT,
        PERMISSIONS.PRODUCTION_READ,
        PERMISSIONS.PRODUCTION_REPORT,
        PERMISSIONS.SALES_READ,
        PERMISSIONS.SALES_REPORT,
        PERMISSIONS.HR_READ,
        PERMISSIONS.PAYROLL_READ,
        PERMISSIONS.PAYROLL_REPORT,
        PERMISSIONS.REPORTS_READ,
        PERMISSIONS.ANALYTICS_READ,
      ],
    },
  ] as const;

  const roleIds = new Map<RoleName, string>();

  for (const role of roles) {
    const row = await prisma.role.upsert({
      where: { name: role.name },
      update: {
        labelFr: role.labelFr,
        permissions: JSON.stringify(role.permissions),
      },
      create: {
        name: role.name,
        labelFr: role.labelFr,
        permissions: JSON.stringify(role.permissions),
      },
    });
    roleIds.set(role.name, row.id);
  }

  const adminPassword = process.env.SAMY_SEED_ADMIN_PASSWORD ?? "Admin123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const adminRoleId = roleIds.get(RoleName.ADMIN);
  if (!adminRoleId) throw new Error("Rôle administrateur introuvable après upsert.");

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash,
      displayName: "Administrateur SAMY SOFT",
      roleId: adminRoleId,
      isActive: true,
    },
    create: {
      username: "admin",
      passwordHash,
      displayName: "Administrateur SAMY SOFT",
      roleId: adminRoleId,
      isActive: true,
    },
  });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.appSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  const skipWizard = process.env.SAMY_SEED_SKIP_WIZARD === "1" || process.env.SAMY_E2E === "1";
  if (skipWizard) {
    await prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.ONBOARDING_WIZARD_DONE },
      update: { value: "true" },
      create: { key: APP_SETTING_KEYS.ONBOARDING_WIZARD_DONE, value: "true" },
    });
  }
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

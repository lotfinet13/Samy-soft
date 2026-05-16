import { z } from "zod";

export const backupRestorePayloadSchema = z.object({
  backupId: z.string().uuid(),
  skipVerify: z.boolean().optional(),
});

export type BackupRestorePayload = z.infer<typeof backupRestorePayloadSchema>;

export const backupVerifyPayloadSchema = z.object({
  backupId: z.string().uuid(),
});

export const activityQueryPayloadSchema = z.object({
  offset: z.number().int().min(0).max(10_000).optional(),
  take: z.number().int().min(5).max(300).optional(),
  /** Date locale `YYYY-MM-DD` ou ISO complète présentée par le composant `<input type="date" />`. */
  fromIso: z.string().max(40).nullable().optional(),
  toIso: z.string().max(40).nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  search: z.string().max(200).nullable().optional(),
  actionsCsv: z.string().max(500).nullable().optional(),
});

export type ActivityQueryPayload = z.infer<typeof activityQueryPayloadSchema>;

export const activityExportPayloadSchema = activityQueryPayloadSchema.extend({
  exportLimit: z.number().int().min(10).max(5000).optional(),
});

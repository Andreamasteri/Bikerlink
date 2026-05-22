import { z } from "zod";

export const otaErrorSchema = z.object({
  error: z.string().min(1, "error is required"),
  failCount: z.number().int().optional(),
  updateId: z.string().optional(),
  runtimeVersion: z.string().optional(),
  phase: z.string().optional(),
  source: z.string().optional(),
  platform: z.string().optional(),
  deviceId: z.string().optional(),
  errorCode: z.string().optional(),
  errorCause: z.string().optional(),
  errorUserInfo: z.string().optional(),
  nativeStack: z.string().optional(),
  updateUrl: z.string().optional(),
  channel: z.string().optional(),
  networkInfo: z.string().optional(),
  probe: z.object({
    status: z.number().optional(),
    contentType: z.string().optional(),
    bodySnippet: z.string().optional(),
    durationMs: z.number().optional(),
    error: z.string().optional(),
  }).optional(),
});
export type OtaErrorInput = z.infer<typeof otaErrorSchema>;

export const createOtaReleaseSchema = z.object({
  version: z.string().min(1, "Versione obbligatoria").max(50),
  runtimeVersion: z.string().max(50).optional().nullable(),
  bundlePath: z.string().optional().nullable(),
  releaseNotes: z.string().max(5000).optional().nullable(),
  slot: z.enum(["stable", "beta", "canary", "archived"]).optional(),
});
export type CreateOtaReleaseInput = z.infer<typeof createOtaReleaseSchema>;

export const publishOtaReleaseSchema = z.object({
  version: z.string().min(1, "version è obbligatorio"),
  runtimeVersion: z.string().min(1, "runtimeVersion è obbligatorio"),
  bundlePath: z.string().min(1, "bundlePath è obbligatorio"),
  releaseNotes: z.string().max(5000).optional().nullable(),
  slot: z.enum(["stable", "beta", "canary", "archived"]).optional(),
});
export type PublishOtaReleaseInput = z.infer<typeof publishOtaReleaseSchema>;

export const assignOtaSlotSchema = z.object({
  releaseId: z.string().min(1, "releaseId è obbligatorio"),
  slot: z.string().min(1, "slot è obbligatorio"),
});
export type AssignOtaSlotInput = z.infer<typeof assignOtaSlotSchema>;

export const createOtaTokenSchema = z.object({
  label: z.string().min(1, "Label obbligatoria").max(100),
  expiresInDays: z.number().int().min(1).max(3650).optional().nullable(),
});
export type CreateOtaTokenInput = z.infer<typeof createOtaTokenSchema>;

export const otaAssignDeviceSchema = z.object({
  deviceId: z.string().min(1, "deviceId obbligatorio"),
  slot: z.string().min(1, "slot obbligatorio"),
  expiresAt: z.string().optional(),
});
export type OtaAssignDeviceInput = z.infer<typeof otaAssignDeviceSchema>;

export const otaPromoteSchema = z.object({
  fromSlot: z.string().min(1, "fromSlot obbligatorio"),
});
export type OtaPromoteInput = z.infer<typeof otaPromoteSchema>;

export const otaMarkBrokenSchema = z.object({
  releaseId: z.string().min(1, "releaseId obbligatorio"),
});
export type OtaMarkBrokenInput = z.infer<typeof otaMarkBrokenSchema>;

export const coordinateHistorySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  interval: z.union([z.number().int().min(5), z.string()]).optional(),
  maxRecords: z.union([z.number().int().min(1), z.string()]).optional(),
  mode: z.enum(["all", "selected"]).optional(),
  selectedUsers: z.array(z.string()).optional(),
}).passthrough();
export type CoordinateHistorySettingsInput = z.infer<typeof coordinateHistorySettingsSchema>;

export const telemetryTargetKmSchema = z.object({
  target_km: z.union([z.number().int().min(10).max(100000), z.string()]),
});
export type TelemetryTargetKmInput = z.infer<typeof telemetryTargetKmSchema>;

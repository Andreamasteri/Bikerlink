import { z } from "zod";

export const createFeedbackSchema = z.object({
  ticketType: z.enum(["bug", "suggestion", "feedback", "other"]).optional().default("feedback"),
  subject: z.string().min(1, "Oggetto obbligatorio").max(200, "L'oggetto non può superare 200 caratteri"),
  message: z.string().min(1, "Messaggio obbligatorio").max(4000, "Il messaggio non può superare 4000 caratteri"),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const createInviteCodeSchema = z.object({
  code: z.string().max(50).optional(),
  label: z.string().max(200).optional().nullable(),
  giftMessage: z.string().max(500).optional().nullable(),
  maxUses: z.number().int().min(1).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
});
export type CreateInviteCodeInput = z.infer<typeof createInviteCodeSchema>;

export const upsertSettingSchema = z.object({
  key: z.string().min(1, "Chiave obbligatoria").max(100),
  value: z.string(),
});
export type UpsertSettingInput = z.infer<typeof upsertSettingSchema>;

export const generateInvitationSchema = z.object({
  maxUses: z.number().int().min(1).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
});
export type GenerateInvitationInput = z.infer<typeof generateInvitationSchema>;

export const arcadeScoreSchema = z.object({
  game: z.string().min(1, "Gioco obbligatorio"),
  score: z.number().int().min(0, "Punteggio non valido"),
});
export type ArcadeScoreInput = z.infer<typeof arcadeScoreSchema>;

export const crashLogsSchema = z.object({
  logs: z.array(z.unknown()).min(1, "logs deve essere un array non vuoto").max(50, "Massimo 50 log per batch"),
});
export type CrashLogsInput = z.infer<typeof crashLogsSchema>;

export const emailConfigSchema = z.object({
  gmailUser: z.string().optional().nullable(),
  gmailAppPassword: z.string().optional().nullable(),
  adminPassword: z.string().min(1, "Password admin richiesta"),
});
export type EmailConfigInput = z.infer<typeof emailConfigSchema>;

export const disableFeatureSchema = z.object({
  key: z.string().min(1, "Chiave obbligatoria"),
});
export type DisableFeatureInput = z.infer<typeof disableFeatureSchema>;

export const toggleProtectedSchema = z.object({
  key: z.string().min(1, "Chiave obbligatoria"),
  value: z.string(),
  adminPassword: z.string().min(1, "Password admin richiesta"),
});
export type ToggleProtectedInput = z.infer<typeof toggleProtectedSchema>;

export const booleanSettingValueSchema = z.object({
  value: z.enum(["true", "false"], { message: "Valore non valido: usare 'true' o 'false'" }),
});
export type BooleanSettingValueInput = z.infer<typeof booleanSettingValueSchema>;

export const stringSettingValueSchema = z.object({
  value: z.string().min(1, "value è obbligatorio"),
});
export type StringSettingValueInput = z.infer<typeof stringSettingValueSchema>;

export const mapsProviderSchema = z.object({
  value: z.enum(["carto_light", "carto_dark", "esri_gray"], { message: "Provider non valido" }),
});
export type MapsProviderInput = z.infer<typeof mapsProviderSchema>;

export const clientErrorSchema = z.object({
  message: z.string().optional(),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
  platform: z.string().optional(),
  appVersion: z.string().optional(),
  isFatal: z.boolean().optional(),
}).passthrough();
export type ClientErrorInput = z.infer<typeof clientErrorSchema>;

export const startupBeaconSchema = z.object({
  step: z.string().min(1, "step is required"),
  ts: z.number().optional(),
  recovered: z.boolean().optional(),
  platform: z.string().optional(),
}).passthrough();
export type StartupBeaconInput = z.infer<typeof startupBeaconSchema>;

export const updateFeedbackTicketSchema = z.object({
  status: z.string().optional(),
  internalNote: z.string().optional(),
});
export type UpdateFeedbackTicketInput = z.infer<typeof updateFeedbackTicketSchema>;

export const musicProviderSchema = z.object({
  value: z.literal("lastfm").transform(() => "lastfm" as const),
}).or(z.object({ value: z.string().min(1) }).transform(({ value }) => {
  if (value !== "lastfm") throw new Error("Provider non valido: usare 'lastfm'");
  return { value: "lastfm" as const };
}));

export const themeDefaultSchema = z.object({
  value: z.enum(["attuale", "asfalto", "velocita", "rotta"], { message: "Tema non valido" }),
});
export type ThemeDefaultInput = z.infer<typeof themeDefaultSchema>;

export const matchingCountriesSchema = z.object({
  value: z.string(),
});
export type MatchingCountriesInput = z.infer<typeof matchingCountriesSchema>;

export const coordinatesMaxAgeSchema = z.object({
  value: z.union([z.string(), z.number()]),
});
export type CoordinatesMaxAgeInput = z.infer<typeof coordinatesMaxAgeSchema>;

export const genericSettingSchema = z.object({
  value: z.string().optional(),
  valueJson: z.unknown().optional(),
}).passthrough();
export type GenericSettingInput = z.infer<typeof genericSettingSchema>;

export const emailTestSchema = z.object({
  to: z.string().optional(),
});
export type EmailTestInput = z.infer<typeof emailTestSchema>;

export const emailRateLimitResetSchema = z.object({
  scope: z.enum(["verify", "resend", "user-lockouts", "all"], { message: "Scope non valido. Usa: verify | resend | user-lockouts | all" }),
  ip: z.string().optional(),
  userId: z.string().optional(),
});
export type EmailRateLimitResetInput = z.infer<typeof emailRateLimitResetSchema>;

export const updateInvitationCodeAdminSchema = z.object({
  label: z.string().optional(),
  giftMessage: z.string().optional(),
  maxUses: z.union([z.number().int().min(1), z.string()]).optional(),
  isActive: z.union([z.boolean(), z.string()]).optional(),
  expiresAt: z.string().optional(),
}).passthrough();
export type UpdateInvitationCodeAdminInput = z.infer<typeof updateInvitationCodeAdminSchema>;

export const enabledSchema = z.object({
  enabled: z.boolean({ message: "enabled deve essere un booleano" }),
});
export type EnabledInput = z.infer<typeof enabledSchema>;

export const backupFrequencySchema = z.object({
  dbHours: z.union([z.number().min(1), z.string()]).optional(),
  mediaHours: z.union([z.number().min(1), z.string()]).optional(),
}).passthrough();
export type BackupFrequencyInput = z.infer<typeof backupFrequencySchema>;

export const translationKeySchema = z.object({
  key: z.string().min(1, "key mancante"),
  lang: z.string().min(1, "lang non valido"),
  value: z.string().min(1, "value mancante o vuoto"),
});
export type TranslationKeyInput = z.infer<typeof translationKeySchema>;

export const bgLocationSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  trigger: z.enum(["always", "tracking", "sos", "tracking_or_sos"]).optional(),
  intervalSeconds: z.union([z.number().int().min(10).max(300), z.string()]).optional(),
  notificationText: z.string().optional(),
  ghostModeContinue: z.boolean().optional(),
}).passthrough();
export type BgLocationSettingsInput = z.infer<typeof bgLocationSettingsSchema>;

export const privacyRulesSchema = z.object({
  showDistanceInCounter: z.boolean().optional(),
  offlinePositionRandomize: z.boolean().optional(),
  mapVisibilityFilter: z.enum(["all", "online_only", "available_only"]).optional(),
}).passthrough();
export type PrivacyRulesInput = z.infer<typeof privacyRulesSchema>;

const nativeVersionPlatformSchema = z.object({
  latestVersion: z.string().min(1),
  minVersion: z.string().min(1),
  storeUrl: z.string().min(1),
});
export const nativeVersionSchema = z.object({
  android: nativeVersionPlatformSchema,
  ios: nativeVersionPlatformSchema,
});
export type NativeVersionInput = z.infer<typeof nativeVersionSchema>;

export const urlSettingSchema = z.object({
  url: z.string().optional(),
}).passthrough();
export type UrlSettingInput = z.infer<typeof urlSettingSchema>;

export const maintenanceSettingsSchema = z.object({
  enabled: z.union([z.boolean(), z.string()]).optional(),
  message: z.string().optional(),
}).passthrough();
export type MaintenanceSettingsInput = z.infer<typeof maintenanceSettingsSchema>;

export const publishWithSlotSchema = z.object({
  assignSlot: z.string().optional(),
});
export type PublishWithSlotInput = z.infer<typeof publishWithSlotSchema>;

export const gpsErrorSchema = z.object({
  errorMessage: z.string().min(1, "errorMessage è obbligatorio").max(2000),
  stackTrace: z.string().max(5000).nullable().optional(),
  otaNumber: z.number().optional(),
  timestamp: z.string().max(40).optional(),
  platform: z.string().max(20).optional(),
  deviceName: z.string().max(100).nullable().optional(),
  osVersion: z.string().max(40).nullable().optional(),
  context: z.string().max(100).optional(),
  routeId: z.string().max(36).nullable().optional(),
  speedKmh: z.number().nullable().optional(),
});
export type GpsErrorInput = z.infer<typeof gpsErrorSchema>;

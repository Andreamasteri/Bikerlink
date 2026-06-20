import { z } from "zod";

export const updateUserSchema = z.object({
  nickname: z.string().min(3, "Il nickname deve avere almeno 3 caratteri").max(50).optional(),
  phone: z.string().max(30).nullable().optional(),
  sex: z.enum(["M", "F"]).nullable().optional(),
  coupleSexConfig: z.enum(["M+M", "M+F", "F+F"]).nullable().optional(),
  birthYear: z.number().int().min(1930).max(2010).nullable().optional(),
  region: z.string().max(100).nullable().optional(),
  country: z.string().max(2).nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  floatingWidgetEnabled: z.boolean().optional(),
  bio: z.string().max(1000).nullable().optional(),
  maxPickupDistance: z.number().int().min(1).max(500).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  unitsPreference: z.object({
    timeFormat: z.enum(["12h", "24h"]),
    speedUnit: z.enum(["kmh", "mph", "knots"]),
    distanceUnit: z.enum(["km_m", "mi_ft", "mi_yd", "nmi_ftm"]),
  }).nullable().optional(),
  mapFilters: z.object({
    biker: z.boolean().optional(),
    zavorrina: z.boolean().optional(),
    clubs: z.boolean().optional(),
    events: z.boolean().optional(),
  }).nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateDynamicProfileSchema = z.object({
  isAvailable: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  searchPreference: z.string().max(20).optional(),
  preferredMapStyle: z.enum(["carto_light", "carto_dark", "esri_gray"]).nullable().optional(),
  emailChatNotifications: z.boolean().optional(),
  pushNotificationsEnabled: z.boolean().optional(),
  notificationPreferences: z.object({
    matches: z.boolean().optional(),
    zoneProposals: z.boolean().optional(),
    chat: z.boolean().optional(),
    motoclub: z.boolean().optional(),
    eventi: z.boolean().optional(),
    system_alerts: z.boolean().optional(),
  }).optional(),
});
export type UpdateDynamicProfileInput = z.infer<typeof updateDynamicProfileSchema>;

export const pushTokenSchema = z.object({
  token: z.string().max(256).nullable().optional(),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;

export const pushTokenErrorSchema = z.object({
  cause: z.enum([
    "PERMESSI_NEGATI",
    "PROJECT_ID_MANCANTE",
    "TOKEN_NON_OTTENUTO",
    "TOKEN_VUOTO",
    "ERRORE_REGISTRAZIONE",
  ]),
  detail: z.string().max(500).nullable().optional(),
  platform: z.string().max(16).nullable().optional(),
});
export type PushTokenErrorInput = z.infer<typeof pushTokenErrorSchema>;

export const motorcycleSchema = z.object({
  brand: z.string().min(1, "Marca obbligatoria").max(100),
  model: z.string().min(1, "Modello obbligatorio").max(100),
  year: z.number().int().min(1900).max(2030).nullable().optional(),
  displacement: z.number().int().min(1).max(10000).nullable().optional(),
  motorcycleType: z.string().max(50).optional(),
  ridingStyle: z.string().max(50).optional(),
  isDefault: z.boolean().optional(),
  isForSale: z.boolean().optional(),
  saleDescription: z.string().max(1000).nullable().optional(),
  motoDescription: z.string().max(1000).nullable().optional(),
});
export type MotorcycleInput = z.infer<typeof motorcycleSchema>;

export const createMotorcycleSchema = z.object({
  brand: z.string().min(1, "Marca obbligatoria"),
  model: z.string().min(1, "Modello obbligatorio"),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2).optional().nullable(),
  displacement: z.number().int().min(1).optional().nullable(),
  motorcycleType: z.string().optional().nullable(),
  ridingStyle: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  isForSale: z.boolean().optional(),
  saleDescription: z.string().max(2000).optional().nullable(),
  isDefault: z.boolean().optional(),
  motoDescription: z.string().max(2000).optional().nullable(),
});
export type CreateMotorcycleInput = z.infer<typeof createMotorcycleSchema>;

export const updateMotorcycleSchema = createMotorcycleSchema.partial();
export type UpdateMotorcycleInput = z.infer<typeof updateMotorcycleSchema>;

export const uploadPhotoSchema = z.object({
  imageBase64: z.string().min(1, "Immagine obbligatoria"),
  filename: z.string().optional(),
});
export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;

export const updateUserMeSchema = z.object({
  nickname: z.string().min(1).max(50).optional(),
  phone: z.string().optional().nullable(),
  sex: z.string().optional().nullable(),
  coupleSexConfig: z.string().optional().nullable(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  floatingWidgetEnabled: z.boolean().optional(),
  bio: z.string().max(2000).optional().nullable(),
  maxPickupDistance: z.number().min(0).optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
  unitsPreference: z.object({
    timeFormat: z.enum(["12h", "24h"]),
    speedUnit: z.enum(["kmh", "mph", "knots"]),
    distanceUnit: z.enum(["km_m", "mi_ft", "mi_yd", "nmi_ftm"]),
  }).nullable().optional(),
  mapFilters: z.record(z.string(), z.boolean()).nullable().optional(),
});
export type UpdateUserMeInput = z.infer<typeof updateUserMeSchema>;

export const updateLocationSchema = z.object({
  latitude: z.number().finite("Latitudine non valida"),
  longitude: z.number().finite("Longitudine non valida"),
  isAvailable: z.boolean().optional(),
});
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const updateProfileDynamicSchema = z.object({
  isAvailable: z.boolean().optional(),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  searchPreference: z.string().optional(),
  preferredMapStyle: z.string().optional(),
  emailChatNotifications: z.boolean().optional(),
  notificationPreferences: z.record(z.string(), z.unknown()).optional(),
  pushNotificationsEnabled: z.boolean().optional(),
}).passthrough();
export type UpdateProfileDynamicInput = z.infer<typeof updateProfileDynamicSchema>;

export const ghostModeSchema = z.object({
  enabled: z.boolean({ message: "enabled deve essere un booleano" }),
});
export type GhostModeInput = z.infer<typeof ghostModeSchema>;

export const availabilitySchema = z.object({
  isAvailable: z.boolean({ message: "isAvailable deve essere un booleano" }),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const privacySettingsSchema = z.object({
  hideFromMap: z.boolean().optional(),
  positionFuzz: z.boolean().optional(),
  positionFuzzKm: z.number().int().min(1).max(50).optional(),
  fakeHomeEnabled: z.boolean().optional(),
  homeLatitude: z.number().finite().nullable().optional(),
  homeLongitude: z.number().finite().nullable().optional(),
  fakeHomeLatitude: z.number().finite().nullable().optional(),
  fakeHomeLongitude: z.number().finite().nullable().optional(),
  fakeHomeRadius: z.number().positive().nullable().optional(),
  gpsPrecision: z.string().optional(),
  offlinePositionRandomize: z.boolean().optional(),
  fakeWorkEnabled: z.boolean().optional(),
  workLatitude: z.number().finite().nullable().optional(),
  workLongitude: z.number().finite().nullable().optional(),
  fakeWorkLatitude: z.number().finite().nullable().optional(),
  fakeWorkLongitude: z.number().finite().nullable().optional(),
  fakeWorkRadius: z.number().positive().nullable().optional(),
  fakeWhateverEnabled: z.boolean().optional(),
  whateverLatitude: z.number().finite().nullable().optional(),
  whateverLongitude: z.number().finite().nullable().optional(),
  fakeWhateverLatitude: z.number().finite().nullable().optional(),
  fakeWhateverLongitude: z.number().finite().nullable().optional(),
  fakeWhateverRadius: z.number().positive().nullable().optional(),
  fixedPositionEnabled: z.boolean().optional(),
  fixedPositionLat: z.number().finite().nullable().optional(),
  fixedPositionLng: z.number().finite().nullable().optional(),
}).passthrough();
export type PrivacySettingsInput = z.infer<typeof privacySettingsSchema>;

// Task #2530 — categorie/contesti accettati dal backend (vedi shared/db/social.ts
// REPORT_CATEGORIES / REPORT_CONTEXTS). Tenuti come literal qui per evitare
// dipendenze circolari validators → db.
const REPORT_CATEGORY_VALUES = [
  "aggressive",
  "harassment",
  "fake_profile",
  "no_show",
  "opportunist",
  "group_misconduct",
  "dangerous_riding",
  "other",
] as const;
const REPORT_CONTEXT_VALUES = [
  "match",
  "chat",
  "profile",
  "post_meetup",
  "other",
] as const;

export const userReportSchema = z.object({
  reason: z.string().min(1, "Motivo obbligatorio").max(100),
  description: z.string().max(2000).optional(),
  category: z.enum(REPORT_CATEGORY_VALUES).optional(),
  context: z.enum(REPORT_CONTEXT_VALUES).optional(),
  contextId: z.string().max(64).optional(),
});
export type UserReportInput = z.infer<typeof userReportSchema>;

export const verifyPasswordSchema = z.object({
  password: z.string().min(1, "Password mancante"),
});
export type VerifyPasswordInput = z.infer<typeof verifyPasswordSchema>;

export const userStatusSchema = z.object({
  status: z.enum(["active", "suspended", "blocked"], { message: "Stato non valido" }),
});
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export const userRoleSchema = z.object({
  role: z.enum(["user", "moderator", "admin"], { message: "Ruolo non valido" }),
});
export type UserRoleInput = z.infer<typeof userRoleSchema>;

export const userEmailAdminSchema = z.object({
  email: z.string().email("Email non valida"),
});
export type UserEmailAdminInput = z.infer<typeof userEmailAdminSchema>;

export const adminSetPasswordSchema = z.object({
  password: z.string().min(6, "La password deve avere almeno 6 caratteri"),
});
export type AdminSetPasswordInput = z.infer<typeof adminSetPasswordSchema>;

export const primalSchema = z.object({
  isPrimal: z.boolean().optional(),
});
export type PrimalInput = z.infer<typeof primalSchema>;

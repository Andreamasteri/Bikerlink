import { z } from "zod";

export const easterEggSchema = z.object({
  name: z.string().optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
}).passthrough();
export type EasterEggInput = z.infer<typeof easterEggSchema>;

export const easterEggBatchSchema = z.object({
  count: z.union([z.number(), z.string()]).optional(),
  radius: z.union([z.number(), z.string()]).optional(),
  points: z.union([z.number(), z.string()]).optional(),
});
export type EasterEggBatchInput = z.infer<typeof easterEggBatchSchema>;

export const reportResolveSchema = z.object({
  status: z.enum(["resolved", "dismissed"], { message: "Stato non valido" }),
});
export type ReportResolveInput = z.infer<typeof reportResolveSchema>;

export const stregattaSchema = z.object({
  nickname: z.string().min(1, "Nickname obbligatorio"),
  userType: z.string().min(1, "Tipo utente obbligatorio"),
  sex: z.string().optional(),
  coupleSexConfig: z.string().optional(),
  birthYear: z.union([z.number().int(), z.string()]).optional(),
  region: z.string().optional(),
  country: z.string().default("IT"),
  bio: z.string().optional(),
  moto: z.unknown().optional(),
  wishlistDescription: z.string().optional(),
  wishlistMotos: z.array(z.unknown()).optional(),
}).passthrough();
export type StregattaInput = z.infer<typeof stregattaSchema>;

export const stregattaToggleSchema = z.object({
  enabled: z.boolean({ message: "Il campo 'enabled' deve essere un booleano" }),
  adminPassword: z.string().min(1, "Password admin richiesta"),
});
export type StregattaToggleInput = z.infer<typeof stregattaToggleSchema>;

export const simulateActivitySchema = z.object({
  message: z.string().optional(),
  count: z.number().int().min(1).default(1),
}).passthrough();
export type SimulateActivityInput = z.infer<typeof simulateActivitySchema>;

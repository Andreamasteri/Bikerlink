import { z } from "zod";

export const updateWishlistSchema = z.object({
  description: z.string().max(2000).optional().nullable(),
});
export type UpdateWishlistInput = z.infer<typeof updateWishlistSchema>;

export const addWishlistMotoSchema = z.object({
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  motorcycleType: z.string().optional().nullable(),
  ridingStyle: z.string().optional().nullable(),
}).refine((d) => d.brand || d.model || d.motorcycleType, {
  message: "Specifica marca e modello oppure tipo moto",
});
export type AddWishlistMotoInput = z.infer<typeof addWishlistMotoSchema>;

export const updateWishlistMotoSchema = z.object({
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  motorcycleType: z.string().optional().nullable(),
  ridingStyle: z.string().optional().nullable(),
});
export type UpdateWishlistMotoInput = z.infer<typeof updateWishlistMotoSchema>;

export const matchPreferencesAdminUpdateSchema = z.record(z.string(), z.boolean()).and(z.object({}).passthrough());
export type MatchPreferencesAdminUpdateInput = z.infer<typeof matchPreferencesAdminUpdateSchema>;

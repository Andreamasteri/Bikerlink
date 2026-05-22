import { z } from "zod";

export const createMotoClubSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(100),
  clubType: z.enum(["brand", "region", "generic", "model", "chapter"]).optional(),
  brandName: z.string().max(100).optional().nullable(),
  modelName: z.string().max(100).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
});
export type CreateMotoClubInput = z.infer<typeof createMotoClubSchema>;

export const respondToInviteSchema = z.object({
  response: z.enum(["accepted", "declined"]),
});
export type RespondToInviteInput = z.infer<typeof respondToInviteSchema>;

export const proposeLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  address: z.string().optional(),
});
export type ProposeLocationInput = z.infer<typeof proposeLocationSchema>;

export const rejectNoteSchema = z.object({
  note: z.string().optional(),
}).passthrough();
export type RejectNoteInput = z.infer<typeof rejectNoteSchema>;

export const reconcileClubInvitesSchema = z.object({
  userId: z.string().optional(),
}).passthrough();
export type ReconcileClubInvitesInput = z.infer<typeof reconcileClubInvitesSchema>;

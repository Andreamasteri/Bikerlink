import { z } from "zod";

export const createSosSchema = z.object({
  reason: z.string().min(1, "Motivo richiesto").max(500),
  latitude: z.number().finite("Latitudine non valida"),
  longitude: z.number().finite("Longitudine non valida"),
  radiusKm: z.number().positive().optional(),
});
export type CreateSosInput = z.infer<typeof createSosSchema>;

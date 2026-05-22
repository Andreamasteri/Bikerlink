import { z } from "zod";

export const workshopSchema = z.object({
  name: z.string().min(1, "Nome officina obbligatorio"),
}).passthrough();
export type WorkshopInput = z.infer<typeof workshopSchema>;

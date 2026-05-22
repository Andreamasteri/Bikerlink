import { z } from "zod";

export const createAdCampaignSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(200),
  sponsor: z.string().max(200).optional().nullable(),
  linkUrl: z.string().url("URL non valido").optional().nullable().or(z.literal("")),
  targetUserType: z.enum(["biker", "zavorrina", "coppia", "all"]).optional(),
  rotationDuration: z.number().int().min(1).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});
export type CreateAdCampaignInput = z.infer<typeof createAdCampaignSchema>;

export const adsBulkSchema = z.object({
  baseName: z.string().min(1, "Nome base campagna obbligatorio"),
  targetUserType: z.string().optional(),
  displayDuration: z.string().optional(),
  linkUrl: z.string().optional(),
  groupId: z.string().optional(),
  startIndex: z.string().optional(),
  totalImages: z.string().optional(),
}).passthrough();
export type AdsBulkInput = z.infer<typeof adsBulkSchema>;

export const adsCreateSchema = z.object({
  name: z.string().min(1, "Nome campagna obbligatorio"),
  sponsor: z.string().optional(),
  linkUrl: z.string().optional(),
  description: z.string().optional(),
  targetUserType: z.string().optional(),
  rotationDuration: z.union([z.string(), z.number()]).optional(),
  rotationMode: z.string().optional(),
  sortOrder: z.union([z.string(), z.number()]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  placement: z.string().optional(),
  imageUrl: z.string().optional(),
}).passthrough();
export type AdsCreateInput = z.infer<typeof adsCreateSchema>;

export const adsUpdateSchema = z.object({
  name: z.string().optional(),
  sponsor: z.string().optional(),
  linkUrl: z.string().optional(),
  description: z.string().optional(),
  isActive: z.union([z.boolean(), z.string()]).optional(),
  targetUserType: z.string().optional(),
  rotationDuration: z.union([z.string(), z.number()]).optional(),
  rotationMode: z.string().optional(),
  sortOrder: z.union([z.string(), z.number()]).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  placement: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
}).passthrough();
export type AdsUpdateInput = z.infer<typeof adsUpdateSchema>;

export const adsBulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, "Array di ID campagne obbligatorio"),
});
export type AdsBulkDeleteInput = z.infer<typeof adsBulkDeleteSchema>;

export const adsGroupUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  linkUrl: z.string().optional(),
  isActive: z.boolean().optional(),
}).passthrough();
export type AdsGroupUpdateInput = z.infer<typeof adsGroupUpdateSchema>;

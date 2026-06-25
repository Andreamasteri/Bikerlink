import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const adCampaigns = pgTable("ad_campaigns", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  sponsor: varchar("sponsor", { length: 200 }).notNull().default("Syneco Lubrificanti"),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  displayMode: varchar("display_mode", { length: 30 }).notNull().default("banner"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  impressions: integer("impressions").notNull().default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  targetUserType: varchar("target_user_type", { length: 30 }).notNull().default("biker"),
  rotationDuration: integer("rotation_duration").notNull().default(10),
  rotationMode: varchar("rotation_mode", { length: 20 }).notNull().default("sequential"),
  sortOrder: integer("sort_order").notNull().default(0),
  placement: varchar("placement", { length: 30 }).notNull().default("all"),
  imageVersion: integer("image_version").notNull().default(0),
  groupId: text("group_id"),
  // Task #4942 — "cestino" campagne: quando il warmup non trova l'immagine in
  // Object Storage la campagna viene ghostata (ghosted_at = NOW()) invece di
  // eliminata. Le campagne ghost sono escluse da serving/warmup/conteggi; solo
  // il pannello admin "Segnalate dal sistema" le legge (ghosted_at IS NOT NULL).
  ghostedAt: timestamp("ghosted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adClicks = pgTable("ad_clicks", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id", { length: 36 })
    .notNull()
    .references(() => adCampaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ad_clicks_campaign_id_idx").on(table.campaignId),
  index("ad_clicks_user_id_idx").on(table.userId),
]);

export type AdCampaign = typeof adCampaigns.$inferSelect;
export type InsertAdCampaign = typeof adCampaigns.$inferInsert;
export type AdClick = typeof adClicks.$inferSelect;
export type InsertAdClick = typeof adClicks.$inferInsert;

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

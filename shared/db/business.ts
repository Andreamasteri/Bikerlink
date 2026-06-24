import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

/**
 * Task #4818 — Pilota Business Reach.
 *
 * Entità dedicata "business" (locale | concessionaria) modellata su `workshops`
 * e `ad_campaigns`. Tabella separata con campo `type` per non snaturare le
 * officine. I business approvati E attivi appaiono come marker sulla mappa rider.
 *
 *   isApproved  → moderazione admin (come workshops.isApproved)
 *   isActive    → toggle di visibilità del pilota (on/off individuale + bulk)
 *
 * Solo i business con isApproved && isActive sono visibili al rider.
 */
export const businesses = pgTable("businesses", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // "locale" (ritrovo/bar moto) | "concessionaria" (dealer)
  type: varchar("type", { length: 20 }).notNull().default("locale"),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  phone: varchar("phone", { length: 30 }),
  whatsapp: varchar("whatsapp", { length: 30 }),
  email: varchar("email", { length: 255 }),
  website: text("website"),
  description: text("description"),
  // Promo/evento corrente mostrato nel profilo (azione "evento/promo").
  promoText: text("promo_text"),
  eventUrl: text("event_url"),
  openingHours: jsonb("opening_hours"),
  logoUrl: text("logo_url"),
  // Token di accesso self-service: il titolare del business lo usa per consultare
  // i PROPRI numeri aggregati (reach) senza un account app. Generato/revocato
  // dall'admin. Null = nessun accesso self-service attivo.
  accessToken: varchar("access_token", { length: 64 }),
  isApproved: boolean("is_approved").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("businesses_location_idx").on(table.latitude, table.longitude),
  index("businesses_type_idx").on(table.type),
  uniqueIndex("businesses_access_token_idx").on(table.accessToken),
]);

/**
 * Click su un'azione del profilo business (segnale di conversione).
 * actionType: directions | call | whatsapp | event | website
 * userId è solo per dedup/audit interno; i report espongono SOLO conteggi.
 */
export const businessClicks = pgTable("business_clicks", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  actionType: varchar("action_type", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("business_clicks_business_id_idx").on(table.businessId),
  index("business_clicks_created_at_idx").on(table.createdAt),
]);

/**
 * Cache aggregata dei "passaggi qualificati" per business e mese.
 * Calcolata dal job che scorre ride_telemetry filtrando per raggio + velocità/sosta.
 * SOLO conteggi: nessuna traccia individuale di rider è mai persistita qui.
 */
export const businessPassageStats = pgTable("business_passage_stats", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  // 'YYYY-MM'
  periodMonth: varchar("period_month", { length: 7 }).notNull(),
  qualifiedPassages: integer("qualified_passages").notNull().default(0),
  uniqueRiders: integer("unique_riders").notNull().default(0),
  radiusM: integer("radius_m").notNull().default(0),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("business_passage_stats_business_period_idx").on(table.businessId, table.periodMonth),
]);

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = typeof businesses.$inferInsert;
export type BusinessClick = typeof businessClicks.$inferSelect;
export type InsertBusinessClick = typeof businessClicks.$inferInsert;
export type BusinessPassageStat = typeof businessPassageStats.$inferSelect;
export type InsertBusinessPassageStat = typeof businessPassageStats.$inferInsert;

export const BUSINESS_TYPES = ["locale", "concessionaria"] as const;
export const BUSINESS_CLICK_ACTIONS = ["directions", "call", "whatsapp", "event", "website"] as const;

export const businessSchema = z.object({
  name: z.string().min(1, "Nome business obbligatorio").max(200),
  type: z.enum(BUSINESS_TYPES).optional(),
  address: z.string().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  promoText: z.string().optional().nullable(),
  eventUrl: z.string().optional().nullable(),
  isApproved: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).passthrough();
export type BusinessInput = z.infer<typeof businessSchema>;

export const businessUpdateSchema = businessSchema.partial();
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;

export const businessClickSchema = z.object({
  actionType: z.enum(BUSINESS_CLICK_ACTIONS),
});
export type BusinessClickInput = z.infer<typeof businessClickSchema>;

import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const workshops = pgTable("workshops", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  phone: varchar("phone", { length: 30 }),
  whatsapp: varchar("whatsapp", { length: 30 }),
  email: varchar("email", { length: 255 }),
  website: text("website"),
  description: text("description"),
  openingHours: jsonb("opening_hours"),
  logoUrl: text("logo_url"),
  qrCode: text("qr_code"),
  isSynecoPartner: boolean("is_syneco_partner").notNull().default(false),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("workshops_location_idx").on(table.latitude, table.longitude),
  // Task #13 — email officina unica case-insensitive, opzionale (NULL/''
  // esclusi dal vincolo). Vedi migrations/0142_*.sql e storage/social.ts
  // (normalizzazione trim+lower in createWorkshop/updateWorkshop).
  uniqueIndex("workshops_email_lower_uq")
    .on(sql`LOWER(${table.email})`)
    .where(sql`${table.email} IS NOT NULL AND ${table.email} <> ''`),
]);

export const workshopContacts = pgTable("workshop_contacts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workshopId: varchar("workshop_id", { length: 36 })
    .notNull()
    .references(() => workshops.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactType: varchar("contact_type", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("workshop_contacts_workshop_id_idx").on(table.workshopId),
]);

export type Workshop = typeof workshops.$inferSelect;
export type InsertWorkshop = typeof workshops.$inferInsert;
export type WorkshopContact = typeof workshopContacts.$inferSelect;
export type InsertWorkshopContact = typeof workshopContacts.$inferInsert;

export const workshopSchema = z.object({
  name: z.string().min(1, "Nome officina obbligatorio"),
}).passthrough();
export type WorkshopInput = z.infer<typeof workshopSchema>;

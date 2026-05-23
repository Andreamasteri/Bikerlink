import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

// ── Road hazard types ─────────────────────────────────────────────────────────
// Temporanee (expire after 4h): oil, gravel, animals, roadwork, wet, accident, fog
// Ricorrenti (no expiry, needs ≥3 confirms or admin approval): slowdown (patrol hint)

export const HAZARD_TYPES = [
  "oil",        // 🛢️ Olio/carburante
  "gravel",     // 🪨 Ghiaia/detriti
  "animals",    // 🦌 Animali in carreggiata
  "roadwork",   // 🚧 Lavori/restringimento
  "wet",        // 💧 Fondo bagnato
  "accident",   // 🚨 Incidente
  "fog",        // 🌫️ Nebbia
  "slowdown",   // 🚧🚧 Rallentamenti (ricorrente)
] as const;

export type HazardType = typeof HAZARD_TYPES[number];

export const TEMPORARY_TYPES: HazardType[] = ["oil", "gravel", "animals", "roadwork", "wet", "accident", "fog"];
export const RECURRING_TYPES: HazardType[] = ["slowdown"];

export const HAZARD_LABELS: Record<HazardType, string> = {
  oil: "Olio/Carburante",
  gravel: "Ghiaia/Detriti",
  animals: "Animali in carreggiata",
  roadwork: "Lavori/Restringimento",
  wet: "Fondo bagnato",
  accident: "Incidente",
  fog: "Nebbia fitta",
  slowdown: "Rallentamenti",
};

export const HAZARD_ICONS: Record<HazardType, string> = {
  oil: "🛢️",
  gravel: "🪨",
  animals: "🦌",
  roadwork: "🚧",
  wet: "💧",
  accident: "🚨",
  fog: "🌫️",
  slowdown: "🚧🚧",
};

// ── Tables ────────────────────────────────────────────────────────────────────

export const roadHazards = pgTable("road_hazards", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  description: varchar("description", { length: 140 }),
  confirmCount: integer("confirm_count").notNull().default(0),
  isApproved: boolean("is_approved").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("road_hazards_lat_lng_idx").on(table.lat, table.lng),
  index("road_hazards_expires_at_idx").on(table.expiresAt),
  index("road_hazards_user_id_idx").on(table.userId),
]);

export const roadHazardConfirms = pgTable("road_hazard_confirms", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  hazardId: varchar("hazard_id", { length: 36 })
    .notNull()
    .references(() => roadHazards.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("road_hazard_confirms_hazard_idx").on(table.hazardId),
  index("road_hazard_confirms_unique_idx").on(table.hazardId, table.userId),
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoadHazard = typeof roadHazards.$inferSelect;
export type InsertRoadHazard = typeof roadHazards.$inferInsert;
export type RoadHazardConfirm = typeof roadHazardConfirms.$inferSelect;

// ── Migration SQL ─────────────────────────────────────────────────────────────

export const ROAD_HAZARDS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS road_hazards (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  description VARCHAR(140),
  confirm_count INTEGER NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS road_hazard_confirms (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_id VARCHAR(36) NOT NULL REFERENCES road_hazards(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS road_hazards_lat_lng_idx ON road_hazards(lat, lng);
CREATE INDEX IF NOT EXISTS road_hazards_expires_at_idx ON road_hazards(expires_at);
CREATE INDEX IF NOT EXISTS road_hazards_user_id_idx ON road_hazards(user_id);
CREATE INDEX IF NOT EXISTS road_hazard_confirms_hazard_idx ON road_hazard_confirms(hazard_id);
CREATE UNIQUE INDEX IF NOT EXISTS road_hazard_confirms_unique_idx ON road_hazard_confirms(hazard_id, user_id);
`;

// ── Validation schemas ────────────────────────────────────────────────────────

export const createHazardSchema = z.object({
  type: z.enum(HAZARD_TYPES as unknown as [HazardType, ...HazardType[]]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  description: z.string().max(140).optional(),
});

export type CreateHazardInput = z.infer<typeof createHazardSchema>;

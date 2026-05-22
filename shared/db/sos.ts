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

export const sosRequests = pgTable("sos_requests", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  helperId: varchar("helper_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radiusKm: integer("radius_km").notNull().default(10),
  conversationId: varchar("conversation_id", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("sos_requests_requester_idx").on(table.requesterId),
  index("sos_requests_status_idx").on(table.status),
]);

export type SosRequest = typeof sosRequests.$inferSelect;
export type InsertSosRequest = typeof sosRequests.$inferInsert;

export const createSosSchema = z.object({
  reason: z.string().min(1, "Motivo richiesto").max(500),
  latitude: z.number().finite("Latitudine non valida"),
  longitude: z.number().finite("Longitudine non valida"),
  radiusKm: z.number().positive().optional(),
});
export type CreateSosInput = z.infer<typeof createSosSchema>;

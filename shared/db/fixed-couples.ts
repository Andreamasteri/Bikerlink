import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const fixedCouples = pgTable("fixed_couples", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  bikerId: varchar("biker_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  zavorrinaId: varchar("zavorrina_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  requestedBy: varchar("requested_by", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("fixed_couples_biker_idx").on(table.bikerId),
  index("fixed_couples_zavorrina_idx").on(table.zavorrinaId),
]);

export type FixedCouple = typeof fixedCouples.$inferSelect;
export type InsertFixedCouple = typeof fixedCouples.$inferInsert;
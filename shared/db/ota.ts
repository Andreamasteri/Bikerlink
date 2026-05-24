import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const otaReleases = pgTable("ota_releases", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  easUpdateId: varchar("eas_update_id", { length: 200 }).notNull().unique(),
  channel: varchar("channel", { length: 50 }).notNull().default("staging"),
  runtimeVersion: varchar("runtime_version", { length: 50 }),
  message: text("message"),
  otaVersion: varchar("ota_version", { length: 50 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: varchar("rejected_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OtaRelease = typeof otaReleases.$inferSelect;
export type InsertOtaRelease = typeof otaReleases.$inferInsert;

import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  uniqueIndex,
  date,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod";

export const matchRules = pgTable("match_rules", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  searchTypeA: varchar("search_type_a", { length: 60 }).notNull(),
  searchTypeB: varchar("search_type_b", { length: 60 }).notNull(),
  compatible: boolean("compatible").notNull().default(true),
  weight: doublePrecision("weight").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("match_rules_pair_unique_idx").on(table.searchTypeA, table.searchTypeB),
]);

export type MatchRuleRow = typeof matchRules.$inferSelect;
export type InsertMatchRule = typeof matchRules.$inferInsert;

export const matchThresholds = pgTable("match_thresholds", {
  category: varchar("category", { length: 40 }).primaryKey(),
  jaccardThreshold: doublePrecision("jaccard_threshold").notNull().default(0.3),
  minCommonTags: integer("min_common_tags").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MatchThreshold = typeof matchThresholds.$inferSelect;
export type InsertMatchThreshold = typeof matchThresholds.$inferInsert;

export const updateMatchRuleSchema = z.object({
  compatible: z.boolean().optional(),
  weight: z.number().finite().min(0).max(100).optional(),
  notes: z.string().max(500).optional().nullable(),
}).refine((d) => d.compatible !== undefined || d.weight !== undefined || d.notes !== undefined, {
  message: "Nessun campo da aggiornare",
});
export type UpdateMatchRuleInput = z.infer<typeof updateMatchRuleSchema>;

export const insertMatchRuleSchema = z.object({
  searchTypeA: z.string().min(1).max(60),
  searchTypeB: z.string().min(1).max(60),
  compatible: z.boolean().default(true),
  weight: z.number().finite().min(0).max(100).default(1),
  notes: z.string().max(500).optional().nullable(),
});
export type InsertMatchRuleInput = z.infer<typeof insertMatchRuleSchema>;

export const matchZeroSnapshots = pgTable("match_zero_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: date("snapshot_date").notNull(),
  totalUsers: integer("total_users").notNull().default(0),
  zeroMatchCount: integer("zero_match_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("match_zero_snapshots_date_idx").on(t.snapshotDate),
  index("match_zero_snapshots_created_idx").on(t.createdAt),
]);

export type MatchZeroSnapshot = typeof matchZeroSnapshots.$inferSelect;

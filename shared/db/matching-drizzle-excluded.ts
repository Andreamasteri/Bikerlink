// =============================================================================
// TABELLE MATCHING — GESTIONE MANUALE (NON DRIZZLE-KIT)
// =============================================================================
//
// Questo file contiene 3 tabelle del dominio matching che NON vengono gestite
// da `drizzle-kit generate`:
//
//   • biker_biker_matches
//   • match_negative_preferences
//   • pending_auto_suggestions
//
// PERCHÉ SONO ESCLUSE DA DRIZZLE-KIT:
//   1. FK con nomi auto-generati che superano i 63 caratteri → PostgreSQL li
//      tronca silenziosamente. Drizzle-kit non conosce i nomi troncati e
//      genererebbe DROP + CREATE di FK ad ogni `generate`, anche senza cambi.
//   2. Indici su espressioni LEAST/GREATEST (es. symmetric index biker-biker)
//      e cast `::text` che drizzle-kit non sa confrontare con lo schema live →
//      stessa trappola DROP + CREATE spuria.
//
//   Le tre tabelle sono escluse esplicitamente in drizzle.config.ts
//   (`tablesFilter: ["!biker_biker_matches", ...]`), quindi `drizzle-kit
//   generate` non le toccherà mai.
//
// COME AGGIORNARE LO SCHEMA DI QUESTE TABELLE:
//   1. Scrivere una numbered SQL migration in migrations/ (es. 0100_xxx.sql).
//   2. Eseguire la migration via server/migrate.ts (il deploy la applica
//      automaticamente all'avvio).
//   3. Aggiornare la definizione TypeScript qui sotto (per i tipi e le query
//      ORM), ma NON creare migration drizzle-kit — resterebbero ignorate.
//
// IMPORT: non importare direttamente da questo file. Usare sempre
//   `@shared/db` (shared/db/index.ts), che ri-esporta sia matching.ts sia
//   questo file come unico punto di accesso a tutte le tabelle matching.
// =============================================================================

import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const bikerBikerMatches = pgTable("biker_biker_matches", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  biker1Id: varchar("biker1_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  biker2Id: varchar("biker2_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  motorcycleBrand: varchar("motorcycle_brand", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  isSupermatch: boolean("is_supermatch").notNull().default(false),
  pairType: varchar("pair_type", { length: 10 }).notNull().default("bb"),
  scoreBreakdown: jsonb("score_breakdown").notNull().default(sql`'{}'::jsonb`),
  notificationPriority: varchar("notification_priority", { length: 10 }).notNull().default("normal"),
  notifiedAt: timestamp("notified_at"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("biker_biker_biker1_idx").on(table.biker1Id),
  index("biker_biker_biker2_idx").on(table.biker2Id),
  index("biker_biker_notif_pending_idx").on(table.notificationPriority, table.notifiedAt),
  index("bb_matches_archived_at_idx").on(table.archivedAt),
  uniqueIndex("biker_biker_symmetric_idx").on(
    sql`LEAST(${table.biker1Id}, ${table.biker2Id})`,
    sql`GREATEST(${table.biker1Id}, ${table.biker2Id})`,
    table.motorcycleBrand,
  ),
]);

export const matchNegativePreferences = pgTable("match_negative_preferences", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  value: jsonb("value").notNull(),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("match_neg_prefs_user_idx").on(table.userId),
  uniqueIndex("match_neg_prefs_unique_idx").on(table.userId, table.kind, sql`(value::text)`),
]);

export const pendingAutoSuggestions = pgTable("pending_auto_suggestions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  value: jsonb("value").notNull(),
  rejectCount: integer("reject_count").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("pending_auto_suggestions_user_idx").on(table.userId, table.status),
  uniqueIndex("pending_auto_suggestions_unique_idx").on(table.userId, table.kind, sql`(value::text)`),
]);

export type BikerBikerMatch = typeof bikerBikerMatches.$inferSelect;
export type InsertBikerBikerMatch = typeof bikerBikerMatches.$inferInsert;
export type MatchNegativePreference = typeof matchNegativePreferences.$inferSelect;
export type InsertMatchNegativePreference = typeof matchNegativePreferences.$inferInsert;
export type PendingAutoSuggestion = typeof pendingAutoSuggestions.$inferSelect;
export type InsertPendingAutoSuggestion = typeof pendingAutoSuggestions.$inferInsert;

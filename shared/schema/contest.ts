import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const photoContestEntries = pgTable("photo_contest_entries", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url"),
  caption: text("caption"),
  performanceData: text("performance_data"),
  weekNumber: integer("week_number").notNull(),
  year: integer("year").notNull(),
  votesCount: integer("votes_count").notNull().default(0),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("photo_contest_entries_user_id_idx").on(table.userId),
  index("photo_contest_entries_week_idx").on(table.weekNumber, table.year),
]);

export const photoVotes = pgTable("photo_votes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  entryId: varchar("entry_id", { length: 36 })
    .notNull()
    .references(() => photoContestEntries.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("photo_votes_unique_idx").on(table.entryId, table.userId),
]);

export const dailyVoteCounts = pgTable("daily_vote_counts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  voteDate: varchar("vote_date", { length: 10 }).notNull(),
  count: integer("count").notNull().default(0),
}, (table) => [
  uniqueIndex("daily_vote_counts_unique_idx").on(table.userId, table.voteDate),
]);

export const photoWinners = pgTable("photo_winners", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  entryId: varchar("entry_id", { length: 36 })
    .notNull()
    .references(() => photoContestEntries.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  year: integer("year").notNull(),
  totalVotes: integer("total_votes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PhotoContestEntry = typeof photoContestEntries.$inferSelect;
export type InsertPhotoContestEntry = typeof photoContestEntries.$inferInsert;
export type PhotoVote = typeof photoVotes.$inferSelect;
export type InsertPhotoVote = typeof photoVotes.$inferInsert;
export type DailyVoteCount = typeof dailyVoteCounts.$inferSelect;
export type InsertDailyVoteCount = typeof dailyVoteCounts.$inferInsert;
export type PhotoWinner = typeof photoWinners.$inferSelect;
export type InsertPhotoWinner = typeof photoWinners.$inferInsert;

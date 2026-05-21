import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  photoContestEntries, photoVotes, dailyVoteCounts, photoWinners,
  type PhotoContestEntry, type InsertPhotoContestEntry,
  type PhotoVote, type InsertPhotoVote,
  type DailyVoteCount,
  type PhotoWinner, type InsertPhotoWinner,
} from "@shared/schema";
import { MapStorage } from "./map";

export class ContestStorage extends MapStorage {
  async getPhotoContestEntries(weekNumber: number, year: number): Promise<PhotoContestEntry[]> {
    return db.select().from(photoContestEntries).where(and(eq(photoContestEntries.weekNumber, weekNumber), eq(photoContestEntries.year, year))).orderBy(desc(photoContestEntries.votesCount));
  }

  async createPhotoContestEntry(data: InsertPhotoContestEntry): Promise<PhotoContestEntry> {
    const [entry] = await db.insert(photoContestEntries).values(data).returning();
    return entry;
  }

  async deletePhotoContestEntry(id: string): Promise<void> {
    await db.delete(photoContestEntries).where(eq(photoContestEntries.id, id));
  }

  async createPhotoVote(data: InsertPhotoVote): Promise<PhotoVote> {
    const [vote] = await db.insert(photoVotes).values(data).returning();
    return vote;
  }

  async getPhotoVote(entryId: string, userId: string): Promise<PhotoVote | undefined> {
    const [vote] = await db.select().from(photoVotes).where(and(eq(photoVotes.entryId, entryId), eq(photoVotes.userId, userId))).limit(1);
    return vote;
  }

  async getDailyVoteCount(userId: string, voteDate: string): Promise<DailyVoteCount | undefined> {
    const [row] = await db.select().from(dailyVoteCounts).where(and(eq(dailyVoteCounts.userId, userId), eq(dailyVoteCounts.voteDate, voteDate))).limit(1);
    return row;
  }

  async upsertDailyVoteCount(userId: string, voteDate: string): Promise<void> {
    await db.insert(dailyVoteCounts).values({ userId, voteDate, count: 1 }).onConflictDoUpdate({
      target: [dailyVoteCounts.userId, dailyVoteCounts.voteDate],
      set: { count: sql`${dailyVoteCounts.count} + 1` },
    });
  }

  async incrementEntryVotes(entryId: string): Promise<void> {
    await db.update(photoContestEntries).set({ votesCount: sql`${photoContestEntries.votesCount} + 1` }).where(eq(photoContestEntries.id, entryId));
  }

  async getPhotoWinners(): Promise<PhotoWinner[]> {
    return db.select().from(photoWinners).orderBy(desc(photoWinners.year), desc(photoWinners.weekNumber));
  }

  async createPhotoWinner(data: InsertPhotoWinner): Promise<PhotoWinner> {
    const [winner] = await db.insert(photoWinners).values(data).returning();
    return winner;
  }

  async getUnapprovedContestEntries(): Promise<PhotoContestEntry[]> {
    return db.select().from(photoContestEntries).where(eq(photoContestEntries.isApproved, false)).orderBy(desc(photoContestEntries.createdAt));
  }

  async updateContestEntryApproval(id: string, approved: boolean): Promise<PhotoContestEntry | undefined> {
    const [entry] = await db.update(photoContestEntries).set({ isApproved: approved }).where(eq(photoContestEntries.id, id)).returning();
    return entry;
  }

  async getPhotoContestEntry(id: string): Promise<PhotoContestEntry | undefined> {
    const [entry] = await db.select().from(photoContestEntries).where(eq(photoContestEntries.id, id)).limit(1);
    return entry;
  }
}

import { db } from "../db";
import { motoClubs, conversations, motoClubMembers, conversationParticipants, type User } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { SpecMeta } from "./seed-users";

export async function seedClubMemberships(
  insertedUsers: User[],
  specMeta: SpecMeta[],
  logError: (context: string, err: unknown) => void
): Promise<void> {
  if (insertedUsers.length === 0) return;

  try {
    const approvedClubs = await db
      .select({ id: motoClubs.id, conversationId: motoClubs.conversationId, clubType: motoClubs.clubType, region: motoClubs.region })
      .from(motoClubs)
      .innerJoin(conversations, eq(motoClubs.conversationId, conversations.id))
      .where(and(eq(motoClubs.isApproved, true), eq(motoClubs.clubType, "brand")));

    const approvedRegionalClubs = await db
      .select({ id: motoClubs.id, conversationId: motoClubs.conversationId, region: motoClubs.region })
      .from(motoClubs)
      .innerJoin(conversations, eq(motoClubs.conversationId, conversations.id))
      .where(and(eq(motoClubs.isApproved, true), eq(motoClubs.clubType, "region")));

    const regionalClubByRegion = new Map(approvedRegionalClubs.map(c => [c.region, c]));

    const clubMemberRows: { clubId: string; userId: string; role: string; status: string }[] = [];
    const convParticipantRows: { conversationId: string; userId: string }[] = [];

    for (const newUser of insertedUsers) {
      const meta = specMeta.find(m => m.nickname === newUser.nickname);
      const spec = meta?.spec;

      if (approvedClubs.length > 0) {
        const count = 1 + Math.floor(Math.random() * 2);
        const shuffled = [...approvedClubs].sort(() => Math.random() - 0.5).slice(0, count);
        for (const club of shuffled) {
          clubMemberRows.push({ clubId: club.id, userId: newUser.id, role: "member", status: "active" });
          if (club.conversationId) {
            convParticipantRows.push({ conversationId: club.conversationId, userId: newUser.id });
          }
        }
      }

      if (spec?.region && spec.country === "IT") {
        const regionalClub = regionalClubByRegion.get(spec.region);
        if (regionalClub) {
          clubMemberRows.push({ clubId: regionalClub.id, userId: newUser.id, role: "member", status: "active" });
          if (regionalClub.conversationId) {
            convParticipantRows.push({ conversationId: regionalClub.conversationId, userId: newUser.id });
          }
        }
      }
    }

    if (clubMemberRows.length > 0) {
      try {
        await db.insert(motoClubMembers).values(clubMemberRows).onConflictDoNothing();
      } catch (err: unknown) {
        logError("batch-club-member-insert", err);
      }
    }
    if (convParticipantRows.length > 0) {
      try {
        await db.insert(conversationParticipants).values(convParticipantRows).onConflictDoNothing();
      } catch (err: unknown) {
        logError("batch-conv-participant-insert", err);
      }
    }
  } catch (err: unknown) {
    logError("batch-club-query", err);
  }
}

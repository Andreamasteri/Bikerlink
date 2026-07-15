import { eq, and, isNull, isNotNull, lt } from "drizzle-orm";
import { db } from "../db";
import {
  proposalProfileMatches,
} from "@shared/db";
import { FRESHNESS_DEFAULTS } from "../matching/scoring";

export async function archiveStaleProposalProfileMatches(afterDays: number = FRESHNESS_DEFAULTS.archiveAfterDays): Promise<number> {
  const cutoff = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
  const result = await db.update(proposalProfileMatches)
    .set({ archivedAt: new Date() })
    .where(and(
      eq(proposalProfileMatches.status, "new"),
      isNull(proposalProfileMatches.archivedAt),
      lt(proposalProfileMatches.createdAt, cutoff),
    ))
    .returning({ id: proposalProfileMatches.id });
  return result.length;
}

export async function reactivateProposalProfileMatch(id: string, userId: string): Promise<boolean> {
  const [match] = await db.select().from(proposalProfileMatches).where(eq(proposalProfileMatches.id, id));
  if (!match) return false;
  if (match.bikerId !== userId && match.zavorrinaId !== userId) return false;
  if (!match.archivedAt) return false;
  await db.update(proposalProfileMatches)
    .set({ status: "new", archivedAt: null, createdAt: new Date() })
    .where(and(eq(proposalProfileMatches.id, id), isNotNull(proposalProfileMatches.archivedAt)));
  return true;
}

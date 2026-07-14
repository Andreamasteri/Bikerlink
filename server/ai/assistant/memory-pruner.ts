// Task #3099 — Auto-archive old AI conversation turns.
//
// pruneUserMemory: compresses the oldest MEMORY_SUMMARIZE_THRESHOLD/2 turns
// for a user into a single summary assistant turn, then hard-deletes the raw
// turns. Called lazily (fire-and-forget) after each conversation via agent.ts
// and proactively via the nightly cron.
import { Cron } from "croner";
import { withJobGate } from "../coordinator/gated-job";
import { db } from "../../db";
import { aiConversationTurns } from "@shared/db";
import { eq, asc, sql, inArray } from "drizzle-orm";

const TIMEZONE = "Europe/Rome";

export const MEMORY_TURNS_LIMIT = 12;
export const MEMORY_SUMMARIZE_THRESHOLD = 30;

let _cron: Cron | null = null;

// ── Core pruning ──────────────────────────────────────────────────────────────

/**
 * Prunes old turns for a single user.
 * Takes the oldest (MEMORY_SUMMARIZE_THRESHOLD / 2) raw turns, collapses them
 * into one summary assistant turn, then batch-deletes the originals.
 * Returns true if pruning was actually performed.
 */
export async function pruneUserMemory(userId: string): Promise<boolean> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiConversationTurns)
    .where(eq(aiConversationTurns.userId, userId));

  if (Number(count) <= MEMORY_SUMMARIZE_THRESHOLD) return false;

  const oldest = await db
    .select()
    .from(aiConversationTurns)
    .where(eq(aiConversationTurns.userId, userId))
    .orderBy(asc(aiConversationTurns.createdAt))
    .limit(Math.floor(MEMORY_SUMMARIZE_THRESHOLD / 2));

  if (oldest.length < 4) return false;

  const ids = oldest.map((t) => t.id);
  const firstId = ids[0];
  // Use the oldest turn's timestamp so the summary sorts correctly in the
  // chronological window loaded by loadMemoryTurns() (ORDER BY created_at ASC).
  const summaryCreatedAt = oldest[0].createdAt;

  const summaryContent = `[RIASSUNTO CONVERSAZIONE PRECEDENTE]\n${oldest
    .map((t) => `${t.role === "user" ? "Utente" : "Assistente"}: ${t.content.slice(0, 200)}`)
    .join("\n")}`;

  // Atomic: insert summary then delete originals in a single transaction.
  // A failure between insert and delete would leave orphaned summary rows.
  await db.transaction(async (tx) => {
    await tx.insert(aiConversationTurns).values({
      userId,
      role: "assistant",
      content: summaryContent.slice(0, 4000),
      summaryOf: firstId,
      createdAt: summaryCreatedAt,
    });
    await tx.delete(aiConversationTurns).where(inArray(aiConversationTurns.id, ids));
  });

  return true;
}

// ── Batch job ─────────────────────────────────────────────────────────────────

/**
 * Finds all users with more than MEMORY_SUMMARIZE_THRESHOLD turns and prunes
 * each one. Returns execution stats.
 */
export async function runMemoryPruner(): Promise<{
  usersScanned: number;
  usersPruned: number;
  errors: number;
}> {
  const overThreshold = await db
    .select({ userId: aiConversationTurns.userId })
    .from(aiConversationTurns)
    .groupBy(aiConversationTurns.userId)
    .having(sql`count(*)::int > ${MEMORY_SUMMARIZE_THRESHOLD}`);

  let usersPruned = 0;
  let errors = 0;

  for (const { userId } of overThreshold) {
    try {
      const pruned = await pruneUserMemory(userId);
      if (pruned) usersPruned++;
    } catch (err) {
      errors++;
      console.warn(`[memory-pruner] Error pruning user ${userId}:`, (err as Error).message);
    }
  }

  return { usersScanned: overThreshold.length, usersPruned, errors };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface MemoryStats {
  totalTurns: number;
  totalUsers: number;
  usersOverThreshold: number;
  summaryTurns: number;
  threshold: number;
}

export async function getMemoryStats(): Promise<MemoryStats> {
  const [totals] = await db
    .select({
      totalTurns: sql<number>`count(*)::int`,
      summaryTurns: sql<number>`count(*) filter (where summary_of is not null)::int`,
    })
    .from(aiConversationTurns);

  const distinctUsers = await db
    .select({ userId: aiConversationTurns.userId, cnt: sql<number>`count(*)::int` })
    .from(aiConversationTurns)
    .groupBy(aiConversationTurns.userId);

  const totalUsers = distinctUsers.length;
  const usersOverThreshold = distinctUsers.filter(
    (r) => Number(r.cnt) > MEMORY_SUMMARIZE_THRESHOLD,
  ).length;

  return {
    totalTurns: Number(totals?.totalTurns ?? 0),
    totalUsers,
    usersOverThreshold,
    summaryTurns: Number(totals?.summaryTurns ?? 0),
    threshold: MEMORY_SUMMARIZE_THRESHOLD,
  };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Schedules nightly memory pruning at 03:30 Europe/Rome.
 * Safe to call multiple times (idempotent).
 */
export function scheduleMemoryPruner(): void {
  if (_cron) return;
  _cron = new Cron("30 3 * * *", { timezone: TIMEZONE, protect: true }, withJobGate("memory-pruner", async () => {
    try {
      console.log("[memory-pruner] Nightly batch start...");
      const result = await runMemoryPruner();
      console.log(
        `[memory-pruner] Done — scanned: ${result.usersScanned}, pruned: ${result.usersPruned}, errors: ${result.errors}`,
      );
    } catch (err) {
      console.warn("[memory-pruner] Nightly batch error:", (err as Error).message);
    }
  }));
  console.log("[memory-pruner] Nightly cron scheduled at 03:30 Europe/Rome");
}

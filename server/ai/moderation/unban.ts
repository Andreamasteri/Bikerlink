// Task #2532 — Unban scheduler. Ogni 5 min riporta a "active" gli utenti il cui
// suspendedUntil è scaduto. Garantisce che i ban temporanei (durationDays>0)
// applicati via AI Co-Pilot non diventino sospensioni a tempo indefinito.
import { db } from "../../db";
import { users } from "@shared/db";
import { and, eq, lte, isNotNull } from "drizzle-orm";

const TICK_MS = 5 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;

export async function runUnbanScan(): Promise<{ unbanned: number }> {
  const now = new Date();
  const result = await db.update(users)
    .set({ status: "active", suspendedUntil: null })
    .where(and(
      eq(users.status, "suspended"),
      isNotNull(users.suspendedUntil),
      lte(users.suspendedUntil, now),
    ))
    .returning({ id: users.id });
  if (result.length > 0) {
    console.log(`[ai-unban] auto-unban ${result.length} utenti scaduti`);
  }
  return { unbanned: result.length };
}

export function startUnbanScheduler(): void {
  if (timer) return;
  setTimeout(() => {
    runUnbanScan().catch((err) => console.warn("[ai-unban] first scan error:", err));
  }, 30_000);
  timer = setInterval(() => {
    runUnbanScan().catch((err) => console.warn("[ai-unban] scan error:", err));
  }, TICK_MS);
  timer.unref?.();
  console.log("[ai-unban] scheduler started, tick=5min");
}

export function stopUnbanScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

import { db } from "../db";
import { userSessions } from "@shared/db";
import { sql, eq } from "drizzle-orm";

const TEN_MIN_MS = 10 * 60 * 1000;
const FIFTEEN_MIN_AGO = "NOW() - INTERVAL '15 minutes'";
// Jitter ±10%: evita risincronizzazione con altri worker ogni 10 min.
const jitteredInterval = () => TEN_MIN_MS * (0.90 + Math.random() * 0.20);

export async function runSessionCrashCleanup(): Promise<void> {
  try {
    // Use per-session last_heartbeat_at as the liveness signal.
    // Falls back to started_at when no heartbeat has been recorded yet.
    const stale = await db.execute(sql`
      SELECT
        s.id,
        s.started_at,
        s.last_heartbeat_at
      FROM user_sessions s
      WHERE s.ended_at IS NULL
        AND COALESCE(s.last_heartbeat_at, s.started_at) < ${sql.raw(FIFTEEN_MIN_AGO)}
    `);

    if (stale.rows.length === 0) return;

    for (const row of stale.rows as Array<{ id: string; started_at: string; last_heartbeat_at: string | null }>) {
      const startedAt = new Date(row.started_at);
      // Clamp: endedAt must be >= startedAt (heartbeat could theoretically pre-date session on clock skew)
      const rawEnd = row.last_heartbeat_at ? new Date(row.last_heartbeat_at) : startedAt;
      const endedAt = rawEnd >= startedAt ? rawEnd : startedAt;
      const dur = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
      await db
        .update(userSessions)
        .set({ endedAt, durationSeconds: dur, exitType: "crash" })
        .where(eq(userSessions.id, row.id));
    }

    console.log(`[session-crash-cleanup] Marked ${stale.rows.length} stale session(s) as crash`);
  } catch (err) {
    console.warn("[session-crash-cleanup] error:", err);
  }
}

export function scheduleSessionCrashCleanup(): void {
  // Primo run dopo 70s: evita di contendere il pool DB con gli altri worker
  // che partono al boot (thundering herd). Usa un chain auto-rischedulante
  // con jitter ±10% per evitare la risincronizzazione dopo ogni restart.
  const scheduleNext = () => {
    setTimeout(() => {
      void runSessionCrashCleanup();
      scheduleNext();
    }, jitteredInterval());
  };
  setTimeout(() => {
    void runSessionCrashCleanup();
    scheduleNext();
  }, 70_000);
}

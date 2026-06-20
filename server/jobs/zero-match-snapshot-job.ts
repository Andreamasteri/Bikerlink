import { db, withDbRetry } from "../db";
import { sql } from "drizzle-orm";
import { matchZeroSnapshots } from "@shared/db";
import { Cron } from "croner";
import { dedupWarn } from "../lib/dedup-logger";

let schedulerHandle: { stop?: () => void } | null = null;
let started = false;
let lastRunAt: Date | null = null;
let nextRunAt: Date | null = null;

export async function runZeroMatchSnapshot(): Promise<{
  snapshotDate: string;
  totalUsers: number;
  zeroMatchCount: number;
  inserted: boolean;
}> {
  const countResult = await withDbRetry(() => db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE is_fake = false AND role NOT IN ('admin', 'moderator')) AS total_users,
      COUNT(*) FILTER (
        WHERE is_fake = false AND role NOT IN ('admin', 'moderator')
          AND (
            SELECT COUNT(*) FROM biker_biker_matches m
            WHERE m.biker1_id = users.id OR m.biker2_id = users.id
          ) = 0
          AND (
            SELECT COUNT(*) FROM biker_zavorrina_matches m
            WHERE m.biker_id = users.id OR m.zavorrina_id = users.id
          ) = 0
      ) AS zero_match_count
    FROM users
  `));

  type Row = { total_users: string; zero_match_count: string };
  const row = countResult.rows[0] as Row;
  const totalUsers = parseInt(row.total_users ?? "0", 10);
  const zeroMatchCount = parseInt(row.zero_match_count ?? "0", 10);
  const today = new Date().toISOString().split("T")[0];

  const result = await withDbRetry(() => db.execute(sql`
    INSERT INTO match_zero_snapshots (snapshot_date, total_users, zero_match_count)
    VALUES (${today}::date, ${totalUsers}, ${zeroMatchCount})
    ON CONFLICT (snapshot_date) DO UPDATE
      SET total_users = EXCLUDED.total_users,
          zero_match_count = EXCLUDED.zero_match_count
    RETURNING (xmax = 0) AS inserted
  `));

  type InsertRow = { inserted: boolean };
  const inserted = !!((result.rows[0] as InsertRow)?.inserted);

  lastRunAt = new Date();
  console.log(`[zero-match-snapshot] ${today}: totalUsers=${totalUsers}, zeroMatchCount=${zeroMatchCount}, inserted=${inserted}`);

  return { snapshotDate: today, totalUsers, zeroMatchCount, inserted };
}

export function startZeroMatchSnapshotScheduler(): void {
  if (started) return;
  started = true;

  const run = async () => {
    try {
      await runZeroMatchSnapshot();
    } catch (e) {
      dedupWarn("zero-match-snapshot", "nightly job failed (non-fatal)", e);
    }
  };

  try {
    const cron = new Cron("0 3 * * *", { timezone: "Europe/Rome" }, run);
    schedulerHandle = cron;
    nextRunAt = cron.nextRun() ?? null;
    console.log(`[zero-match-snapshot] scheduled nightly at 03:00 Rome, next: ${nextRunAt?.toISOString()}`);
  } catch {
    const interval = setInterval(() => void run(), 24 * 3600_000);
    schedulerHandle = { stop: () => clearInterval(interval) };
    nextRunAt = new Date(Date.now() + 24 * 3600_000);
    console.log("[zero-match-snapshot] croner unavailable, fallback 24h interval");
  }

  setImmediate(() => void run());
}

export function stopZeroMatchSnapshotScheduler(): void {
  schedulerHandle?.stop?.();
  schedulerHandle = null;
  started = false;
}

export function getZeroMatchSnapshotSchedulerInfo() {
  return {
    running: started,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    nextRunAt: nextRunAt?.toISOString() ?? null,
  };
}

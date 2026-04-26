import { pool } from "./db";

const VACUUM_TABLES = [
  "conversation_participants",
  "moto_club_members",
  "messages",
  "user_motorcycles",
  "users",
  "conversations",
  "biker_biker_matches",
  "biker_zavorrina_matches",
  "user_profiles",
  "user_playlist_snapshots",
  "proposals",
  "moto_clubs",
  "app_settings",
] as const;

let isRunning = false;

export function isVacuumRunning(): boolean {
  return isRunning;
}

export async function runVacuumFullAll(): Promise<void> {
  if (isRunning) {
    console.warn("[VACUUM] Giro già in corso — skip.");
    return;
  }
  isRunning = true;
  const startTotal = Date.now();
  console.log("[VACUUM] Avvio VACUUM FULL ANALYZE su tutte le tabelle principali...");
  let client: import("pg").PoolClient | null = null;
  try {
    client = await pool.connect();
    for (const table of VACUUM_TABLES) {
      let sizeBefore = 0;
      let sizeAfter = 0;
      try {
        const beforeRow = await client.query<{ size: string }>(
          `SELECT pg_total_relation_size($1::regclass) AS size`,
          [table],
        );
        sizeBefore = parseInt(beforeRow.rows[0]?.size ?? "0", 10);
      } catch {
        sizeBefore = 0;
      }
      const t0 = Date.now();
      await client.query(`VACUUM FULL ANALYZE ${table}`);
      const elapsed = Date.now() - t0;
      try {
        const afterRow = await client.query<{ size: string }>(
          `SELECT pg_total_relation_size($1::regclass) AS size`,
          [table],
        );
        sizeAfter = parseInt(afterRow.rows[0]?.size ?? "0", 10);
      } catch {
        sizeAfter = 0;
      }
      const savedMB = ((sizeBefore - sizeAfter) / 1024 / 1024).toFixed(2);
      const beforeMB = (sizeBefore / 1024 / 1024).toFixed(2);
      const afterMB = (sizeAfter / 1024 / 1024).toFixed(2);
      console.log(
        `[VACUUM] ${table}: ${beforeMB}MB → ${afterMB}MB (risparmio ${savedMB}MB) in ${elapsed}ms`,
      );
    }
    const totalElapsed = Date.now() - startTotal;
    console.log(`[VACUUM] Completato in ${totalElapsed}ms — spazio recuperato.`);
  } catch (err) {
    console.error("[VACUUM] Errore durante VACUUM FULL:", err);
    throw err;
  } finally {
    if (client) client.release();
    isRunning = false;
  }
}

function nextRomeThreeAM(): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const year = get("year");
  const month = get("month") - 1;
  const day = get("day");
  const hour = get("hour");
  const romeMidnight = new Date(
    Date.UTC(year, month, day) - now.getTimezoneOffset() * 60_000,
  );
  const romeNow = new Date(
    Date.UTC(year, month, day, hour, get("minute"), get("second")),
  );
  const offset = now.getTime() - romeNow.getTime();
  let target = new Date(Date.UTC(year, month, day, 3, 0, 0));
  target = new Date(target.getTime() + offset);
  if (target.getTime() <= now.getTime()) {
    target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  }
  return target.getTime() - now.getTime();
  void romeMidnight;
}

export function scheduleNightlyVacuum(): void {
  if (process.env.DISABLE_NIGHTLY_VACUUM === "1") {
    console.log("[VACUUM] Scheduler notturno disabilitato (DISABLE_NIGHTLY_VACUUM=1).");
    return;
  }

  const scheduleNext = () => {
    const delayMs = nextRomeThreeAM();
    const nextAt = new Date(Date.now() + delayMs).toISOString();
    console.log(`[VACUUM] Prossima esecuzione programmata: ${nextAt} (tra ${Math.round(delayMs / 60_000)} minuti)`);
    setTimeout(async () => {
      try {
        await runVacuumFullAll();
      } catch {
      } finally {
        scheduleNext();
      }
    }, delayMs);
  };

  scheduleNext();
}

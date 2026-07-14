// Task #2537 — Scheduler nightly 04:00 (cheap) e weekly Sun 05:00 (expensive).
// Usa croner se disponibile, altrimenti fallback setInterval.
import { runIntegrityScan } from "./runner";
import { purgeExpired } from "./quarantine";
import { withJobGate } from "../coordinator/gated-job";

type CronLike = { stop?: () => void; nextRun?: () => Date | null };
let nightly: CronLike | NodeJS.Timeout | null = null;
let weekly: CronLike | NodeJS.Timeout | null = null;
let nightlyNext: Date | null = null;
let weeklyNext: Date | null = null;
let lastRunAt: Date | null = null;
let started = false;

export function startAppIntegrityScheduler(): void {
  if (started) return;
  started = true;
  bootCron().catch((e) => {
    console.error("[app-integrity scheduler] boot failed:", (e as Error).message);
  });
}

export function stopAppIntegrityScheduler(): void {
  try { (nightly as CronLike | null)?.stop?.(); (weekly as CronLike | null)?.stop?.(); } catch { /* ignore */ }
  nightly = null; weekly = null; started = false;
}

async function bootCron() {
  const cronMod = (await import("croner").catch(() => null)) as { Cron?: new (expr: string, opts: unknown, fn: () => void) => CronLike } | null;
  const runCheap = async () => {
    lastRunAt = new Date();
    try { await runIntegrityScan({ trigger: "scheduled", includeExpensive: false, applySafeAutofix: true }); }
    catch (e) { console.error("[app-integrity nightly] failed:", (e as Error).message); }
    try { await purgeExpired(); } catch { /* ignore */ }
  };
  const runExpensive = async () => {
    lastRunAt = new Date();
    try { await runIntegrityScan({ trigger: "expensive", includeExpensive: true }); }
    catch (e) { console.error("[app-integrity weekly] failed:", (e as Error).message); }
  };
  // Task #9 — subsystem app-integrity, gate unico Quebracho (già integrato via
  // coordinator/integrations/app-integrity.ts a livello di eventi/decisioni).
  const gatedCheap = withJobGate("app-integrity-nightly", runCheap);
  const gatedExpensive = withJobGate("app-integrity-weekly", runExpensive);

  if (cronMod?.Cron) {
    nightly = new cronMod.Cron("0 4 * * *", { timezone: "Europe/Rome" }, gatedCheap);
    weekly = new cronMod.Cron("0 5 * * 0", { timezone: "Europe/Rome" }, gatedExpensive);
    nightlyNext = (nightly as CronLike).nextRun?.() ?? null;
    weeklyNext = (weekly as CronLike).nextRun?.() ?? null;
  } else {
    // Fallback minimal: 24h e 7d interval. Non sincronizzato sull'orario; informativo.
    nightly = setInterval(() => { void gatedCheap(); }, 24 * 3600_000);
    weekly = setInterval(() => { void gatedExpensive(); }, 7 * 24 * 3600_000);
    nightlyNext = new Date(Date.now() + 24 * 3600_000);
    weeklyNext = new Date(Date.now() + 7 * 24 * 3600_000);
  }
}

export function getAppIntegrityScheduleInfo() {
  return {
    running: started,
    nightlyNext: nightlyNext?.toISOString() ?? null,
    weeklyNext: weeklyNext?.toISOString() ?? null,
    lastRunAt: lastRunAt?.toISOString() ?? null,
  };
}

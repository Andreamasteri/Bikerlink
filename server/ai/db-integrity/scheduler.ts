// Task #2536 — Scheduler croner per scan notturni e settimanali.
// Notturno 03:00 → cheap+medium. Domenica 04:00 → anche expensive.
// Cleanup quarantena ogni 6h.
import { Cron } from "croner";
import { runIntegrityScan } from "./runner";
import { cleanupExpiredQuarantine } from "./quarantine";
import { getQueue } from "../../cache/queues";
import { withJobGate } from "../coordinator/gated-job";

// Task #2536 — enqueue background per scan expensive (settimanale).
// Quando DragonflyDB è disponibile, la weekly cron NON esegue il scan in-process
// ma lo accoda su BullMQ "db-integrity-expensive" (worker registrato a parte
// nello stesso processo per ora). Quando DragonflyDB non è disponibile, fallback
// a esecuzione diretta.
async function enqueueOrRunExpensive(): Promise<void> {
  const q = getQueue("db-integrity-expensive");
  if (q) {
    try {
      await q.add("weekly-scan", { trigger: "weekly", includeExpensive: true }, {
        jobId: `weekly-${new Date().toISOString().slice(0, 10)}`,
      });
      console.log("[db-integrity/scheduler] weekly scan enqueued su BullMQ");
      return;
    } catch (err) {
      console.warn("[db-integrity/scheduler] enqueue fallito, fallback inline:", (err as Error).message);
    }
  }
  const s = await runIntegrityScan({ trigger: "weekly", includeExpensive: true });
  lastRunAt = s.runAt;
  console.log(`[db-integrity/scheduler] settimanale (inline): ${s.checksRun} check, ${s.violationsFound} violazioni`);
}

// Esportato per il worker BullMQ.
export async function processExpensiveJob(): Promise<{ ok: true }> {
  const s = await runIntegrityScan({ trigger: "weekly", includeExpensive: true });
  lastRunAt = s.runAt;
  console.log(`[db-integrity/scheduler] weekly (BullMQ worker): ${s.checksRun} check, ${s.violationsFound} violazioni`);
  return { ok: true };
}

let nightly: Cron | null = null;
let weekly: Cron | null = null;
let cleanup: Cron | null = null;

const TZ = "Europe/Rome";

let lastError: { at: string; message: string } | null = null;
let lastRunAt: string | null = null;

export function startDbIntegrityScheduler(): void {
  if (nightly) return;
  // Task #9 — subsystem db-integrity, gate unico Quebracho (già integrato via
  // coordinator/integrations/db-integrity.ts a livello di eventi/decisioni).
  const gatedNightly = withJobGate("db-integrity-nightly", async () => {
    const s = await runIntegrityScan({ trigger: "cron", includeExpensive: false });
    lastRunAt = s.runAt;
    console.log(`[db-integrity/scheduler] notturno: ${s.checksRun} check, ${s.violationsFound} violazioni, ${s.autoFixed} fix`);
  });
  const gatedWeekly = withJobGate("db-integrity-weekly", enqueueOrRunExpensive);
  const gatedCleanup = withJobGate("db-integrity-cleanup", async () => {
    const n = await cleanupExpiredQuarantine();
    if (n > 0) console.log(`[db-integrity/scheduler] quarantena: ${n} righe scadute purgate`);
  });
  nightly = new Cron("0 3 * * *", { timezone: TZ, protect: true }, async () => {
    try {
      await gatedNightly();
    } catch (err) {
      lastError = { at: new Date().toISOString(), message: (err as Error).message?.slice(0, 300) ?? "unknown" };
      console.warn("[db-integrity/scheduler] notturno error:", err);
    }
  });
  weekly = new Cron("0 4 * * 0", { timezone: TZ, protect: true }, async () => {
    try {
      await gatedWeekly();
    } catch (err) {
      lastError = { at: new Date().toISOString(), message: (err as Error).message?.slice(0, 300) ?? "unknown" };
      console.warn("[db-integrity/scheduler] settimanale error:", err);
    }
  });
  cleanup = new Cron("0 */6 * * *", { timezone: TZ, protect: true }, async () => {
    try {
      await gatedCleanup();
    } catch (err) {
      console.warn("[db-integrity/scheduler] cleanup error:", err);
    }
  });
  console.log("[db-integrity/scheduler] avviato (03:00 nightly, 04:00 dom weekly, cleanup ogni 6h)");
}

export function stopDbIntegrityScheduler(): void {
  nightly?.stop(); weekly?.stop(); cleanup?.stop();
  nightly = null; weekly = null; cleanup = null;
}

export function getDbIntegrityScheduleInfo() {
  return {
    running: !!nightly,
    nightlyNext: nightly?.nextRun()?.toISOString() ?? null,
    weeklyNext: weekly?.nextRun()?.toISOString() ?? null,
    lastError, lastRunAt,
  };
}

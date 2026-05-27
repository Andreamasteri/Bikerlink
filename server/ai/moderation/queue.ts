// Task #2532 — Coda in-process leggera per il triage AI. Non usa BullMQ per
// mantenere zero-config in dev: la coda è semplicemente un FIFO con worker
// singolo e backoff. Se il processo cade, i report non analizzati possono
// essere recuperati dal backfill (server/ai/moderation/backfill.ts).

import { runTriage } from "./triage";
import { db } from "../../db";
import { reports } from "@shared/db";
import { eq } from "drizzle-orm";

interface Job {
  reportId: string;
  enqueuedAt: number;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const MAX_QUEUE = 500;
const queue: Job[] = [];
let running = false;
let lastError: { at: string; message: string } | null = null;
let processed = 0;
let failed = 0;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      try {
        // Privacy opt-out: se il report è marcato disableAiAnalysis, skip
        // completo (nessuna chiamata al provider, nessun log AI).
        const [r] = await db.select({ disabled: reports.disableAiAnalysis })
          .from(reports).where(eq(reports.id, job.reportId));
        if (r?.disabled) { processed++; continue; }
        const out = await runTriage({ reportId: job.reportId });
        if (out) processed++;
        else {
          // null = budget/provider down. Retry con backoff.
          if (job.attempts + 1 < MAX_ATTEMPTS) {
            setTimeout(() => enqueueTriage(job.reportId, job.attempts + 1), 5_000 * (job.attempts + 1));
          } else {
            failed++;
          }
        }
      } catch (err) {
        failed++;
        lastError = { at: new Date().toISOString(), message: (err as Error).message?.slice(0, 200) ?? "unknown" };
        console.warn("[ai-queue] job error:", err);
      }
      // Piccolo throttle per non saturare il provider.
      await new Promise((res) => setTimeout(res, 200));
    }
  } finally {
    running = false;
  }
}

export function enqueueTriage(reportId: string, attempts = 0): boolean {
  if (queue.length >= MAX_QUEUE) {
    console.warn("[ai-queue] full, dropping reportId", reportId);
    return false;
  }
  queue.push({ reportId, enqueuedAt: Date.now(), attempts });
  // Fire-and-forget; promessa volutamente ignorata.
  tick().catch((err) => console.warn("[ai-queue] tick error:", err));
  return true;
}

export function getQueueStats() {
  return {
    pending: queue.length,
    running,
    processed,
    failed,
    lastError,
    oldestEnqueuedMsAgo: queue.length ? Date.now() - queue[0].enqueuedAt : 0,
  };
}

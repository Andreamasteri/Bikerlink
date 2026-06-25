// Task #2536 — Worker BullMQ per "db-integrity-expensive".
// Esegue il scan settimanale enqueued dalla weekly cron quando Redis è
// disponibile. Senza questo worker, gli expensive scan resterebbero in coda
// senza essere mai consumati.
import { Worker, type ConnectionOptions } from "bullmq";
import { getBullConnectionOptions, isRedisAvailable } from "../../cache/redis";
import { processExpensiveJob } from "./scheduler";

let worker: Worker | null = null;

export function startDbIntegrityWorker(): void {
  if (worker) return;
  if (!isRedisAvailable()) {
    console.log("[db-integrity/worker] Redis non disponibile — worker non avviato (fallback inline gestito dallo scheduler).");
    return;
  }
  const connOpts = getBullConnectionOptions();
  if (!connOpts) return;
  try {
    worker = new Worker(
      "db-integrity-expensive",
      async () => processExpensiveJob(),
      { connection: connOpts as unknown as ConnectionOptions, concurrency: 1 },
    );
    worker.on("failed", (job, err) => {
      console.warn(`[db-integrity/worker] job ${job?.id} fallito:`, err?.message);
    });
    worker.on("completed", (job) => {
      console.log(`[db-integrity/worker] job ${job.id} completato`);
    });
    console.log("[db-integrity/worker] avviato su queue db-integrity-expensive");
  } catch (err) {
    console.warn("[db-integrity/worker] init fallito:", (err as Error).message);
  }
}

export async function stopDbIntegrityWorker(): Promise<void> {
  if (worker) {
    try { await worker.close(); } catch { /* ignore */ }
    worker = null;
  }
}

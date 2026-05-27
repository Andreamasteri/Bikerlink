// Task #2533 — Collector BullMQ. Se le code non sono inizializzate, ritorna vuoto.
import type { Signal } from "../types";

export async function collectBullMq(): Promise<Signal[]> {
  const signals: Signal[] = [];
  try {
    const mod = await import("bullmq").catch(() => null);
    if (!mod) return signals;
    // Best-effort: cerca un registry globale di queues. Se non presente, no-op.
    const reg = (globalThis as unknown as { __bikerlinkBullQueues?: Map<string, unknown> }).__bikerlinkBullQueues;
    if (!reg || reg.size === 0) return signals;
    for (const [name, queueRaw] of reg.entries()) {
      const q = queueRaw as { getJobCounts?: () => Promise<Record<string, number>> };
      if (typeof q.getJobCounts !== "function") continue;
      try {
        const counts = await q.getJobCounts();
        const waiting = Number(counts.waiting ?? 0);
        const failed = Number(counts.failed ?? 0);
        const delayed = Number(counts.delayed ?? 0);
        const active = Number(counts.active ?? 0);
        signals.push({
          source: "bullmq", metric: `queue.${name}.waiting`, value: waiting, unit: "jobs",
          severity: waiting > 500 ? "high" : waiting > 100 ? "warn" : "info",
          details: counts,
        });
        signals.push({
          source: "bullmq", metric: `queue.${name}.failed`, value: failed, unit: "jobs",
          severity: failed > 50 ? "high" : failed > 10 ? "warn" : "info",
        });
        signals.push({
          source: "bullmq", metric: `queue.${name}.active`, value: active, unit: "jobs", severity: "info",
        });
        signals.push({
          source: "bullmq", metric: `queue.${name}.delayed`, value: delayed, unit: "jobs", severity: "info",
        });
      } catch (err) {
        signals.push({
          source: "bullmq", metric: `queue.${name}.error`, severity: "warn",
          details: { error: (err as Error).message },
        });
      }
    }
  } catch (err) {
    signals.push({
      source: "bullmq", metric: "collector.error", severity: "warn",
      details: { error: (err as Error).message },
    });
  }
  return signals;
}

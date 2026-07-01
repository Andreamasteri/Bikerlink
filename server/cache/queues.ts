import { Queue, type ConnectionOptions } from "bullmq";
import { getBullConnectionOptions, isRedisAvailable } from "./redis";

/**
 * BullMQ persistent queues (Task #2517).
 *
 * Backed by DragonflyDB (drop-in Redis-protocol compatible, Task #5244) via
 * TC_DRAGONFLY_URL (legacy TC_REDIS_URL still honoured). Lazily instantiated —
 * only when configured. Consumers that need
 * to enqueue jobs should `getQueue(name)` and fall back to direct execution if
 * it returns null. This module deliberately does NOT register workers — those
 * are added by the individual job owners (#2515/#2516/#2520/#2523/#2526).
 */

export type QueueName = "embeddings" | "recap" | "route-fingerprint" | "pattern-detect" | "db-integrity-expensive";

const ALL_QUEUES: QueueName[] = ["embeddings", "recap", "route-fingerprint", "pattern-detect", "db-integrity-expensive"];

const queues = new Map<QueueName, Queue>();

function getConnection(): ConnectionOptions | null {
  const opts = getBullConnectionOptions();
  if (!opts) return null;
  // Passiamo le opzioni di connessione (non il client cache condiviso): BullMQ
  // crea e gestisce le proprie connessioni con maxRetriesPerRequest:null.
  return opts as unknown as ConnectionOptions;
}

export function getQueue(name: QueueName): Queue | null {
  if (!isRedisAvailable()) return null;
  const existing = queues.get(name);
  if (existing) return existing;
  const connection = getConnection();
  if (!connection) return null;
  try {
    const q = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
    queues.set(name, q);
    return q;
  } catch (err) {
    console.warn(`[queues] failed to init queue ${name}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export function getAllQueues(): Queue[] {
  const out: Queue[] = [];
  for (const name of ALL_QUEUES) {
    const q = getQueue(name);
    if (q) out.push(q);
  }
  return out;
}

export function getQueueNames(): QueueName[] {
  return [...ALL_QUEUES];
}

export async function closeQueues(): Promise<void> {
  for (const q of queues.values()) {
    try { await q.close(); } catch { /* ignore */ }
  }
  queues.clear();
}

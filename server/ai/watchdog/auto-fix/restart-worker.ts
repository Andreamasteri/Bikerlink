// Task #877 — Auto-fix: drain + reset dei contatori interni del DB collector/pool
// per liberare risorse in caso di alta latenza. Non riavvia il processo.
import type { AutoFixRule } from "../types";
import { resetState as resetDbCollector } from "../collectors/db-collector";
import { resetState as resetPoolCollector } from "../collectors/pool-collector";
import { pool } from "../../../db";

const LATENCY_TRIGGER_MS = 3000; // soglia p99 per considerare il restart utile

export const restartWorkerRule: AutoFixRule = {
  id: "restart_worker",
  description: "Reset contatori DB collector + chiusura connessioni idle eccedenti",
  async run(snap) {
    const p99Before = snap.metrics["latency.latency.p99_ms"] ?? null;
    const dbLatency = snap.metrics["db.db.ping_ms"] ?? null;

    // Applica solo se ci sono segnali concreti di latenza DB elevata.
    const hasLatencySignal =
      (Number.isFinite(p99Before) && (p99Before as number) >= LATENCY_TRIGGER_MS) ||
      (Number.isFinite(dbLatency) && (dbLatency as number) >= LATENCY_TRIGGER_MS);
    if (!hasLatencySignal) {
      return { applied: false, reason: `latenza DB non critica (p99=${p99Before}ms, ping=${dbLatency}ms)` };
    }

    // 1. Reset contatori in-process dei collector: elimina i latch elevati che
    //    alimenterebbero falsi alert al prossimo tick.
    resetDbCollector();
    resetPoolCollector();

    // 2. Tenta di liberare connessioni idle eccedenti dal pool pg: usa
    //    pool.connect() + client.release(true) per distruggere (non restituire)
    //    connessioni di riserva, riducendo il carico sul DB managed.
    let releasedConns = 0;
    const idleBefore = pool.idleCount;
    const SPARE_TO_KEEP = 1; // teniamo almeno 1 connessione idle pronta
    const toRelease = Math.max(0, idleBefore - SPARE_TO_KEEP);
    for (let i = 0; i < toRelease; i++) {
      try {
        const client = await pool.connect();
        client.release(true); // true = distruggi anziché restituire al pool
        releasedConns++;
      } catch {
        break; // pool saturo o error transitorio: fermiamoci qui
      }
    }

    const idleAfter = pool.idleCount;

    return {
      applied: true,
      summary: `Reset collector DB/pool; connessioni idle: ${idleBefore}→${idleAfter} (${releasedConns} distrutte). Latenza pre: p99=${p99Before}ms, ping=${dbLatency}ms`,
      details: {
        p99BeforeMs: p99Before,
        dbPingBeforeMs: dbLatency,
        idleConnsBefore: idleBefore,
        idleConnsAfter: idleAfter,
        releasedConns,
      },
    };
  },
};

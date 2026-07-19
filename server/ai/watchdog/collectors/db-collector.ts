// Task #2533 — Collector DB Postgres. Connessioni, query lente, dimensione, IOPS approssimate.
import { pool, isPoolHealthy, snapshotBlockedQueries } from "../../../db";
import type { Signal } from "../types";
import { recordSuccess as cbRecordSuccess, recordFailure as cbRecordFailure, getCircuitStatus } from "../../../db-circuit-breaker";
import { setDbSlowPingsConsecutive, withBgDbSlot } from "../../../lib/bg-db-limiter";
import { readJobAttempt } from "../../../lib/scheduler-retry";
import { VACUUM_LAST_ATTEMPT_SETTING_KEY } from "../../../vacuum-service";

// ── HNSW index health probe (throttled) ───────────────────────────────────────
// Checked at most once every 5 minutes per process (not every collector tick)
// to avoid hammering pg_catalog on every heartbeat.
const HNSW_INDEX_NAME = "embeddings_vec_hnsw_cosine_idx";
const HNSW_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let _lastHnswCheckAt = 0;
let _lastHnswSignal: Signal | null = null;

// ── Anti-blip (Task #4546) ────────────────────────────────────────────────────
// Un singolo campione lento o un singolo ping fallito è quasi sempre un blip
// transitorio (timeout/disconnessione che rientra subito). Far scattare lo stato
// "red" del watchdog su un evento isolato genera falsi allarmi. Richiediamo
// quindi che la latenza alta / il fallimento siano PERSISTENTI (N campioni
// consecutivi) prima di escalare la severità.
const SLOW_PING_THRESHOLD_MS = 500;
const WARN_PING_THRESHOLD_MS = 150;
// Numero di campioni consecutivi oltre soglia richiesti per escalare a "high".
const CONSECUTIVE_SLOW_FOR_HIGH = 3;
// Numero di ping falliti consecutivi richiesti per escalare a "critical".
const CONSECUTIVE_FAIL_FOR_CRITICAL = 3;

let consecutiveSlowPings = 0;
let consecutivePingFailures = 0;

// Task #154 — Reset dei contatori anti-blip. Azzera i campioni consecutivi
// (lento/fallito) accumulati in memoria di processo, così un incidente rientrato
// non resta "appiccicato" nel pannello finché il server non riparte. Idempotente,
// nessun I/O. Sincronizza anche il gauge condiviso bg-db-limiter.
export function resetState(): void {
  consecutiveSlowPings = 0;
  consecutivePingFailures = 0;
  setDbSlowPingsConsecutive(0);
}

export async function collectDb(): Promise<Signal[]> {
  const signals: Signal[] = [];

  // Early-exit (Task #4679): se il pool è saturo NON acquisiamo nessuna
  // connessione. Aggiungere pressione proprio quando il pool è pieno peggiora
  // la saturazione; emettiamo solo un segnale informativo e usciamo. La
  // pressione reale è già coperta da pool-collector (db.pool.waiting).
  if (!isPoolHealthy()) {
    // ── Monitoring snapshot (Fix #3) ─────────────────────────────────────────
    // Pool saturo: il pool principale non ha connessioni libere, ma il pool di
    // monitoraggio riservato (max=1, separato) è ancora disponibile.
    // Logghiamo pg_stat_activity per vedere COSA sta occupando il DB.
    snapshotBlockedQueries().then((rows) => {
      if (rows.length === 0) return;
      console.error(
        "[watchdog/db] 🔴 POOL SATURO — connessioni su DB:",
        JSON.stringify(rows.map((r) => ({
          pid: r.pid,
          state: r.state,
          state_s: r.state_duration_s,   // quanto è in questo stato (zombie detection)
          query_s: r.duration_s,
          wait: r.wait_event_type ? `${r.wait_event_type}/${r.wait_event}` : null,
          app: r.application_name,
          query: r.query,
        }))),
      );
    }).catch(() => { /* monitoring pool non raggiungibile — silenzio */ });

    return [{
      source: "db", metric: "db.ping_saturated", severity: "warn",
      details: { reason: "pool_saturated_skip" },
    }];
  }

  // Connessione dedicata (Task #4679): acquisiamo UNA sola connessione dal pool
  // e vi eseguiamo tutte le query, rilasciandola nel finally. Prima usavamo 4
  // `db.execute()` separati → 4 acquisizioni/rilasci dal pool nello stesso giro.
  let client: import("pg").PoolClient | null = null;
  const started = Date.now();
  try {
    client = await pool.connect();
    // Timeout di sicurezza per le query diagnostiche del collector (3s). Usiamo
    // SET (non SET LOCAL): fuori da una transazione SET LOCAL sarebbe un no-op.
    // Ripristiniamo il default del pool (5s) nel finally prima del release per
    // non lasciare il timeout ridotto su una connessione che torna nel pool.
    try { await client.query("SET statement_timeout = '3000'"); } catch { /* best-effort */ }

    // Ping
    await client.query("SELECT 1");
    const pingMs = Date.now() - started;
    cbRecordSuccess();
    consecutivePingFailures = 0;
    if (pingMs > 5000) {
      // ── Monitoring snapshot (Fix #3) ─────────────────────────────────────────
      // Ping spike: la connessione c'era ma la query è stata lenta (>5s).
      // Logghiamo pg_stat_activity per vedere cosa stava girando in quel momento.
      snapshotBlockedQueries().then((rows) => {
        if (rows.length === 0) return;
        console.error(
          `[watchdog/db] 🟡 PING SPIKE ${pingMs}ms — connessioni su DB:`,
          JSON.stringify(rows.map((r) => ({
            pid: r.pid,
            state: r.state,
            state_s: r.state_duration_s,
            query_s: r.duration_s,
            wait: r.wait_event_type ? `${r.wait_event_type}/${r.wait_event}` : null,
            app: r.application_name,
            query: r.query,
          }))),
        );
      }).catch(() => {});

      const poolInfo = pool as { totalCount?: number; idleCount?: number; waitingCount?: number };
      // NB diagnostica (Task #4706): un ping lento (>8s) con `waiting=0` NON è una
      // saturazione del nostro pool né una connection leak — il pool ha conn libere
      // e nessuna richiesta in coda. È lentezza del Postgres managed di Replit
      // (compute autoscaling/cold, manutenzione lato piattaforma). Distinzione:
      //   - waiting>0  → contesa REALE sul nostro pool (indaga i job/leak)
      //   - waiting=0 + ping alto → lentezza managed lato server, non agire sul pool
      // Per questo db.db.pool.waiting e db.db.ping_saturated sono soppressi quando il
      // ThinkCentre è spento (vedi aggregator.suppressDownstreamWhenPoweredOff), mentre
      // db.ping_ms resta visibile come segnale informativo.
      console.warn(
        `[watchdog/db] ping spike: ${pingMs}ms` +
        ` — pool: total=${poolInfo.totalCount ?? "?"} idle=${poolInfo.idleCount ?? "?"} waiting=${poolInfo.waitingCount ?? "?"}` +
        ((poolInfo.waitingCount ?? 0) === 0 ? " (waiting=0 → lentezza managed-Postgres, non leak)" : ""),
      );
    }
    // Latenza alta: escala a "high" solo dopo N campioni lenti consecutivi.
    // Un singolo spike resta "warn" (non spinge lo stato globale a red).
    let pingSeverity: Signal["severity"];
    if (pingMs > SLOW_PING_THRESHOLD_MS) {
      consecutiveSlowPings++;
      setDbSlowPingsConsecutive(consecutiveSlowPings);
      pingSeverity = consecutiveSlowPings >= CONSECUTIVE_SLOW_FOR_HIGH ? "high" : "warn";
    } else {
      consecutiveSlowPings = 0;
      setDbSlowPingsConsecutive(0);
      pingSeverity = pingMs > WARN_PING_THRESHOLD_MS ? "warn" : "info";
    }
    signals.push({
      source: "db", metric: "db.ping_ms", value: pingMs, unit: "ms",
      severity: pingSeverity,
      details: { consecutiveSlow: consecutiveSlowPings },
    });

    // Connessioni attive
    try {
      const r = await client.query<{ active: number; total: number }>(`
        SELECT
          COUNT(*) FILTER (WHERE state = 'active')::int AS active,
          COUNT(*)::int AS total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      const row = r.rows[0];
      if (row) {
        signals.push({
          source: "db", metric: "db.connections.active", value: Number(row.active), unit: "conn",
          severity: row.active > 80 ? "high" : row.active > 40 ? "warn" : "info",
          details: { total: Number(row.total) },
        });
      }
    } catch { /* permission denied su pg_stat_activity → silenzio */ }

    // Query lente: pg_stat_statements (se installato)
    try {
      const r = await client.query<{ slow_count: number }>(`
        SELECT COUNT(*)::int AS slow_count
        FROM pg_stat_statements
        WHERE mean_exec_time > 500
      `);
      const row = r.rows[0];
      if (row) {
        signals.push({
          source: "db", metric: "db.slow_queries", value: Number(row.slow_count), unit: "queries",
          severity: row.slow_count > 50 ? "high" : row.slow_count > 10 ? "warn" : "info",
        });
      }
    } catch { /* extension non installata */ }

    // Size DB (informativo)
    try {
      const r = await client.query<{ size_mb: number }>(`
        SELECT (pg_database_size(current_database()) / 1024.0 / 1024.0)::float AS size_mb
      `);
      const row = r.rows[0];
      if (row) {
        signals.push({
          source: "db", metric: "db.size_mb", value: Number(row.size_mb), unit: "MB", severity: "info",
        });
      }
    } catch { /* ignore */ }

    // HNSW index health (throttled — once every 5 min)
    try {
      const now = Date.now();
      if (now - _lastHnswCheckAt >= HNSW_CHECK_INTERVAL_MS) {
        _lastHnswCheckAt = now;
        const r = await client.query<{ exists: boolean; valid: boolean }>(`
          SELECT
            EXISTS (
              SELECT 1 FROM pg_indexes
              WHERE schemaname = 'public'
                AND tablename = 'embeddings'
                AND indexname = $1
            ) AS exists,
            COALESCE(
              (SELECT i.indisvalid
               FROM pg_class c
               JOIN pg_index i ON i.indrelid = c.oid
               JOIN pg_class ic ON ic.oid = i.indexrelid
               WHERE c.relname = 'embeddings'
                 AND ic.relname = $1
                 AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
              ),
              false
            ) AS valid
        `, [HNSW_INDEX_NAME]);
        const row = r.rows[0];
        const exists = row?.exists ?? false;
        const valid = row?.valid ?? false;
        const hnswSeverity: Signal["severity"] =
          !exists ? "high" : !valid ? "high" : "info";
        const sig: Signal = {
          source: "db",
          metric: "embeddings.hnsw_index",
          value: exists && valid ? 1 : 0,
          severity: hnswSeverity,
          details: { exists, valid, indexName: HNSW_INDEX_NAME },
        };
        _lastHnswSignal = sig;
        signals.push(sig);
        if (!exists) {
          console.warn("[watchdog/db] 🔴 HNSW index mancante — findSimilar userà sequential scan");
        } else if (!valid) {
          console.warn("[watchdog/db] 🔴 HNSW index invalido (build interrotta?) — findSimilar userà sequential scan");
        }
      } else if (_lastHnswSignal) {
        // Re-emit the cached signal so it's always present in watchdog metrics
        signals.push(_lastHnswSignal);
      }
    } catch { /* non-fatal — catalog read failure */ }
  } catch (err) {
    consecutiveSlowPings = 0;
    setDbSlowPingsConsecutive(0);
    // Distingui "pool saturo" da "DB irraggiungibile" (incidente 20 giu).
    // Quando il pool è saturo (tutte le connessioni occupate + client in attesa)
    // il SELECT 1 fallisce perché non riesce ad ACQUISIRE una connessione entro
    // connectionTimeoutMillis, NON perché il DB è giù. In quel caso NON contiamo
    // il fallimento contro il circuit breaker: la saturazione transitoria non
    // deve aprirlo (era la causa del flapping OPEN↔HALF_OPEN in produzione). La
    // pressione è già segnalata da pool-collector (db.pool.waiting) e la richiesta
    // utente degrada con un 503 veloce via isPoolSaturatedSustained nel gate /api.
    // Il breaker resta riservato al caso "DB davvero irraggiungibile": pool con
    // capacità libera ma query comunque fallita.
    if (!isPoolHealthy()) {
      // Reset del contatore: una futura caduta DB reale ripartirà da 1.
      consecutivePingFailures = 0;
      signals.push({
        source: "db", metric: "db.ping_saturated", severity: "warn",
        details: { error: (err as Error).message?.slice(0, 200), reason: "pool_saturated" },
      });
    } else {
      // Errori di connessione infrastrutturale (es. "Connection terminated due to
      // connection timeout", "Connection terminated unexpectedly") indicano pressione
      // sul pool / blip di rete, NON DB irraggiungibile. Dal punto di vista del
      // collector sono indistinguibili dalla saturazione del pool: non armiamo il
      // circuit breaker e non incrementiamo il contatore consecutivo. Segnaliamo
      // come db.ping_saturated (warn) esattamente come il ramo pool-saturo.
      const errMsg = (err as Error).message ?? "";
      const isTransitoryConnectionError =
        /connection terminated/i.test(errMsg) ||
        /connection timeout/i.test(errMsg);

      if (isTransitoryConnectionError) {
        // Reset del contatore: un futuro guasto DB reale ripartirà da 1.
        consecutivePingFailures = 0;
        signals.push({
          source: "db", metric: "db.ping_saturated", severity: "warn",
          details: { error: errMsg.slice(0, 200), reason: "transitory_connection_error" },
        });
      } else {
        cbRecordFailure(err);
        consecutivePingFailures++;
        // Un singolo ping fallito è quasi sempre un blip transitorio: lo segnaliamo
        // come "warn" e lo escaliamo a "high" solo dopo N fallimenti consecutivi.
        // Il circuit breaker emette già "critical" quando il DB è davvero giù:
        // non aggiungere un secondo −40 con collector.error "critical" (doppia penalità).
        const errSeverity: Signal["severity"] =
          consecutivePingFailures >= CONSECUTIVE_FAIL_FOR_CRITICAL ? "high" : "warn";
        signals.push({
          source: "db", metric: "collector.error", severity: errSeverity,
          details: { error: (err as Error).message, consecutiveFailures: consecutivePingFailures },
        });
      }
    }
  } finally {
    if (client) {
      // Ripristina il default del pool prima di restituire la connessione e
      // rilasciala sempre, anche sui rami d'errore.
      try { await client.query("SET statement_timeout = '5000'"); } catch { /* best-effort */ }
      client.release();
    }
  }

  // ─── Esito dell'ULTIMO TENTATIVO del giro notturno di VACUUM ──────────────
  // Distinto da db_vacuum_smart_v1 (l'ultimo SUCCESSO): se l'ultimo giro è
  // fallito (es. l'acquisizione connessione bg ha esaurito i retry) lo
  // segnaliamo "high" subito, invece di accorgersene solo quando il last-run
  // invecchia. Simmetrico al segnale matching.last_attempt (maps-collector 4b).
  try {
    const attempt = await withBgDbSlot(() => readJobAttempt(VACUUM_LAST_ATTEMPT_SETTING_KEY));
    if (attempt) {
      const ageH = Math.round((Date.now() - new Date(attempt.ts).getTime()) / 3_600_000);
      // Quando il DB è confermato lento (≥ 2 ping lenti consecutivi), il vacuum
      // fallisce inevitabilmente per lo stesso motivo. Cappare a "warn" evita che
      // un fallimento atteso e derivato dalla stessa root cause contribuisca a
      // portare lo score sotto la soglia BROKEN (< 40 pt).
      const vacuumFailSev: Signal["severity"] = attempt.ok
        ? "info"
        : (consecutiveSlowPings >= 2 ? "warn" : "high");
      signals.push({
        source: "db", metric: "vacuum.last_attempt", value: attempt.ok ? 1 : 0,
        severity: vacuumFailSev,
        details: {
          ts: attempt.ts, ok: attempt.ok, retries: attempt.retries,
          error: attempt.error, ageH,
          ...(consecutiveSlowPings >= 2 && !attempt.ok ? { suppressedBy: "db_slow" } : {}),
        },
      });
    }
  } catch (err) {
    signals.push({
      source: "db", metric: "collector.error", severity: "warn",
      details: { stage: "vacuum_last_attempt", error: (err as Error).message?.slice(0, 200) },
    });
  }

  // Circuit breaker state — always emitted so it appears in watchdog metrics
  const circuit = getCircuitStatus();
  if (circuit.state !== "CLOSED") {
    signals.push({
      source: "db",
      metric: "db.circuit_breaker",
      severity: circuit.state === "OPEN" ? "critical" : "warn",
      value: circuit.consecutiveFailures,
      details: { state: circuit.state, openedAt: circuit.openedAt },
    });
  } else {
    signals.push({
      source: "db",
      metric: "db.circuit_breaker",
      severity: "info",
      value: 0,
      details: { state: "CLOSED" },
    });
  }

  return signals;
}

// Pool + bg-db-limiter pressure probe — surfaces Postgres contention before it
// causes a crash loop downstream.
//
// On each watchdog tick this reads two cheap, zero-I/O snapshots:
//   - getPoolStats()        → pg.Pool counters (total/idle/waiting/max)
//   - getBgDbLimiterStats() → cooperative bg-job semaphore (active/queued/max)
//
// Emitted signals:
//   - INFO     : normal snapshots (always emitted for the metrics dashboard)
//   - WARN     : early pressure (waiting>0 or limiter queued for 2+ ticks)
//   - HIGH     : persistent pressure (waiting>0 or limiter queued for 3+ ticks)
//   - CRITICAL : full pool exhaustion (waitingCount >= pool.max)
//
// Anti-blip rationale (mirrors db-collector): a single tick with a waiting
// client or a queued bg job is almost always a transient blip. Escalating the
// global watchdog status on an isolated sample generates false alarms, so we
// require the pressure to be PERSISTENT (N consecutive samples) before pushing
// severity to "high".
import pg from "pg";
import { getPoolStats, getCheckedOutConnections, APP_NAME } from "../../../db";
import { getBgDbLimiterStats } from "../../../lib/bg-db-limiter";
import type { Signal } from "../types";

// Consecutive over-threshold samples required to escalate. Matches the
// db-collector anti-blip pattern (CONSECUTIVE_SLOW_FOR_HIGH = 3).
const CONSECUTIVE_FOR_WARN = 2;
const CONSECUTIVE_FOR_HIGH = 3;

// After this many consecutive ticks with waiting > 0, run a pg_stat_activity
// probe via a direct Client (not from the pool) to identify blocking queries.
const CONSECUTIVE_FOR_ACTIVITY_PROBE = 5;

// ── Idle-connection leak detector (Task #5229, step 10) ───────────────────────
// Soglie del detector di connessioni idle anomale APPARTENENTI A NOI (filtrate
// per application_name): una connessione del nostro pool che resta idle / idle in
// transaction più a lungo dell'idleTimeoutMillis del pool (10s) è anomala —
// una connessione idle in-pool sana verrebbe evictata entro 10s; se è ancora lì
// dopo 30s è CHECKED OUT e tenuta dal codice senza eseguire query (= il leak).
const IDLE_LEAK_MIN_AGE_S = 30;
// Soglia (numero di connessioni idle anomale) oltre la quale emettiamo un alert
// "high" nel watchdog e — se il kill è abilitato — terminiamo i backend.
const IDLE_LEAK_THRESHOLD = 2;
// Età minima (più alta della soglia di log) per TERMINARE un backend: kill solo
// le connessioni davvero bloccate da ≥60s, non quelle appena diventate idle.
const IDLE_KILL_MIN_AGE_S = 60;
// AppSetting di sicurezza che abilita pg_terminate_backend. Default OFF: il
// detector logga sempre, ma la terminazione forzata (ultima difesa) è opt-in.
const IDLE_KILL_SETTING_KEY = "db_idle_conn_kill_enabled";

// Esito dell'ultima probe idle-leak. La probe è async (fire-and-forget) e non può
// pushare segnali nel ritorno SINCRONO di collectPool(); quindi deposita qui il
// risultato e il tick successivo emette il segnale "high". Finestra ~130s = il
// prossimo tick del watchdog (60s) lo raccoglie ancora fresco.
let lastIdleLeak: { at: number; count: number; pids: number[]; killed: number } | null = null;

// Drops scartati IN UN SINGOLO TICK oltre i quali la crescita è "anomala" e va
// segnalata subito con un warn, senza attendere la conferma anti-blip. Un burst
// di scarti in una sola finestra di 60s è già di per sé un segnale di pressione
// acuta sul pool (la valvola di sfogo della coda sta buttando via lavoro).
const DROP_BURST_FOR_WARN = 10;

// Module-level state: consecutive ticks under pressure for each gauge.
let consecutiveWaiting = 0;
let consecutiveLimiterQueued = 0;

// Totali cumulativi (dal boot) degli scarti del bg-db-limiter visti all'ultimo
// tick: servono a calcolare il DELTA per finestra (quanti job sono stati
// scartati negli ultimi ~60s) invece di guardare solo il totale che cresce
// monotòno. consecutiveLimiterDrops conta i tick consecutivi con almeno uno
// scarto, per distinguere un blip isolato da una perdita persistente.
let prevDroppedOverflowTotal = 0;
let prevDroppedTimeoutTotal = 0;
let consecutiveLimiterDrops = 0;

// --- pg_stat_activity probe (out-of-band connection, not from pool) -----------
// Runs async — does NOT block the synchronous collectPool() return.
// Uses a short-lived pg.Client with a 4s connect+query timeout so it never
// hangs, and always disconnects in finally to avoid leaking a connection.
async function probePgStatActivity(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 4000,
    statement_timeout: 4000,
  });
  try {
    await client.connect();
    const result = await client.query<{
      pid: number;
      state: string | null;
      wait_event_type: string | null;
      wait_event: string | null;
      duration_s: number | null;
      query_short: string;
      application_name: string;
    }>(`
      SELECT
        pid,
        state,
        wait_event_type,
        wait_event,
        ROUND(EXTRACT(EPOCH FROM (now() - query_start))::numeric, 1) AS duration_s,
        LEFT(query, 120)  AS query_short,
        application_name
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state <> 'idle'
      ORDER BY duration_s DESC NULLS LAST
      LIMIT 10
    `);
    if (result.rows.length === 0) {
      console.warn("[pool-collector/activity] pool saturo ma 0 query attive (connessioni idle tenute aperte senza query)");
    } else {
      console.warn(
        "[pool-collector/activity] query attive durante saturazione pool:\n" +
        result.rows.map((r) =>
          `  pid=${r.pid} state=${r.state ?? "-"} duration=${r.duration_s ?? "-"}s ` +
          `wait=${r.wait_event_type ?? "-"}/${r.wait_event ?? "-"} q="${r.query_short?.trim()}"`
        ).join("\n"),
      );
    }

    // Step 10 — detector di connessioni idle anomale (riusa la connessione
    // out-of-band già aperta). Gira SEMPRE durante la probe, anche quando ci
    // sono query attive: il leak "0 query attive" è solo il caso estremo.
    await detectIdleLeak(client);
  } catch (err) {
    console.warn("[pool-collector/activity] probe fallita:", (err as Error).message?.slice(0, 200));
  } finally {
    try { await client.end(); } catch { /* best-effort */ }
  }
}

/**
 * Step 10 (Task #5229): detector attivo di connessioni idle anomale NOSTRE.
 *
 * Interroga pg_stat_activity filtrando per la nostra application_name: solo così
 * distinguiamo le NOSTRE connessioni da quelle del Postgres managed di Replit.
 * Una connessione idle / idle-in-transaction con state_change più vecchio della
 * soglia è una connessione estratta dal pool e TENUTA senza eseguire query — la
 * causa diretta di "pool saturo ma 0 query attive".
 *
 * Logga PID, query precedente ed età; incrocia con il tracer in-process di db.ts
 * (getCheckedOutConnections) per stampare lo STACK del chiamante che non ha
 * rilasciato. Oltre soglia deposita il risultato per l'alert "high" del tick
 * successivo e, se l'AppSetting di sicurezza è attiva, forza pg_terminate_backend
 * sui backend più vecchi come ultima difesa.
 *
 * Usa la connessione out-of-band passata (NON il pool, che è saturo) anche per
 * leggere l'AppSetting, evitando di accodare una query su un pool già pieno.
 */
async function detectIdleLeak(client: pg.Client): Promise<void> {
  const idleRes = await client.query<{
    pid: number;
    state: string | null;
    idle_s: number | null;
    last_query: string;
  }>(
    `SELECT
       pid,
       state,
       ROUND(EXTRACT(EPOCH FROM (now() - state_change))::numeric, 1) AS idle_s,
       LEFT(query, 120) AS last_query
     FROM pg_stat_activity
     WHERE datname = current_database()
       AND pid <> pg_backend_pid()
       AND application_name = $1
       AND state IN ('idle', 'idle in transaction', 'idle in transaction (aborted)')
       AND state_change < now() - make_interval(secs => $2)
     ORDER BY idle_s DESC
     LIMIT 20`,
    [APP_NAME, IDLE_LEAK_MIN_AGE_S],
  );

  const anomalous = idleRes.rows;
  if (anomalous.length === 0) {
    // Nessuna anomalia: azzera lo stato così non riemettiamo un alert stantio.
    lastIdleLeak = null;
    return;
  }

  console.error(
    `[pool-collector/idle-leak] ${anomalous.length} connessioni idle anomale (app=${APP_NAME}, >${IDLE_LEAK_MIN_AGE_S}s):\n` +
    anomalous.map((r) =>
      `  pid=${r.pid} state=${r.state ?? "-"} idle=${r.idle_s ?? "-"}s lastq="${r.last_query?.trim()}"`
    ).join("\n"),
  );

  // Incrocio con il tracer in-process: stampa lo stack di chi non ha rilasciato.
  const leakedInProc = getCheckedOutConnections(IDLE_LEAK_MIN_AGE_S * 1000);
  if (leakedInProc.length > 0) {
    console.error(
      `[pool-collector/idle-leak] checkout in-process tenuti >${IDLE_LEAK_MIN_AGE_S}s (stack del chiamante):\n` +
      leakedInProc.map((c) =>
        `  id=${c.id} age=${Math.round(c.ageMs / 1000)}s @ ${c.stack}`
      ).join("\n"),
    );
  }

  // Termina i backend più vecchi SOLO se l'AppSetting di sicurezza è attiva.
  let killed = 0;
  if (anomalous.length >= IDLE_LEAK_THRESHOLD) {
    let killEnabled = false;
    try {
      const settingRes = await client.query<{ value: string | null; value_json: unknown }>(
        `SELECT value, value_json FROM app_settings WHERE key = $1`,
        [IDLE_KILL_SETTING_KEY],
      );
      const row = settingRes.rows[0];
      killEnabled =
        row?.value === "true" ||
        row?.value_json === true ||
        (typeof row?.value_json === "string" && row.value_json === "true");
    } catch {
      /* AppSetting illeggibile → kill disabilitato (fail-safe). */
    }

    if (killEnabled) {
      const killable = anomalous.filter((r) => (r.idle_s ?? 0) >= IDLE_KILL_MIN_AGE_S);
      for (const r of killable) {
        try {
          await client.query(`SELECT pg_terminate_backend($1)`, [r.pid]);
          killed++;
          console.error(`[pool-collector/idle-leak] 🔪 pg_terminate_backend(${r.pid}) (idle ${r.idle_s}s)`);
        } catch (err) {
          console.warn(`[pool-collector/idle-leak] terminate pid=${r.pid} fallito:`, (err as Error).message?.slice(0, 120));
        }
      }
    }
  }

  lastIdleLeak = {
    at: Date.now(),
    count: anomalous.length,
    pids: anomalous.map((r) => r.pid),
    killed,
  };
}

export function collectPool(): Signal[] {
  const signals: Signal[] = [];

  // ── pg.Pool counters ────────────────────────────────────────────────────
  try {
    const { total, idle, waiting, max } = getPoolStats();

    // Counters (always emit for the metrics dashboard).
    signals.push({
      source: "db",
      metric: "db.pool.total",
      value: total,
      unit: "conn",
      severity: "info",
    });
    signals.push({
      source: "db",
      metric: "db.pool.idle",
      value: idle,
      unit: "conn",
      severity: "info",
    });

    // Waiting clients — escalate only after N consecutive ticks under pressure.
    if (waiting > 0) {
      consecutiveWaiting++;
      // After CONSECUTIVE_FOR_ACTIVITY_PROBE ticks under pressure, fire an
      // out-of-band pg_stat_activity probe (async, does not block this tick).
      // Runs every 5 ticks thereafter so we get repeated snapshots during a
      // sustained saturation event without hammering the DB every 60s.
      if (
        consecutiveWaiting >= CONSECUTIVE_FOR_ACTIVITY_PROBE &&
        (consecutiveWaiting - CONSECUTIVE_FOR_ACTIVITY_PROBE) % 5 === 0
      ) {
        probePgStatActivity().catch(() => undefined);
      }
    } else {
      consecutiveWaiting = 0;
    }

    let waitingSeverity: Signal["severity"];
    if (waiting >= max) {
      // CRITICAL: pool fully saturated (all slots checked out + clients waiting).
      waitingSeverity = "critical";
    } else if (consecutiveWaiting >= CONSECUTIVE_FOR_HIGH) {
      // HIGH: persistent pressure — waiting clients for 3+ consecutive ticks.
      waitingSeverity = "high";
    } else if (waiting > 0 && consecutiveWaiting >= CONSECUTIVE_FOR_WARN) {
      // WARN: early pressure — waiting clients for 2 consecutive ticks.
      waitingSeverity = "warn";
    } else {
      // INFO: normal (waiting === 0, or first tick with waiting > 0).
      waitingSeverity = "info";
    }
    signals.push({
      source: "db",
      metric: "db.pool.waiting",
      value: waiting,
      unit: "clients",
      severity: waitingSeverity,
      details: { total, idle, max, consecutiveWaiting },
    });

    // ── Idle-leak detector (Task #5229, step 10) ─────────────────────────────
    // La probe idle-leak è async; deposita l'esito in lastIdleLeak. Qui, nel
    // ritorno sincrono, emettiamo l'alert "high" se l'ultima rilevazione è
    // recente (entro ~2 tick) e oltre soglia. Il segnale porta i PID e il numero
    // di backend terminati per la dashboard/alert del watchdog.
    if (
      lastIdleLeak &&
      Date.now() - lastIdleLeak.at < 130_000 &&
      lastIdleLeak.count >= IDLE_LEAK_THRESHOLD
    ) {
      signals.push({
        source: "db",
        metric: "db.pool.idle_leak",
        value: lastIdleLeak.count,
        unit: "conn",
        severity: "high",
        details: {
          pids: lastIdleLeak.pids,
          killed: lastIdleLeak.killed,
          minAgeS: IDLE_LEAK_MIN_AGE_S,
        },
      });
    }
  } catch (err) {
    signals.push({
      source: "db",
      metric: "db.pool.collector.error",
      severity: "warn",
      details: { error: (err as Error).message?.slice(0, 200) },
    });
  }

  // ── bg-db-limiter (cooperative background-job semaphore) ──────────────────
  try {
    const { active, queued, max, droppedOverflowTotal, droppedTimeoutTotal } = getBgDbLimiterStats();

    // Active slots in use (always emit for the metrics dashboard).
    signals.push({
      source: "db",
      metric: "db.bg_limiter.active",
      value: active,
      unit: "slots",
      severity: "info",
      details: { max },
    });

    // Queued bg jobs — a non-empty queue means background work is starved
    // waiting for a DB slot, i.e. the reserved bg budget is saturated. Escalate
    // only after N consecutive ticks to avoid blip-driven false alarms.
    if (queued > 0) {
      consecutiveLimiterQueued++;
    } else {
      consecutiveLimiterQueued = 0;
    }

    let queuedSeverity: Signal["severity"];
    if (consecutiveLimiterQueued >= CONSECUTIVE_FOR_HIGH) {
      queuedSeverity = "high";
    } else if (queued > 0 && consecutiveLimiterQueued >= CONSECUTIVE_FOR_WARN) {
      queuedSeverity = "warn";
    } else {
      queuedSeverity = "info";
    }
    signals.push({
      source: "db",
      metric: "db.bg_limiter.queued",
      value: queued,
      unit: "jobs",
      severity: queuedSeverity,
      details: { active, max, consecutiveQueued: consecutiveLimiterQueued },
    });

    // Job scartati dalla valvola di sfogo della coda (Task #4798): overflow =
    // coda piena al momento dell'acquisizione; timeout = job rimasto in coda
    // oltre il limite ed è ormai stantio. Sono contatori cumulativi dal boot:
    // li emettiamo SEMPRE come metriche (info) così la dashboard mostra i due
    // totali a colpo d'occhio.
    signals.push({
      source: "db",
      metric: "db.bg_limiter.dropped_overflow",
      value: droppedOverflowTotal,
      unit: "jobs",
      severity: "info",
    });
    signals.push({
      source: "db",
      metric: "db.bg_limiter.dropped_timeout",
      value: droppedTimeoutTotal,
      unit: "jobs",
      severity: "info",
    });

    // Delta per finestra: quanti scarti sono avvenuti dall'ultimo tick. Il
    // totale cresce monotòno, quindi il segnale d'allarme utile è la CRESCITA,
    // non il valore assoluto. Math.max(0, …) protegge dal reset dei contatori
    // (es. dopo un restart il modulo limiter riazzera i totali).
    const deltaOverflow = Math.max(0, droppedOverflowTotal - prevDroppedOverflowTotal);
    const deltaTimeout = Math.max(0, droppedTimeoutTotal - prevDroppedTimeoutTotal);
    prevDroppedOverflowTotal = droppedOverflowTotal;
    prevDroppedTimeoutTotal = droppedTimeoutTotal;
    const deltaDropped = deltaOverflow + deltaTimeout;

    if (deltaDropped > 0) {
      consecutiveLimiterDrops++;
    } else {
      consecutiveLimiterDrops = 0;
    }

    // Severità: warn quando la crescita è anomala (burst in un singolo tick o
    // scarti per 2 tick consecutivi), high quando la perdita è persistente
    // (3+ tick consecutivi con scarti) — stesso schema anti-blip degli altri
    // gauge. Senza scarti nell'ultima finestra resta info (solo metrica).
    let droppedSeverity: Signal["severity"];
    if (consecutiveLimiterDrops >= CONSECUTIVE_FOR_HIGH) {
      droppedSeverity = "high";
    } else if (
      deltaDropped > 0 &&
      (deltaDropped >= DROP_BURST_FOR_WARN || consecutiveLimiterDrops >= CONSECUTIVE_FOR_WARN)
    ) {
      droppedSeverity = "warn";
    } else {
      droppedSeverity = "info";
    }
    signals.push({
      source: "db",
      metric: "db.bg_limiter.dropped",
      value: deltaDropped,
      unit: "jobs",
      severity: droppedSeverity,
      details: {
        deltaOverflow,
        deltaTimeout,
        overflowTotal: droppedOverflowTotal,
        timeoutTotal: droppedTimeoutTotal,
        consecutiveDrops: consecutiveLimiterDrops,
      },
    });
  } catch (err) {
    signals.push({
      source: "db",
      metric: "db.bg_limiter.collector.error",
      severity: "warn",
      details: { error: (err as Error).message?.slice(0, 200) },
    });
  }

  return signals;
}

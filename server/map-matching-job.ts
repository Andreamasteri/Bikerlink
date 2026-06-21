/**
 * Map Matching Job — BikerLink Fase 2
 *
 * Job schedulato notturno (02:00 Europe/Rome) che:
 * 1. Preleva batch di sessioni ride_telemetry da processare (pending + retry sotto cap)
 * 2. Invia ogni traccia al Map Matching API di GraphHopper
 * 3. Aggrega lean_angle / gforce per osm_way_id
 * 4. Fa upsert in segment_telemetry
 * 5. Aggiorna lo stato di match sui record processati
 *
 * STATO DI RE-PROCESSABILITÀ (Task #4589):
 *   match_status ∈ { pending, retry, matched, unmatchable, exhausted } per ogni
 *   campione, allineato per-sessione. Distingue:
 *     - matched     → successo: campioni aggregati in segment_telemetry.
 *     - retry       → fallimento TRANSITORIO (es. GraphHopper down): ritentato
 *                     alle run successive con backoff e un cap di tentativi.
 *     - exhausted   → TERMINALE (Task #4706): retry che ha raggiunto il cap
 *                     tentativi. Esce dal conteggio backlog (pending+retry) così
 *                     non resta "fantasma" a vita quando l'engine è offline. NON
 *                     ritentato in automatico; ri-accodabile via requeueUnmatchable().
 *     - unmatchable → fallimento PERMANENTE per il motore attuale (<2 punti GPS o
 *                     nessun segmento restituito): non ritentato in automatico ma
 *                     ri-accodabile via requeueUnmatchable() quando la copertura migliora.
 *   Backlog effettivo = pending + retry (exhausted/unmatchable/matched esclusi).
 *   I campioni grezzi NON vengono mai cancellati: si cambia solo lo stato.
 *
 * Il job è idempotente: solo i campioni in stato pending/retry vengono aggregati,
 * e l'UPDATE è limitato agli id letti (id <= maxSampleId) per non marcare campioni
 * arrivati durante l'elaborazione.
 *
 * Configurazione:
 *   GRAPHHOPPER_URL   — URL server self-hosted (obbligatorio per il map matching in produzione)
 *   GRAPHHOPPER_TOKEN — Token auth server self-hosted
 *   MAP_MATCHING_BATCH_RIDE   — Numero massimo di ride per esecuzione (default: 50)
 *   MAP_MATCHING_MAX_ATTEMPTS — Tentativi max per le sessioni in retry (default: 5)
 *   MAP_MATCHING_RETRY_BASE_MIN — Minuti base del backoff esponenziale retry (default: 60)
 *   DISABLE_MAP_MATCHING      — Se "1", il job viene disabilitato
 *
 * Setup server GraphHopper: server/README-graphhopper.md
 * Setup Oracle Cloud Free Tier: graphhopper/setup-oracle.sh
 */

import { db, withDbRetry } from "./db";
import { withBgDbSlot } from "./lib/bg-db-limiter";
import { rideTelemetry } from "@shared/db";
import { eq, sql, and, lte, inArray } from "drizzle-orm";
import { mapMatch, isSelfHosted, GHPoint } from "./graphhopper-client";
import { isRoutingEnabled } from "./routing/routing-kill-switch";
import { isThinkCentrePoweredOff } from "./lib/thinkcentre-powered-off";
import { storage } from "./storage";

const LAST_RUN_KEY = "map_matching_last_run";
const _JOB_RUNNING_KEY = "map_matching_job_running";

/** Tentativi massimi per una sessione in retry prima di smettere di selezionarla. */
function getMaxAttempts(): number {
  const v = parseInt(process.env.MAP_MATCHING_MAX_ATTEMPTS ?? "5", 10);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

/** Minuti base del backoff esponenziale tra un retry e il successivo. */
function getRetryBaseMinutes(): number {
  const v = parseInt(process.env.MAP_MATCHING_RETRY_BASE_MIN ?? "60", 10);
  return Number.isFinite(v) && v > 0 ? v : 60;
}

let isRunning = false;

export function isMapMatchingRunning(): boolean {
  return isRunning;
}

// ─── Core job logic ────────────────────────────────────────────────────────────

export async function runMapMatchingJob(): Promise<{
  processed: number;
  skipped: number;
  retry: number;
  unmatchable: number;
  segments: number;
  errors: string[];
}> {
  if (isRunning) {
    console.warn("[MAP-MATCH] Job già in esecuzione, skip.");
    return { processed: 0, skipped: 0, retry: 0, unmatchable: 0, segments: 0, errors: ["Job already running"] };
  }

  if (!(await isRoutingEnabled())) {
    console.warn("[MAP-MATCH] Routing disabilitato via kill-switch. Job saltato.");
    return { processed: 0, skipped: 0, retry: 0, unmatchable: 0, segments: 0, errors: ["Routing kill-switch active"] };
  }
  if (!isSelfHosted && !process.env.GRAPHHOPPER_API_KEY) {
    console.warn("[MAP-MATCH] GraphHopper non configurato (né GRAPHHOPPER_URL né GRAPHHOPPER_API_KEY). Job saltato.");
    return { processed: 0, skipped: 0, retry: 0, unmatchable: 0, segments: 0, errors: ["GraphHopper not configured"] };
  }

  isRunning = true;
  const errors: string[] = [];
  let processedRides = 0;
  let totalSegmentsUpserted = 0;

  const batchSize = (() => {
    const v = parseInt(process.env.MAP_MATCHING_BATCH_RIDE ?? "50", 10);
    return Number.isFinite(v) && v > 0 ? v : 50;
  })();

  const maxAttempts = getMaxAttempts();
  const retryBaseMin = getRetryBaseMinutes();
  console.log(
    `[MAP-MATCH] Avvio job — batch max ${batchSize} ride, cap tentativi ${maxAttempts}, backoff base ${retryBaseMin}min`,
  );
  const startedAt = Date.now();
  let retryRides = 0;
  let unmatchableRides = 0;

  try {
    // Recupera le sessioni da processare: stato pending o retry, sotto il cap
    // tentativi, con backoff esponenziale (le sessioni in retry ritentano solo
    // dopo retryBaseMin * 2^(tentativi-1) minuti dall'ultimo tentativo). Le
    // sessioni 'matched' e 'unmatchable' sono escluse. Ordina per anzianità.
    // Solo la query di discovery passa dal budget connessioni dei job in
    // background: il loop per-sessione successivo alterna chiamate di rete a
    // GraphHopper, quindi non va avvolto (terrebbe uno slot per tutta la durata
    // della richiesta HTTP, riducendo il parallelismo degli altri job).
    const pendingRides = await withBgDbSlot(() => withDbRetry(() => db.execute<{ session_id: string; sample_count: string; attempts: number }>(
      sql`
        SELECT session_id, COUNT(*) AS sample_count, MAX(match_attempts)::int AS attempts
        FROM ride_telemetry
        WHERE match_status IN ('pending', 'retry')
          AND match_attempts < ${maxAttempts}
          AND (
            last_match_attempt_at IS NULL
            OR last_match_attempt_at < NOW() - (INTERVAL '1 minute' * ${retryBaseMin} * POWER(2, GREATEST(match_attempts - 1, 0)))
          )
        GROUP BY session_id
        ORDER BY MIN(ts) ASC
        LIMIT ${batchSize}
      `,
    )));

    console.log(`[MAP-MATCH] ${pendingRides.rows.length} ride da processare`);

    for (const row of pendingRides.rows) {
      const sessionId = row.session_id as string;
      const currentAttempts = Number(row.attempts ?? 0);
      try {
        // Preleva i campioni del ride (solo pending/retry) in ordine temporale.
        const samples = await db
          .select({
            id: rideTelemetry.id,
            lat: rideTelemetry.lat,
            lon: rideTelemetry.lon,
            leanAngle: rideTelemetry.leanAngle,
            gforceX: rideTelemetry.gforceX,
            gforceY: rideTelemetry.gforceY,
            gforceZ: rideTelemetry.gforceZ,
          })
          .from(rideTelemetry)
          .where(and(
            eq(rideTelemetry.sessionId, sessionId),
            inArray(rideTelemetry.matchStatus, ["pending", "retry"]),
          ))
          .orderBy(rideTelemetry.ts);

        // Limita gli UPDATE agli id letti: campioni arrivati durante
        // l'elaborazione (id > maxSampleId) restano 'pending' e verranno
        // processati alla run successiva → niente race / niente doppio conteggio.
        const maxSampleId = samples.reduce((m, s) => (s.id > m ? s.id : m), 0);
        const sessionScope = and(
          eq(rideTelemetry.sessionId, sessionId),
          inArray(rideTelemetry.matchStatus, ["pending", "retry"]),
          lte(rideTelemetry.id, maxSampleId),
        );

        // Richiede almeno 2 punti GPS per il map matching → PERMANENTE: unmatchable.
        if (samples.length < 2) {
          await db
            .update(rideTelemetry)
            .set({ matchStatus: "unmatchable", matched: false, lastMatchAttemptAt: new Date() })
            .where(sessionScope);
          unmatchableRides++;
          continue;
        }

        const points: GHPoint[] = samples.map((s) => ({ lat: s.lat!, lon: s.lon! }));

        // Chiama il Map Matching API
        const matchResult = await mapMatch(points, "motorcycle");

        // Estrai osm_way_id dai dettagli della risposta
        // Il formato è: details.osm_way_id = [[fromIdx, toIdx, wayId], ...]
        const wayIdDetails = matchResult.paths?.[0]?.details?.osm_way_id ?? [];

        if (!wayIdDetails.length) {
          // Match riuscito ma nessun segmento OSM → PERMANENTE per il motore
          // attuale: unmatchable. Ri-accodabile via requeueUnmatchable() quando
          // la copertura mappa migliora (i raw non vengono persi).
          await db
            .update(rideTelemetry)
            .set({ matchStatus: "unmatchable", matched: false, lastMatchAttemptAt: new Date() })
            .where(sessionScope);
          unmatchableRides++;
          continue;
        }

        // Aggrega lean/gforce per osm_way_id
        // Ogni entry è [startIdx, endIdx, osmWayId]
        const wayAggregates = new Map<
          number,
          { leanAngles: number[]; gforces: number[] }
        >();

        for (const [fromIdx, toIdx, wayId] of wayIdDetails) {
          if (typeof wayId !== "number") continue;
          if (!wayAggregates.has(wayId)) {
            wayAggregates.set(wayId, { leanAngles: [], gforces: [] });
          }
          const agg = wayAggregates.get(wayId)!;
          // Associa i campioni nell'intervallo [fromIdx, toIdx)
          for (let i = fromIdx; i < toIdx && i < samples.length; i++) {
            const s = samples[i];
            if (s.leanAngle != null) agg.leanAngles.push(Math.abs(s.leanAngle));
            if (s.gforceX != null || s.gforceY != null || s.gforceZ != null) {
              const gx = s.gforceX ?? 0;
              const gy = s.gforceY ?? 0;
              const gz = s.gforceZ ?? 0;
              agg.gforces.push(Math.sqrt(gx * gx + gy * gy + gz * gz));
            }
          }
        }

        // Upsert in segment_telemetry
        let segmentsUpserted = 0;
        for (const [wayId, agg] of wayAggregates) {
          if (wayId === 0) continue;
          const { leanAngles, gforces } = agg;
          if (leanAngles.length === 0 && gforces.length === 0) continue;

          const avgLean =
            leanAngles.length > 0
              ? leanAngles.reduce((a, b) => a + b, 0) / leanAngles.length
              : null;
          const maxLean = leanAngles.length > 0 ? Math.max(...leanAngles) : null;
          const avgGforce =
            gforces.length > 0
              ? gforces.reduce((a, b) => a + b, 0) / gforces.length
              : null;
          const sampleCount = Math.max(leanAngles.length, gforces.length);

          await db.execute(
            sql`
              INSERT INTO segment_telemetry (osm_way_id, avg_lean_angle, max_lean_angle, avg_gforce, sample_count, last_updated)
              VALUES (
                ${wayId},
                ${avgLean},
                ${maxLean},
                ${avgGforce},
                ${sampleCount},
                NOW()
              )
              ON CONFLICT (osm_way_id) DO UPDATE SET
                avg_lean_angle = CASE
                  WHEN ${avgLean} IS NOT NULL
                  THEN (segment_telemetry.avg_lean_angle * segment_telemetry.sample_count + ${avgLean} * ${sampleCount}) /
                       (segment_telemetry.sample_count + ${sampleCount})
                  ELSE segment_telemetry.avg_lean_angle
                END,
                max_lean_angle = CASE
                  WHEN ${maxLean} IS NOT NULL
                  THEN GREATEST(COALESCE(segment_telemetry.max_lean_angle, 0), ${maxLean})
                  ELSE segment_telemetry.max_lean_angle
                END,
                avg_gforce = CASE
                  WHEN ${avgGforce} IS NOT NULL
                  THEN (segment_telemetry.avg_gforce * segment_telemetry.sample_count + ${avgGforce} * ${sampleCount}) /
                       (segment_telemetry.sample_count + ${sampleCount})
                  ELSE segment_telemetry.avg_gforce
                END,
                sample_count = segment_telemetry.sample_count + ${sampleCount},
                last_updated = NOW()
            `,
          );
          segmentsUpserted++;
        }

        // Successo → marca i campioni letti come 'matched' (matched=true sincronizzato).
        await db
          .update(rideTelemetry)
          .set({ matchStatus: "matched", matched: true, lastMatchAttemptAt: new Date() })
          .where(sessionScope);

        totalSegmentsUpserted += segmentsUpserted;
        processedRides++;

        console.log(
          `[MAP-MATCH] Session ${sessionId} — ${samples.length} campioni → ${segmentsUpserted} segmenti OSM`,
        );
      } catch (err: unknown) {
        // Fallimento TRANSITORIO (es. GraphHopper down / timeout / errore di rete):
        // marca 'retry', incrementa il contatore e registra il tentativo. Le run
        // successive ritenteranno fino al cap (poi la sessione non viene più
        // selezionata, ma resta ri-accodabile via requeueUnmatchable()).
        const msg = err instanceof Error ? err.message : String(err);
        // Se questo tentativo porta la sessione al cap, passa allo stato TERMINALE
        // 'exhausted' (Task #4706): esce dal backlog pending+retry così non resta
        // selezionabile né conteggiata a vita. Altrimenti resta 'retry'.
        const nextStatus = currentAttempts + 1 >= maxAttempts ? "exhausted" : "retry";
        console.error(`[MAP-MATCH] Errore (${nextStatus}) su session ${sessionId}:`, msg);
        errors.push(`session ${sessionId}: ${msg.slice(0, 200)}`);
        try {
          await db
            .update(rideTelemetry)
            .set({
              matchStatus: nextStatus,
              matched: false,
              matchAttempts: sql`${rideTelemetry.matchAttempts} + 1`,
              lastMatchAttemptAt: new Date(),
            })
            .where(and(
              eq(rideTelemetry.sessionId, sessionId),
              inArray(rideTelemetry.matchStatus, ["pending", "retry"]),
            ));
        } catch (updErr: unknown) {
          const um = updErr instanceof Error ? updErr.message : String(updErr);
          console.error(`[MAP-MATCH] Impossibile marcare retry su session ${sessionId}:`, um);
        }
        retryRides++;
      }
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[MAP-MATCH] Job completato in ${elapsedSec}s — matchate: ${processedRides}, retry: ${retryRides}, unmatchable: ${unmatchableRides}, segmenti: ${totalSegmentsUpserted}`,
    );

    // Salva timestamp ultima esecuzione
    await storage.upsertAppSetting(LAST_RUN_KEY, new Date().toISOString());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[MAP-MATCH] Errore fatale nel job:", msg);
    errors.push(`Fatal: ${msg.slice(0, 200)}`);
  } finally {
    isRunning = false;
  }

  return {
    processed: processedRides,
    skipped: unmatchableRides,
    retry: retryRides,
    unmatchable: unmatchableRides,
    segments: totalSegmentsUpserted,
    errors,
  };
}

// ─── Re-match (requeue) ────────────────────────────────────────────────────────

/**
 * Riaccoda le sessioni bloccate per un nuovo tentativo di map-matching.
 * Azione admin esplicita: utile quando la copertura GraphHopper/OSM migliora.
 *
 * Riporta a 'pending' (attempts=0, matched=false, lastAttempt=NULL):
 *   - tutti i campioni 'unmatchable' (fallimento permanente per il vecchio motore);
 *   - tutti i campioni 'exhausted' (retry che hanno raggiunto il cap tentativi);
 *   - i campioni 'retry' che hanno raggiunto il cap tentativi (difesa: dovrebbero
 *     già essere 'exhausted', ma teniamo il caso legacy per le righe pre-Task #4706).
 * I campioni grezzi non vengono toccati: cambia solo lo stato.
 *
 * GUARD ThinkCentre spento (Task #4706): se la modalità powered-off è attiva,
 * l'engine self-hosted è offline → riaccodare ricreerebbe solo il backlog
 * fantasma che verrebbe ri-esaurito al prossimo giro. In quel caso NON tocchiamo
 * nulla e ritorniamo skipped:true così l'admin sa perché.
 */
export async function requeueUnmatchable(): Promise<{ requeuedSamples: number; requeuedSessions: number; skipped?: boolean; reason?: string }> {
  if (await isThinkCentrePoweredOff()) {
    console.log("[MAP-MATCH] Requeue saltato: ThinkCentre in modalità spento (engine offline).");
    return { requeuedSamples: 0, requeuedSessions: 0, skipped: true, reason: "engine_offline" };
  }
  const maxAttempts = getMaxAttempts();
  return withBgDbSlot(() => withDbRetry(async () => {
    const result = await db.execute<{ session_id: string }>(
      sql`
        UPDATE ride_telemetry
        SET match_status = 'pending',
            match_attempts = 0,
            matched = false,
            last_match_attempt_at = NULL
        WHERE match_status = 'unmatchable'
           OR match_status = 'exhausted'
           OR (match_status = 'retry' AND match_attempts >= ${maxAttempts})
        RETURNING session_id
      `,
    );
    const requeuedSamples = result.rows.length;
    const requeuedSessions = new Set(result.rows.map((r) => r.session_id)).size;
    console.log(
      `[MAP-MATCH] Requeue — ${requeuedSamples} campioni / ${requeuedSessions} sessioni riportati a 'pending'`,
    );
    return { requeuedSamples, requeuedSessions };
  }));
}

/**
 * Drena il backlog "fantasma" (Task #4706): le sessioni rimaste 'retry' che hanno
 * già raggiunto il cap tentativi ma sono state scritte PRIMA dell'introduzione
 * dello stato terminale 'exhausted'. Restavano nel conteggio pending+retry a vita
 * (la discovery le esclude via `match_attempts < cap`, ma il collector le contava)
 * tenendo alto l'allarme matching.pending anche quando non c'era nulla da fare.
 *
 * Le porta a 'exhausted' (terminale) → escono dal backlog. Non tocca i raw:
 * restano ri-accodabili via requeueUnmatchable() quando l'engine torna online.
 * Azione one-shot esplicita (admin), idempotente: rilanciarla non ha effetti
 * collaterali (la seconda volta trova 0 righe da drenare).
 */
export async function drainStuckRetryBacklog(): Promise<{ drainedSamples: number; drainedSessions: number }> {
  const maxAttempts = getMaxAttempts();
  return withBgDbSlot(() => withDbRetry(async () => {
    const result = await db.execute<{ session_id: string }>(
      sql`
        UPDATE ride_telemetry
        SET match_status = 'exhausted',
            matched = false
        WHERE match_status = 'retry'
          AND match_attempts >= ${maxAttempts}
        RETURNING session_id
      `,
    );
    const drainedSamples = result.rows.length;
    const drainedSessions = new Set(result.rows.map((r) => r.session_id)).size;
    console.log(
      `[MAP-MATCH] Drain backlog — ${drainedSamples} campioni / ${drainedSessions} sessioni 'retry' oltre il cap → 'exhausted'`,
    );
    return { drainedSamples, drainedSessions };
  }));
}

// ─── Stats helpers ─────────────────────────────────────────────────────────────

export async function getMapMatchingStats(): Promise<{
  pending: number;
  retry: number;
  matched: number;
  unmatchable: number;
  exhausted: number;
  segments: number;
  lastRun: string | null;
  isRunning: boolean;
  ghConfigured: boolean;
}> {
  const [countsResult, segResult, lastRunSetting] = await Promise.all([
    db.execute<{ match_status: string; total: string }>(
      sql`
        SELECT
          match_status,
          COUNT(*)::text AS total
        FROM ride_telemetry
        GROUP BY match_status
      `,
    ),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM segment_telemetry`),
    storage.getAppSetting(LAST_RUN_KEY),
  ]);

  let pending = 0;
  let retry = 0;
  let matched = 0;
  let unmatchable = 0;
  let exhausted = 0;
  for (const row of countsResult.rows) {
    const n = parseInt(row.total, 10);
    switch (row.match_status) {
      case "pending": pending += n; break;
      case "retry": retry += n; break;
      case "matched": matched += n; break;
      case "unmatchable": unmatchable += n; break;
      case "exhausted": exhausted += n; break;
      default: pending += n; break;
    }
  }

  const segments = parseInt(segResult.rows[0]?.count ?? "0", 10);
  const lastRun = lastRunSetting?.value ?? null;
  const ghConfigured = isSelfHosted || Boolean(process.env.GRAPHHOPPER_API_KEY);

  return { pending, retry, matched, unmatchable, exhausted, segments, lastRun, isRunning, ghConfigured };
}

/**
 * Stima ECONOMICA del backlog per il collector watchdog (Task #4706).
 *
 * Il collector gira ogni 60s: usare getMapMatchingStats() (GROUP BY su TUTTI gli
 * stati, incl. milioni di righe 'matched') ad ogni tick è costoso e contende il
 * pool. Qui contiamo solo gli stati attivi (pending+retry) — il filtro
 * `match_status IN ('pending','retry')` usa l'indice parziale su match_status,
 * quindi è O(backlog), non O(tabella).
 *
 * Difese pool (Task #4706): gira sotto withBgDbSlot (≤3 conn bg) con un
 * statement_timeout breve via SET LOCAL in transazione. Se la query va in timeout
 * o fallisce, ritorna degraded:true con backlog -1 invece di propagare l'errore →
 * il collector emette un segnale "info" (nessun falso allarme quando il DB è lento).
 */
export async function getMatchingBacklogEstimate(): Promise<{
  backlog: number;
  pending: number;
  retry: number;
  lastRun: string | null;
  degraded: boolean;
}> {
  const lastRunSetting = await storage.getAppSetting(LAST_RUN_KEY).catch(() => null);
  const lastRun = lastRunSetting?.value ?? null;
  try {
    const result = await withBgDbSlot(() => withDbRetry(() => db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '3000'`);
      return tx.execute<{ match_status: string; total: string }>(
        sql`
          SELECT match_status, COUNT(*)::text AS total
          FROM ride_telemetry
          WHERE match_status IN ('pending', 'retry')
          GROUP BY match_status
        `,
      );
    })));
    let pending = 0;
    let retry = 0;
    for (const row of result.rows) {
      const n = parseInt(row.total, 10);
      if (row.match_status === "pending") pending += n;
      else if (row.match_status === "retry") retry += n;
    }
    return { backlog: pending + retry, pending, retry, lastRun, degraded: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[MAP-MATCH] getMatchingBacklogEstimate degradato (DB lento/timeout): ${msg.slice(0, 120)}`);
    return { backlog: -1, pending: -1, retry: -1, lastRun, degraded: true };
  }
}

// ─── Nightly scheduler ─────────────────────────────────────────────────────────

function msUntilNextRomeHour(targetHour: number): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const romeH = parseInt(parts.hour ?? "0", 10);
  const romeM = parseInt(parts.minute ?? "0", 10);
  const romeS = parseInt(parts.second ?? "0", 10);
  const secondsSinceMidnight = romeH * 3600 + romeM * 60 + romeS;
  const targetSeconds = targetHour * 3600;
  let delta = targetSeconds - secondsSinceMidnight;
  if (delta <= 0) delta += 24 * 3600;
  return delta * 1000;
}

function formatRomeTime(date: Date): string {
  return date.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function scheduleNightlyMapMatching(): void {
  if (process.env.DISABLE_MAP_MATCHING === "1") {
    console.log("[MAP-MATCH] Scheduler notturno disabilitato (DISABLE_MAP_MATCHING=1).");
    return;
  }

  const TARGET_HOUR = 2; // 02:00 Europe/Rome

  const fireAndReschedule = async () => {
    try {
      await runMapMatchingJob();
    } catch (err) {
      console.error("[MAP-MATCH] Errore nel giro notturno:", err);
    }
    const delayMs = msUntilNextRomeHour(TARGET_HOUR);
    const nextAt = new Date(Date.now() + delayMs);
    console.log(
      `[MAP-MATCH] Prossima esecuzione: ${formatRomeTime(nextAt)} (Europe/Rome) — tra ${Math.round(delayMs / 60_000)} min`,
    );
    setTimeout(fireAndReschedule, delayMs);
  };

  const initialDelayMs = msUntilNextRomeHour(TARGET_HOUR);
  const firstAt = new Date(Date.now() + initialDelayMs);
  console.log(
    `[MAP-MATCH] Scheduler avviato — prima esecuzione: ${formatRomeTime(firstAt)} (Europe/Rome) — tra ${Math.round(initialDelayMs / 60_000)} min`,
  );
  setTimeout(fireAndReschedule, initialDelayMs);
}

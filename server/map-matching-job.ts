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
import { isThinkCentreOffline } from "./lib/thinkcentre-offline";
import { storage } from "./storage";
import { withSchedulerRetry, recordJobAttempt } from "./lib/scheduler-retry";
import { requeueUnmatchable } from "./map-matching-job.part2";

const LAST_RUN_KEY = "map_matching_last_run";
/** AppSetting che registra l'ULTIMO TENTATIVO (anche fallito), distinto dall'ultimo successo. */
export const MAP_MATCHING_LAST_ATTEMPT_KEY = "map_matching_last_attempt";
const _JOB_RUNNING_KEY = "map_matching_job_running";

/** Tentativi massimi per una sessione in retry prima di smettere di selezionarla. */
export function getMaxAttempts(): number {
  const v = parseInt(process.env.MAP_MATCHING_MAX_ATTEMPTS ?? "5", 10);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

export function getRetryBaseMinutes(): number {
  const v = parseInt(process.env.MAP_MATCHING_RETRY_BASE_MIN ?? "60", 10);
  return Number.isFinite(v) && v > 0 ? v : 60;
}

let isRunning = false;

export function isRunningState(): boolean {
  return isRunning;
}

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
  // ThinkCentre offline (spento O in manutenzione): il map-matching self-hosted
  // non può andare a buon fine — salta subito senza interrogare il pool né
  // attendere i timeout di rete del GraphHopper locale.
  if (isSelfHosted && (await isThinkCentreOffline())) {
    console.warn("[MAP-MATCH] ThinkCentre offline (spento o in manutenzione). Job saltato.");
    return { processed: 0, skipped: 0, retry: 0, unmatchable: 0, segments: 0, errors: ["ThinkCentre offline"] };
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
  let discoveryRetries = 0;

  try {
    // Recupera le sessioni da processare: stato pending o retry, sotto il cap
    // tentativi, con backoff esponenziale (le sessioni in retry ritentano solo
    // dopo retryBaseMin * 2^(tentativi-1) minuti dall'ultimo tentativo). Le
    // sessioni 'matched' e 'unmatchable' sono escluse. Ordina per anzianità.
    // Solo la query di discovery passa dal budget connessioni dei job in
    // background: il loop per-sessione successivo alterna chiamate di rete a
    // GraphHopper, quindi non va avvolto (terrebbe uno slot per tutta la durata
    // della richiesta HTTP, riducendo il parallelismo degli altri job).
    // La query di discovery è di SOLA LETTURA e idempotente: la avvolgiamo in
    // withSchedulerRetry (backoff + jitter) così un rigetto transitorio del
    // bg-db-limiter (kill-switch DB lento / coda piena) o un timeout pg non fa
    // abortire l'intero giro notturno in silenzio. withDbRetry resta interno per
    // gli errori pg transitori veloci; withBgDbSlot rispetta il budget connessioni.
    const pendingRides = await withSchedulerRetry(
      () => withBgDbSlot(() => withDbRetry(() => db.execute<{ session_id: string; sample_count: string; attempts: number }>(
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
      ))),
      { label: "map-matching discovery", onRetry: () => { discoveryRetries++; } },
    );

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

    // Salva timestamp ultima esecuzione (= ultimo SUCCESSO) e l'ultimo TENTATIVO ok.
    await storage.upsertAppSetting(LAST_RUN_KEY, new Date().toISOString());
    await recordJobAttempt(MAP_MATCHING_LAST_ATTEMPT_KEY, { ok: true, retries: discoveryRetries });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[MAP-MATCH] Errore fatale nel job:", msg);
    errors.push(`Fatal: ${msg.slice(0, 200)}`);
    // Anche su fallimento fatale (es. la discovery esaurisce i retry) registriamo
    // SEMPRE l'ultimo tentativo, così il guasto è visibile in admin/watchdog e non
    // resta silenzioso come accaduto col map-matching fermo da 9 giorni.
    await recordJobAttempt(MAP_MATCHING_LAST_ATTEMPT_KEY, { ok: false, retries: discoveryRetries, error: err });
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

// Re-exported from part2

// ─── Stats helpers ─────────────────────────────────────────────────────────────

export { getMapMatchingStats, getMatchingBacklogEstimate, requeueUnmatchable, drainStuckRetryBacklog } from "./map-matching-job.part2";

// ─── Nightly self-heal + run ────────────────────────────────────────────────────

/**
 * Giro notturno completo: PRIMA ri-accoda i campioni rimasti `exhausted`
 * (terminali per cap tentativi — tipicamente perché l'engine era offline)
 * riportandoli a `pending`, POI esegue il map-matching così li riprocessa nello
 * stesso giro. È il self-heal del backlog: senza questo, le sessioni esaurite
 * durante un'indisponibilità prolungata di GraphHopper restavano bloccate per
 * sempre. Il requeue è best-effort (non fa abortire il run) e logga i conteggi
 * prima/dopo. Usa la funzione esistente requeueUnmatchable().
 */
export async function runNightlyMapMatching(): Promise<void> {
  try {
    const before = await withBgDbSlot(() =>
      withSchedulerRetry(
        () => db.execute<{ exhausted: string; unmatchable: string }>(sql`
          SELECT
            COUNT(*) FILTER (WHERE match_status = 'exhausted')::text AS exhausted,
            COUNT(*) FILTER (WHERE match_status = 'unmatchable')::text AS unmatchable
          FROM ride_telemetry
        `),
        { label: "map-matching recovery count" },
      ),
    );
    const beforeExhausted = parseInt(before.rows[0]?.exhausted ?? "0", 10);
    const beforeUnmatchable = parseInt(before.rows[0]?.unmatchable ?? "0", 10);

    const result = await requeueUnmatchable();
    if (result.skipped) {
      console.log(`[MAP-MATCH] Self-heal exhausted saltato: ${result.reason}`);
    } else {
      console.log(
        `[MAP-MATCH] Self-heal exhausted→pending — prima: ${beforeExhausted} exhausted, ${beforeUnmatchable} unmatchable; ` +
          `ri-accodati ${result.requeuedSamples} campioni / ${result.requeuedSessions} sessioni a 'pending'`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[MAP-MATCH] Self-heal exhausted fallito (non fatale): ${msg.slice(0, 150)}`);
  }

  await runMapMatchingJob();
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
      await runNightlyMapMatching();
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

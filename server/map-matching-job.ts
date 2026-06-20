/**
 * Map Matching Job — BikerLink Fase 2
 *
 * Job schedulato notturno (02:00 Europe/Rome) che:
 * 1. Preleva batch di ride_telemetry non ancora matchati (matched = false)
 * 2. Invia ogni traccia al Map Matching API di GraphHopper
 * 3. Aggrega lean_angle / gforce per osm_way_id
 * 4. Fa upsert in segment_telemetry
 * 5. Aggiorna il flag matched = true sui record processati
 *
 * Il job è idempotente: i record già matchati vengono ignorati.
 * In caso di errore GraphHopper, il batch viene saltato e ritentato alla prossima esecuzione.
 *
 * Configurazione:
 *   GRAPHHOPPER_URL   — URL server self-hosted (obbligatorio per il map matching in produzione)
 *   GRAPHHOPPER_TOKEN — Token auth server self-hosted
 *   MAP_MATCHING_BATCH_RIDE — Numero massimo di ride per esecuzione (default: 50)
 *   DISABLE_MAP_MATCHING   — Se "1", il job viene disabilitato
 *
 * Setup server GraphHopper: server/README-graphhopper.md
 * Setup Oracle Cloud Free Tier: graphhopper/setup-oracle.sh
 */

import { db, withDbRetry } from "./db";
import { withBgDbSlot } from "./lib/bg-db-limiter";
import { rideTelemetry } from "@shared/db";
import { eq, sql, and } from "drizzle-orm";
import { mapMatch, isSelfHosted, GHPoint } from "./graphhopper-client";
import { isRoutingEnabled } from "./routing/routing-kill-switch";
import { storage } from "./storage";

const LAST_RUN_KEY = "map_matching_last_run";
const _JOB_RUNNING_KEY = "map_matching_job_running";

let isRunning = false;

export function isMapMatchingRunning(): boolean {
  return isRunning;
}

// ─── Core job logic ────────────────────────────────────────────────────────────

export async function runMapMatchingJob(): Promise<{
  processed: number;
  skipped: number;
  segments: number;
  errors: string[];
}> {
  if (isRunning) {
    console.warn("[MAP-MATCH] Job già in esecuzione, skip.");
    return { processed: 0, skipped: 0, segments: 0, errors: ["Job already running"] };
  }

  if (!(await isRoutingEnabled())) {
    console.warn("[MAP-MATCH] Routing disabilitato via kill-switch. Job saltato.");
    return { processed: 0, skipped: 0, segments: 0, errors: ["Routing kill-switch active"] };
  }
  if (!isSelfHosted && !process.env.GRAPHHOPPER_API_KEY) {
    console.warn("[MAP-MATCH] GraphHopper non configurato (né GRAPHHOPPER_URL né GRAPHHOPPER_API_KEY). Job saltato.");
    return { processed: 0, skipped: 0, segments: 0, errors: ["GraphHopper not configured"] };
  }

  isRunning = true;
  const errors: string[] = [];
  let processedRides = 0;
  let skippedRides = 0;
  let totalSegmentsUpserted = 0;

  const batchSize = (() => {
    const v = parseInt(process.env.MAP_MATCHING_BATCH_RIDE ?? "50", 10);
    return Number.isFinite(v) && v > 0 ? v : 50;
  })();

  console.log(`[MAP-MATCH] Avvio job — batch max ${batchSize} ride`);
  const startedAt = Date.now();

  try {
    // Recupera i ride_id distinti con campioni non ancora matchati.
    // Solo la query di discovery passa dal budget connessioni dei job in
    // background: il loop per-sessione successivo alterna chiamate di rete a
    // GraphHopper, quindi non va avvolto (terrebbe uno slot per tutta la durata
    // della richiesta HTTP, riducendo il parallelismo degli altri job).
    const pendingRides = await withBgDbSlot(() => withDbRetry(() => db.execute<{ session_id: string; sample_count: string }>(
      sql`
        SELECT session_id, COUNT(*) AS sample_count
        FROM ride_telemetry
        WHERE matched = false
        GROUP BY session_id
        ORDER BY MIN(ts) ASC
        LIMIT ${batchSize}
      `,
    )));

    console.log(`[MAP-MATCH] ${pendingRides.rows.length} ride da processare`);

    for (const row of pendingRides.rows) {
      const sessionId = row.session_id as string;
      try {
        // Preleva i campioni del ride in ordine temporale
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
          .where(and(eq(rideTelemetry.sessionId, sessionId), eq(rideTelemetry.matched, false)))
          .orderBy(rideTelemetry.ts);

        // Richiede almeno 2 punti GPS per il map matching
        if (samples.length < 2) {
          await db
            .update(rideTelemetry)
            .set({ matched: true })
            .where(eq(rideTelemetry.sessionId, sessionId));
          skippedRides++;
          continue;
        }

        const points: GHPoint[] = samples.map((s) => ({ lat: s.lat!, lon: s.lon! }));

        // Chiama il Map Matching API
        const matchResult = await mapMatch(points, "motorcycle");

        // Estrai osm_way_id dai dettagli della risposta
        // Il formato è: details.osm_way_id = [[fromIdx, toIdx, wayId], ...]
        const wayIdDetails = matchResult.paths?.[0]?.details?.osm_way_id ?? [];

        if (!wayIdDetails.length) {
          // Nessun segmento matchato — marca come matchato per evitare retry infiniti
          await db
            .update(rideTelemetry)
            .set({ matched: true })
            .where(eq(rideTelemetry.sessionId, sessionId));
          skippedRides++;
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

        // Marca i campioni del ride come matchati
        await db
          .update(rideTelemetry)
          .set({ matched: true })
          .where(eq(rideTelemetry.sessionId, sessionId));

        totalSegmentsUpserted += segmentsUpserted;
        processedRides++;

        console.log(
          `[MAP-MATCH] Session ${sessionId} — ${samples.length} campioni → ${segmentsUpserted} segmenti OSM`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[MAP-MATCH] Errore su session ${sessionId}:`, msg);
        errors.push(`session ${sessionId}: ${msg.slice(0, 200)}`);
        skippedRides++;
      }
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[MAP-MATCH] Job completato in ${elapsedSec}s — processati: ${processedRides}, saltati: ${skippedRides}, segmenti: ${totalSegmentsUpserted}`,
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
    skipped: skippedRides,
    segments: totalSegmentsUpserted,
    errors,
  };
}

// ─── Stats helpers ─────────────────────────────────────────────────────────────

export async function getMapMatchingStats(): Promise<{
  pending: number;
  matched: number;
  segments: number;
  lastRun: string | null;
  isRunning: boolean;
  ghConfigured: boolean;
}> {
  const [countsResult, segResult, lastRunSetting] = await Promise.all([
    db.execute<{ matched: string; total: string }>(
      sql`
        SELECT
          matched::text,
          COUNT(*)::text AS total
        FROM ride_telemetry
        GROUP BY matched
      `,
    ),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM segment_telemetry`),
    storage.getAppSetting(LAST_RUN_KEY),
  ]);

  let pending = 0;
  let matched = 0;
  for (const row of countsResult.rows) {
    const n = parseInt(row.total, 10);
    if (row.matched === "false") pending += n;
    else matched += n;
  }

  const segments = parseInt(segResult.rows[0]?.count ?? "0", 10);
  const lastRun = lastRunSetting?.value ?? null;
  const ghConfigured = isSelfHosted || Boolean(process.env.GRAPHHOPPER_API_KEY);

  return { pending, matched, segments, lastRun, isRunning, ghConfigured };
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

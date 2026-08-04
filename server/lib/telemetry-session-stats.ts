/**
 * Task #81 — Manutenzione incrementale del riepilogo per-sessione delle
 * distanze di telemetria (`telemetry_session_stats`).
 *
 * Sostituisce la scansione Haversine con window function (LAG per sessione) su
 * TUTTI i campioni ad ogni GET /api/telemetry/stats: qui, ad ogni batch inserito,
 * si calcolano solo i segmenti NUOVI e si accumulano nella riga della sessione.
 *
 * La formula e i filtri replicano ESATTAMENTE la query sostituita:
 *   dist = 2 * 6371 * ASIN(SQRT(
 *            SIN(RAD(Δlat)/2)^2 + COS(RAD(lat1))*COS(RAD(lat2))*SIN(RAD(Δlon)/2)^2))
 *   - un segmento è valido solo se prev e curr hanno lat/lon non-null e
 *     |Δlat| < 0.5 e |Δlon| < 0.5 (scarto salti GPS)
 *   - dist_speed_filtered somma solo i segmenti con speed_kmh NULL o >= 20
 *     (velocità del campione corrente, come nell'attribuzione LAG originale)
 *   - l'àncora del primo segmento del batch è l'ultimo campione (per ts) già
 *     visto per la sessione (last_lat/last_lon), replicando LAG(...) ORDER BY ts.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type { InsertRideTelemetry } from "@shared/db";

/**
 * Esecutore SQL: sia `db` che una transazione drizzle (`tx`) espongono
 * `.execute(...)`. Il chiamante DEVE passare la transazione che contiene anche
 * l'insert in `ride_telemetry`, così insert + riepilogo sono atomici (o entrambi
 * committati o entrambi annullati) e i totali non possono divergere.
 */
type SqlExecutor = Pick<typeof db, "execute">;

const R_KM = 6371;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

/** Delta calcolato da un batch, da accumulare nella riga di riepilogo. */
export interface SessionStatsDelta {
  deltaAll: number;
  deltaSpeedFiltered: number;
  sensorOnly: number;
  sampleCount: number;
  lastLat: number | null;
  lastLon: number | null;
  lastTs: number;
}

/**
 * Nucleo PURO (testabile senza DB) del calcolo incrementale. Dato l'ultimo
 * punto GPS già visto per la sessione (`prevLat`/`prevLon`, può essere null) e i
 * campioni del batch, restituisce i delta da sommare e la nuova àncora.
 *
 * Replica ESATTAMENTE formula e filtri della query Haversine sostituita:
 *  - segmento valido solo se prev e curr hanno lat/lon non-null e |Δ| < 0.5;
 *  - `deltaSpeedFiltered` somma solo i segmenti con speed_kmh NULL o >= 20;
 *  - l'àncora avanza al campione corrente anche se null (LAG = predecessore
 *    immediato in ordine di ts).
 */
export function computeSessionStatsDelta(
  prevLatInit: number | null,
  prevLonInit: number | null,
  rows: InsertRideTelemetry[],
): SessionStatsDelta {
  // Ordina per ts crescente per combaciare con LAG(...) OVER (ORDER BY ts).
  const sorted = [...rows].sort((a, b) => a.ts - b.ts);

  let prevLat = prevLatInit;
  let prevLon = prevLonInit;

  let deltaAll = 0;
  let deltaSpeedFiltered = 0;
  let sensorOnly = 0;

  for (const r of sorted) {
    const lat = r.lat ?? null;
    const lon = r.lon ?? null;
    if (lat == null && lon == null) sensorOnly++;

    if (
      prevLat != null &&
      prevLon != null &&
      lat != null &&
      lon != null &&
      Math.abs(lat - prevLat) < 0.5 &&
      Math.abs(lon - prevLon) < 0.5
    ) {
      const d = haversineKm(prevLat, prevLon, lat, lon);
      deltaAll += d;
      const spd = r.speedKmh ?? null;
      if (spd == null || spd >= 20) deltaSpeedFiltered += d;
    }

    // Avanza l'àncora al campione corrente anche se lat/lon sono null.
    prevLat = lat;
    prevLon = lon;
  }

  const last = sorted[sorted.length - 1];
  return {
    deltaAll,
    deltaSpeedFiltered,
    sensorOnly,
    sampleCount: sorted.length,
    lastLat: last.lat ?? null,
    lastLon: last.lon ?? null,
    lastTs: last.ts,
  };
}

/**
 * Aggiorna (o crea) la riga `telemetry_session_stats` della sessione con i
 * contributi dei campioni appena inseriti. I `rows` sono quelli effettivamente
 * salvati in `ride_telemetry` (già validati/filtrati dal chiamante).
 *
 * DEVE girare nella STESSA transazione dell'insert in `ride_telemetry`: GET
 * /api/telemetry/stats legge SOLO il riepilogo, quindi insert e riepilogo vanno
 * committati/annullati insieme o i totali divergono.
 */
export async function updateTelemetrySessionStats(
  userId: string,
  sessionId: string,
  sessionType: string,
  rows: InsertRideTelemetry[],
  executor: SqlExecutor,
): Promise<void> {
  if (rows.length === 0) return;

  // Serialize batches for the same session. Without this transaction-scoped
  // advisory lock, two concurrent uploads could read the same anchor and lose
  // distance/sample deltas while both inserts still succeed.
  await executor.execute(sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId + ":" + sessionId}, 0))
  `);

  // Àncora = ultimo campione (per ts) già visto per questa sessione. Può essere
  // null (nessun batch precedente, oppure ultimo campione sensor-only).
  const priorRes = await executor.execute(sql`
    SELECT last_lat, last_lon
    FROM telemetry_session_stats
    WHERE user_id = ${userId} AND session_id = ${sessionId}
    LIMIT 1
  `);
  const prior = priorRes.rows[0] as { last_lat: number | null; last_lon: number | null } | undefined;

  const prevLat = prior?.last_lat != null ? Number(prior.last_lat) : null;
  const prevLon = prior?.last_lon != null ? Number(prior.last_lon) : null;

  const { deltaAll, deltaSpeedFiltered, sensorOnly, sampleCount, lastLat, lastLon, lastTs } =
    computeSessionStatsDelta(prevLat, prevLon, rows);

  await executor.execute(sql`
    INSERT INTO telemetry_session_stats
      (user_id, session_id, session_type, dist_all, dist_speed_filtered,
       sample_count, sensor_only_count, last_lat, last_lon, last_ts, updated_at)
    VALUES
      (${userId}, ${sessionId}, ${sessionType}, ${deltaAll}, ${deltaSpeedFiltered},
       ${sampleCount}, ${sensorOnly}, ${lastLat}, ${lastLon}, ${lastTs}, NOW())
    ON CONFLICT (user_id, session_id) DO UPDATE SET
      dist_all = telemetry_session_stats.dist_all + EXCLUDED.dist_all,
      dist_speed_filtered = telemetry_session_stats.dist_speed_filtered + EXCLUDED.dist_speed_filtered,
      sample_count = telemetry_session_stats.sample_count + EXCLUDED.sample_count,
      sensor_only_count = telemetry_session_stats.sensor_only_count + EXCLUDED.sensor_only_count,
      last_lat = EXCLUDED.last_lat,
      last_lon = EXCLUDED.last_lon,
      last_ts = EXCLUDED.last_ts,
      updated_at = NOW()
  `);
}

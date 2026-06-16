// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { db, pool } from "../../../db";
import {
  MATCHING_REGISTRY,
  getCountableMatchingTypes,
  getRegistryPrefColumns,
} from "@shared/matching-registry";
import { getMatchingMetrics } from "../../../matching/metrics";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { sql } from "drizzle-orm";
import { getLastMatchingCycleMeta } from "../../../matching-engine";
import { getMatchingLockState, getMatchingLockStatus } from "../../../matching/scheduler";
import { getRedisStatus } from "../../../cache/redis";
import { snapshotCacheMetrics } from "../../../cache/cache-metrics";
import { getLimiterStats } from "../../../lib/throttle";
import { getQueueNames } from "../../../cache/queues";
import { getAggregate, getRecentCycles } from "../../../matching/perf-metrics";

const router = Router();

router.get("/matching/stats", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const bzRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM biker_zavorrina_matches`
      );
      const bbRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand NOT IN ('musica','musica_zav')`
      );
      const musicRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand IN ('musica','musica_zav')`
      );

      const totalZavorrinaMatches = parseInt(bzRes.rows[0]?.cnt ?? "0", 10);
      const totalBikerBikerMatches = parseInt(bbRes.rows[0]?.cnt ?? "0", 10);
      const totalMusicMatches = parseInt(musicRes.rows[0]?.cnt ?? "0", 10);
      const cycleMeta = getLastMatchingCycleMeta();
      const lastRunAt = cycleMeta?.completedAt ?? null;

      return res.json({ totalZavorrinaMatches, totalBikerBikerMatches, totalMusicMatches, lastRunAt });
    } finally {
      client.release();
    }
  } catch (_error) {
    return sendError(res, 500, "Errore lettura statistiche matching");
  }
});


// ──────────────────────────────────────────────────────────────────────────
// Task #2527 — Registry / Audit / Metrics
// ──────────────────────────────────────────────────────────────────────────

router.get("/matching/registry", (_req: Request, res: Response) => {
  return res.json({
    types: MATCHING_REGISTRY,
    totalTypes: MATCHING_REGISTRY.length,
    countableTypes: getCountableMatchingTypes().length,
  });
});

router.get("/matching/audit", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const checkedAt = new Date().toISOString();
    const issues: Array<{ severity: "error" | "warn" | "info"; category: string; message: string; details?: unknown }> = [];

    // (a) match_preferences: colonne attese vs colonne reali
    const prefCols = await client.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='match_preferences'
        AND column_name NOT IN ('id','user_id','updated_at','direct_match','top_matches_only','weekly_recap')
      ORDER BY ordinal_position
    `);
    const dbCols = new Set(prefCols.rows.map((r) => r.column_name));
    const expectedCols = new Set(getRegistryPrefColumns());
    const missingFromDb = [...expectedCols].filter((c) => !dbCols.has(c));
    const unknownInDb = [...dbCols].filter((c) => !expectedCols.has(c));
    if (missingFromDb.length > 0) {
      issues.push({
        severity: "error",
        category: "preferences",
        message: `Colonne preferenze attese mancanti nel DB: ${missingFromDb.join(", ")}`,
        details: { missingFromDb },
      });
    }
    if (unknownInDb.length > 0) {
      issues.push({
        severity: "warn",
        category: "preferences",
        message: `Colonne preferenze nel DB non presenti nel registry: ${unknownInDb.join(", ")}`,
        details: { unknownInDb },
      });
    }

    // (b) motorcycle_brand: pattern sconosciuti
    const brandsRes = await client.query<{ motorcycle_brand: string | null; cnt: string }>(`
      SELECT motorcycle_brand, COUNT(*) AS cnt FROM biker_biker_matches
      GROUP BY motorcycle_brand
    `);
    const knownPrefixes = ["club:", "club_zav:", "tipo:", "tipo_zav:", "zona_bb:", "zona_zav:", "percorso:", "percorso_zav:"];
    const knownExact = new Set(["distanza", "distanza_zav", "musica", "musica_zav", "eventi", "gps_tilt", "gps_full", "gps_speed", "gps_day"]);
    const unknownBrands: Array<{ brand: string | null; count: number }> = [];
    for (const row of brandsRes.rows) {
      const b = row.motorcycle_brand;
      const cnt = parseInt(row.cnt, 10);
      if (b == null) continue;
      if (knownExact.has(b)) continue;
      if (knownPrefixes.some((p) => b.startsWith(p))) continue;
      if (!b.includes(":") && !b.startsWith("gps_") && !b.startsWith("zona_") && !b.startsWith("percorso")) continue;
      unknownBrands.push({ brand: b, count: cnt });
    }
    if (unknownBrands.length > 0) {
      issues.push({
        severity: "warn",
        category: "brand_pattern",
        message: `${unknownBrands.length} pattern motorcycle_brand sconosciuti`,
        details: unknownBrands.slice(0, 20),
      });
    }

    // (c) Tipi nel registry senza match negli ultimi N giorni
    const orphanTypes: Array<{ key: string; label: string }> = [];
    for (const t of getCountableMatchingTypes()) {
      const r = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ${t.table} WHERE ${t.brandPattern}`
      );
      if (parseInt(r.rows[0]?.cnt ?? "0", 10) === 0) {
        orphanTypes.push({ key: t.key, label: t.label });
      }
    }
    if (orphanTypes.length > 0) {
      issues.push({
        severity: "info",
        category: "orphan_types",
        message: `${orphanTypes.length} tipi nel registry senza alcun match in DB`,
        details: orphanTypes,
      });
    }

    // (d) settings duplicati: stesse chiavi multiple in app_settings
    const dupRes = await client.query<{ key: string; cnt: string }>(`
      SELECT key, COUNT(*) AS cnt FROM app_settings GROUP BY key HAVING COUNT(*) > 1
    `);
    if (dupRes.rows.length > 0) {
      issues.push({
        severity: "error",
        category: "settings",
        message: `${dupRes.rows.length} chiavi duplicate in app_settings`,
        details: dupRes.rows,
      });
    }

    const overallStatus: "ok" | "warn" | "error" =
      issues.some((i) => i.severity === "error") ? "error" :
      issues.some((i) => i.severity === "warn") ? "warn" : "ok";

    return res.json({
      checkedAt,
      overallStatus,
      issuesCount: issues.length,
      issues,
      registryStats: {
        totalTypes: MATCHING_REGISTRY.length,
        countableTypes: getCountableMatchingTypes().length,
        expectedPrefColumns: [...expectedCols],
      },
    });
  } catch (error) {
    console.error("[admin/matching/audit] error:", error);
    return sendError(res, 500, "Errore esecuzione audit matching");
  } finally {
    client.release();
  }
});

router.get("/matching/metrics", async (_req: Request, res: Response) => {
  const metrics = await getMatchingMetrics();
  if (!metrics) {
    return res.status(503).type("text/plain").send("# prom-client non disponibile\n");
  }
  try {
    const body = await metrics.register.metrics();
    res.setHeader("Content-Type", metrics.register.contentType);
    return res.send(body);
  } catch (error) {
    console.error("[admin/matching/metrics] error:", error);
    return sendError(res, 500, "Errore serializzazione metriche");
  }
});

/**
 * Task #2510 — Verifica indici geografici PostGIS.
 * Esegue una query di prova "utenti entro 50 km da Milano" sull'indice GIST
 * di `user_profiles.geom` e riporta tempo + numero risultati + EXPLAIN ANALYZE
 * (abbreviato) per confermare l'uso dell'indice spaziale.
 */
router.get("/matching/geo-check", async (req: Request, res: Response) => {
  try {
    const lat = req.query.lat != null ? parseFloat(String(req.query.lat)) : 45.4642;  // Milano
    const lon = req.query.lon != null ? parseFloat(String(req.query.lon)) : 9.1900;
    const radiusKm = req.query.radiusKm != null ? parseFloat(String(req.query.radiusKm)) : 50;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
      return sendError(res, 400, "Parametri lat/lon/radiusKm non validi");
    }
    const radiusMeters = radiusKm * 1000;

    const postgisVersionRes = await db.execute<{ version: string }>(
      sql`SELECT PostGIS_Version() AS version`
    );
    const postgisVersion = postgisVersionRes.rows[0]?.version ?? null;

    const start = Date.now();
    const countRes = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt
      FROM user_profiles
      WHERE geom IS NOT NULL
        AND ST_DWithin(
          geom,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
    `);
    const elapsedMs = Date.now() - start;
    const matched = parseInt(countRes.rows[0]?.cnt ?? "0", 10);

    const explainRes = await db.execute<{ "QUERY PLAN": string }>(sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT user_id FROM user_profiles
      WHERE geom IS NOT NULL
        AND ST_DWithin(
          geom,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
    `);
    const planLines = explainRes.rows.map((r) => r["QUERY PLAN"]);
    const usesGistIndex = planLines.some((l) => /Index .*Scan.*user_profiles_geom_gist|Bitmap Index Scan on user_profiles_geom_gist/i.test(l));

    const indexes = await db.execute<{ tablename: string; indexname: string }>(sql`
      SELECT tablename, indexname FROM pg_indexes
      WHERE indexname LIKE '%geom_gist%'
      ORDER BY tablename, indexname
    `);

    return sendSuccess(res, {
      postgisVersion,
      query: { lat, lon, radiusKm },
      matched,
      elapsedMs,
      usesGistIndex,
      gistIndexes: indexes.rows,
      explain: planLines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return sendError(res, 500, `Errore geo-check PostGIS: ${message}`);
  }
});

router.get("/matching/lock-state", async (_req: Request, res: Response) => {
  try {
    return res.json(getMatchingLockState());
  } catch (_error) {
    return sendError(res, 500, "Errore lettura lock state");
  }
});

// Task #2517 — distributed lock status (Redis-aware).
router.get("/matching/lock-status", async (_req: Request, res: Response) => {
  try {
    const status = await getMatchingLockStatus();
    return sendSuccess(res, {
      ...status,
      legacyLocal: getMatchingLockState(),
      redis: { ...status.redis, ...getRedisStatus() },
    });
  } catch (error) {
    console.error("[admin/matching/lock-status] error:", error);
    return sendError(res, 500, "Errore lettura lock status distribuito");
  }
});

router.get("/matching/perf", async (req: Request, res: Response) => {
  try {
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
    const aggregate = getAggregate();
    const cycles = getRecentCycles(limit);
    return sendSuccess(res, {
      aggregate,
      cycles,
      lock: getMatchingLockState(),
      memory: {
        rssBytes: process.memoryUsage().rss,
      },
      cache: snapshotCacheMetrics(),
      redis: getRedisStatus(),
      limiters: getLimiterStats(),
      queues: getQueueNames(),
    });
  } catch (error) {
    console.error("[admin/matching/perf] error:", error);
    return sendError(res, 500, "Errore lettura metriche matching");
  }
});

export default router;

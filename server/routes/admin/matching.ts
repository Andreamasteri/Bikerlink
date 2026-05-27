import { Router, type Request, type Response } from "express";
import { db, pool } from "../../db";
import { gpsRejectionStats, bikerZavarrinaMatches, bikerBikerMatches, matchPreferences, matchRules, updateMatchRuleSchema } from "@shared/db";
import { sendSuccess, sendError } from "../../lib/api-response";
import { desc, eq, sql } from "drizzle-orm";
import { invalidateMatchRulesCache } from "../../matching/rules-cache";
import { triggerMatchingRun, getLastMatchingCycleMeta } from "../../matching-engine";
import { forceUnlockMatching, getMatchingLockState, getMatchingLockStatus } from "../../matching/scheduler";
import { getRedisStatus } from "../../cache/redis";
import { snapshotCacheMetrics } from "../../cache/cache-metrics";
import { getLimiterStats } from "../../lib/throttle";
import { getQueueNames } from "../../cache/queues";
import {
  getTimeProfileLabelDistribution,
  runUserTimeProfileJob,
  isTimeProfileJobRunning,
} from "../../matching/time-profile";
import { getAggregate, getRecentCycles } from "../../matching/perf-metrics";
import { adminMatchingRateLimiter } from "../../lib/rate-limiters";
import { storage } from "../../storage";
import {
  captureSchemaSnapshot,
  loadSchemaSnapshot,
  diffSchemas,
  saveSchemaSnapshot,
} from "../../scripts/snapshot-schema";

const router = Router();

// Apply rate limiter to ALL admin matching routes (Task #2509).
router.use(adminMatchingRateLimiter);

const MATCH_TYPES: Array<{
  id: number;
  key: string;
  label: string;
  table: string;
  filter: string;
  prefColumn: string;
}> = [
  { id: 1, key: "bikerBikerBrand", label: "Biker-Biker Brand", table: "biker_biker_matches", filter: "motorcycle_brand NOT LIKE '%:%' AND motorcycle_brand NOT IN ('musica','musica_zav','distanza','distanza_zav','eventi') AND motorcycle_brand NOT LIKE 'gps_%' AND motorcycle_brand NOT LIKE 'zona_%' AND motorcycle_brand NOT LIKE 'percorso%'", prefColumn: "biker_biker_brand" },
  { id: 2, key: "bikerZavorrinaBrand", label: "Biker-Zavarrina Brand", table: "biker_zavorrina_matches", filter: "1=1", prefColumn: "biker_zavorrina_brand" },
  { id: 3, key: "bikerClubBrand", label: "Biker-Club Brand", table: "biker_biker_matches", filter: "motorcycle_brand LIKE 'club:%' AND motorcycle_brand NOT LIKE 'club_zav:%'", prefColumn: "biker_club_brand" },
  { id: 4, key: "zavarrinaClubBrand", label: "Zavarrina-Club Brand", table: "biker_biker_matches", filter: "motorcycle_brand LIKE 'club_zav:%'", prefColumn: "zavorrina_club_brand" },
  { id: 5, key: "bikerBikerTypeStyle", label: "Biker-Biker Type+Style", table: "biker_biker_matches", filter: "motorcycle_brand LIKE 'tipo:%' AND motorcycle_brand NOT LIKE 'tipo_zav:%'", prefColumn: "biker_biker_type_style" },
  { id: 6, key: "bikerZavarrinaTypeStyle", label: "Biker-Zavarrina Type+Style", table: "biker_biker_matches", filter: "motorcycle_brand LIKE 'tipo_zav:%'", prefColumn: "biker_zavorrina_type_style" },
  { id: 7, key: "bikerBikerDistance", label: "Biker-Biker Distance", table: "biker_biker_matches", filter: "motorcycle_brand = 'distanza'", prefColumn: "biker_biker_distance" },
  { id: 8, key: "bikerZavarrinaDistance", label: "Biker-Zavarrina Distance", table: "biker_biker_matches", filter: "motorcycle_brand = 'distanza_zav'", prefColumn: "biker_zavorrina_distance" },
  { id: 9, key: "bikerBikerMusic", label: "Biker-Biker Music Affinity", table: "biker_biker_matches", filter: "motorcycle_brand = 'musica'", prefColumn: "biker_biker_music" },
  { id: 10, key: "bikerZavarrinaMusic", label: "Biker-Zavarrina Music Affinity", table: "biker_biker_matches", filter: "motorcycle_brand = 'musica_zav'", prefColumn: "biker_zavorrina_music" },
  { id: 11, key: "bikerBikerLeanAngle", label: "Biker-Biker Lean Angle (GPS)", table: "biker_biker_matches", filter: "motorcycle_brand IN ('gps_tilt', 'gps_full')", prefColumn: "biker_biker_lean_angle" },
  { id: 12, key: "bikerBikerRouteTypeZone", label: "Biker-Biker Route Type+Zone", table: "biker_biker_matches", filter: "motorcycle_brand LIKE 'zona_bb:%' OR motorcycle_brand LIKE 'percorso:%'", prefColumn: "biker_biker_route_type_zone" },
  { id: 13, key: "bikerZavarrinaRouteTypeZone", label: "Biker-Zavarrina Route Type+Zone", table: "biker_biker_matches", filter: "motorcycle_brand LIKE 'zona_zav:%' OR motorcycle_brand LIKE 'percorso_zav:%'", prefColumn: "biker_zavorrina_route_type_zone" },
  { id: 14, key: "bikerBikerAvgSpeed", label: "Biker-Biker Avg Speed (GPS)", table: "biker_biker_matches", filter: "motorcycle_brand IN ('gps_speed', 'gps_full')", prefColumn: "biker_biker_avg_speed" },
  { id: 15, key: "bikerBikerAvgDuration", label: "Biker-Biker Avg Duration (GPS)", table: "biker_biker_matches", filter: "motorcycle_brand IN ('gps_speed', 'gps_full')", prefColumn: "biker_biker_avg_duration" },
  { id: 16, key: "bikerBikerDayTime", label: "Biker-Biker Day+Time (GPS)", table: "biker_biker_matches", filter: "motorcycle_brand IN ('gps_day', 'gps_full')", prefColumn: "biker_biker_day_time" },
  { id: 17, key: "bikerBikerEvents", label: "Biker-Biker Events", table: "biker_biker_matches", filter: "motorcycle_brand = 'eventi'", prefColumn: "biker_biker_events" },
];

router.get("/gps-errors", async (_req: Request, res: Response) => {
  try {
    return res.json({ errors: [] });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura errori GPS");
  }
});

router.get("/gps-rejections", async (_req: Request, res: Response) => {
  try {
    const stats = await db.select().from(gpsRejectionStats).orderBy(desc(gpsRejectionStats.lastRejectedAt)).limit(100);
    return res.json(stats);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura rifiuti GPS");
  }
});

async function getMatchingStats(_req: Request, res: Response) {
  try {
    const client = await pool.connect();
    try {
      const bbRes = await client.query<{ status: string; cnt: string }>(`
        SELECT status, COUNT(*) AS cnt FROM biker_biker_matches GROUP BY status
      `);
      const bzRes = await client.query<{ status: string; cnt: string }>(`
        SELECT status, COUNT(*) AS cnt FROM biker_zavorrina_matches GROUP BY status
      `);

      const bbStats: Record<string, number> = {};
      for (const row of bbRes.rows) bbStats[row.status] = parseInt(row.cnt, 10);

      const bzStats: Record<string, number> = {};
      for (const row of bzRes.rows) bzStats[row.status] = parseInt(row.cnt, 10);

      return res.json({
        bikerBiker: {
          new: bbStats["new"] ?? 0,
          accepted: bbStats["accepted"] ?? 0,
          rejected: bbStats["rejected"] ?? 0,
          total: Object.values(bbStats).reduce((a, b) => a + b, 0),
        },
        bikerZavorrina: {
          new: bzStats["new"] ?? 0,
          accepted: bzStats["accepted"] ?? 0,
          rejected: bzStats["rejected"] ?? 0,
          total: Object.values(bzStats).reduce((a, b) => a + b, 0),
        },
      });
    } finally {
      client.release();
    }
  } catch (_error) {
    return sendError(res, 500, "Errore lettura statistiche matching");
  }
}

router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const bbRes = await client.query<{ cnt: string }>(`
        SELECT COUNT(*) AS cnt FROM biker_biker_matches
        WHERE motorcycle_brand NOT IN ('musica', 'musica_zav')
      `);
      const musicRes = await client.query<{ cnt: string }>(`
        SELECT COUNT(*) AS cnt FROM biker_biker_matches
        WHERE motorcycle_brand IN ('musica', 'musica_zav')
      `);
      const bzRes = await client.query<{ cnt: string }>(`
        SELECT COUNT(*) AS cnt FROM biker_zavorrina_matches
      `);
      const lastRunRes = await client.query<{ last_run: string | null }>(`
        SELECT MAX(created_at)::text AS last_run FROM (
          SELECT created_at FROM biker_biker_matches
          UNION ALL
          SELECT created_at FROM biker_zavorrina_matches
        ) t
      `);
      return res.json({
        totalBikerBikerMatches: parseInt(bbRes.rows[0]?.cnt ?? "0", 10),
        totalMusicMatches: parseInt(musicRes.rows[0]?.cnt ?? "0", 10),
        totalZavarrinaMatches: parseInt(bzRes.rows[0]?.cnt ?? "0", 10),
        lastRunAt: lastRunRes.rows[0]?.last_run ?? null,
      });
    } finally {
      client.release();
    }
  } catch (_error) {
    return sendError(res, 500, "Errore lettura statistiche matching");
  }
});

router.get("/matching-stats", getMatchingStats);

router.get("/match-settings", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const visibleSetting = await storage.getAppSetting("match_preferences_visible");
      const visible = visibleSetting?.value === "true";

      const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
      const autoMatchEnabled = autoMatchSetting?.value !== "false";

      const cycleMeta = getLastMatchingCycleMeta();

      const stats: Array<{
        typeKey: string;
        typeName: string;
        usersActive: number;
        totalMatches: number;
        isAnomaly: boolean;
      }> = [];

      for (const mt of MATCH_TYPES) {
        const countRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM ${mt.table} WHERE ${mt.filter}`
        );
        const totalMatches = parseInt(countRes.rows[0]?.cnt ?? "0", 10);

        const activeRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM match_preferences WHERE ${mt.prefColumn} = true`
        );
        const usersActive = parseInt(activeRes.rows[0]?.cnt ?? "0", 10);

        stats.push({
          typeKey: mt.key,
          typeName: mt.label,
          usersActive,
          totalMatches,
          isAnomaly: totalMatches === 0,
        });
      }

      return res.json({
        visible,
        autoMatchEnabled,
        cycleMeta,
        stats,
      });
    } finally {
      client.release();
    }
  } catch (_error) {
    return sendError(res, 500, "Errore lettura settings matching");
  }
});

router.get("/match-health", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const checkedAt = new Date().toISOString();
    const errors: string[] = [];
    const warns: string[] = [];

    const currentSnapshot = await captureSchemaSnapshot();
    const previousSnapshot = loadSchemaSnapshot();

    let schemaStatus = "OK";
    let schemaDiff: { addedTables: string[]; removedTables: string[]; modifiedTables: string[] } | null = null;
    let previousSnapshotAt: string | undefined;

    if (!previousSnapshot) {
      schemaStatus = "WARN";
      warns.push("Schema snapshot non trovato — verrà creato ora");
    } else {
      previousSnapshotAt = previousSnapshot.capturedAt;
      const diff = diffSchemas(previousSnapshot, currentSnapshot);
      const hasChanges = diff.addedTables.length > 0 || diff.removedTables.length > 0 || diff.modifiedTables.length > 0;
      if (hasChanges) {
        schemaDiff = {
          addedTables: diff.addedTables,
          removedTables: diff.removedTables,
          modifiedTables: diff.modifiedTables.map(t => t.tableName),
        };
        if (diff.removedTables.length > 0) {
          schemaStatus = "ERROR";
          errors.push(`Tabelle rimosse: ${diff.removedTables.join(", ")}`);
        } else {
          schemaStatus = "WARN";
          warns.push(`Schema modificato: ${[...diff.addedTables, ...diff.modifiedTables.map(t => t.tableName)].join(", ")}`);
        }
      }
    }

    const matchCounts: Array<{ id: number; key: string; label: string; count: number; status: "OK" | "WARN" }> = [];
    for (const mt of MATCH_TYPES) {
      const res = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ${mt.table} WHERE ${mt.filter}`
      );
      const count = parseInt(res.rows[0]?.cnt ?? "0", 10);
      const status: "OK" | "WARN" = count === 0 ? "WARN" : "OK";
      if (status === "WARN") warns.push(`Tipo ${mt.id} (${mt.key}): 0 match`);
      matchCounts.push({ id: mt.id, key: mt.key, label: mt.label, count, status });
    }

    const prefCols = await client.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='match_preferences'
      AND column_name NOT IN ('id','user_id','updated_at','direct_match')
      ORDER BY ordinal_position
    `);
    const dbPrefCols = new Set(prefCols.rows.map(r => r.column_name));
    const expectedPrefColumns = MATCH_TYPES.map(mt => mt.prefColumn);
    const missingFromDb = expectedPrefColumns.filter(col => !dbPrefCols.has(col));
    const unknownInDb = [...dbPrefCols].filter(col => !expectedPrefColumns.includes(col));

    let prefsStatus = "OK";
    let prefsMessage = "match_preferences allineata con i 17 tipi.";
    if (missingFromDb.length > 0) {
      prefsStatus = "ERROR";
      prefsMessage = `Colonne mancanti: ${missingFromDb.join(", ")}`;
      errors.push(prefsMessage);
    } else if (unknownInDb.length > 0) {
      prefsStatus = "WARN";
      prefsMessage = `Colonne extra nel DB: ${unknownInDb.join(", ")}`;
      warns.push(prefsMessage);
    }

    const sampleRes = await client.query<{
      b1lat: number | null; b1lng: number | null;
      b2lat: number | null; b2lng: number | null;
    }>(`
      SELECT up1.latitude AS b1lat, up1.longitude AS b1lng,
             up2.latitude AS b2lat, up2.longitude AS b2lng
      FROM biker_biker_matches m
      JOIN user_profiles up1 ON up1.user_id = m.biker1_id
      JOIN user_profiles up2 ON up2.user_id = m.biker2_id
      WHERE up1.latitude IS NOT NULL AND up1.longitude IS NOT NULL
        AND up2.latitude IS NOT NULL AND up2.longitude IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 5
    `);

    let distanceStatus = "WARN";
    let distanceMessage = "Nessun match con coordinate GPS trovato per il campione.";
    const distancesKm: number[] = [];

    if (sampleRes.rows.length > 0) {
      for (const row of sampleRes.rows) {
        if (row.b1lat == null || row.b1lng == null || row.b2lat == null || row.b2lng == null) continue;
        const R = 6371;
        const dLat = ((row.b2lat - row.b1lat) * Math.PI) / 180;
        const dLng = ((row.b2lng - row.b1lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos((row.b1lat * Math.PI) / 180) * Math.cos((row.b2lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
        distancesKm.push(Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
      }
      if (distancesKm.length > 0 && distancesKm.every(d => d >= 0)) {
        distanceStatus = "OK";
        distanceMessage = `${distancesKm.length} campioni: ${distancesKm.map(d => d + "km").join(", ")} (Haversine)`;
      } else {
        distanceMessage = "Alcune distanze non plausibili (devono essere ≥0).";
        warns.push(distanceMessage);
      }
    } else {
      warns.push("Campione distanza: nessun match con coordinate GPS");
    }

    const gateRes = await client.query<{ value: string | null }>(
      `SELECT value FROM app_settings WHERE key = 'auto_matching_enabled' LIMIT 1`
    );
    let adminGateStatus = "WARN";
    let adminGateValue: string | null = null;
    let adminGateMessage = "Chiave 'auto_matching_enabled' non trovata in app_settings.";
    if (gateRes.rows.length > 0) {
      adminGateValue = gateRes.rows[0].value ?? "true";
      adminGateStatus = "OK";
      adminGateMessage = `auto_matching_enabled = ${adminGateValue}`;
    } else {
      warns.push("admin gate 'auto_matching_enabled' non trovata");
    }

    const typesWithZeroResults = matchCounts.filter(m => m.count === 0).length;
    const overallStatus: "OK" | "WARN" | "ERROR" = errors.length > 0 ? "ERROR" : warns.length > 0 ? "WARN" : "OK";

    await saveSchemaSnapshot();

    return res.json({
      overallStatus,
      checkedAt,
      summary: {
        totalMatchTypes: MATCH_TYPES.length,
        typesWithZeroResults,
        schemaStatus,
        prefsStatus,
        distanceStatus,
        adminGateStatus,
      },
      checks: {
        schema: {
          status: schemaStatus,
          message: schemaDiff
            ? `Schema modificato: ${JSON.stringify(schemaDiff)}`
            : schemaStatus === "WARN" ? "Nessuno snapshot precedente trovato." : "Nessuna modifica rispetto all'ultima esecuzione.",
          previousSnapshotAt,
          diff: schemaDiff,
        },
        matchCounts,
        preferences: {
          status: prefsStatus,
          message: prefsMessage,
          missingFromDb,
          unknownInDb,
        },
        distanceSample: {
          status: distanceStatus,
          message: distanceMessage,
          sampleCount: distancesKm.length,
          distancesKm,
        },
        adminGate: {
          status: adminGateStatus,
          key: "auto_matching_enabled",
          value: adminGateValue,
          message: adminGateMessage,
        },
      },
    });
  } catch (error) {
    console.error("[match-health] Errore:", error);
    return sendError(res, 500, "Errore esecuzione health check");
  } finally {
    client.release();
  }
});

router.post("/match-settings/reset-all", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      UPDATE match_preferences
      SET
        biker_biker_brand = true,
        biker_zavorrina_brand = true,
        biker_club_brand = true,
        zavorrina_club_brand = true,
        biker_biker_type_style = true,
        biker_zavorrina_type_style = true,
        biker_biker_distance = true,
        biker_zavorrina_distance = true,
        biker_biker_music = true,
        biker_zavorrina_music = true,
        biker_biker_lean_angle = true,
        biker_biker_route_type_zone = true,
        biker_zavorrina_route_type_zone = true,
        biker_biker_avg_speed = true,
        biker_biker_avg_duration = true,
        biker_biker_day_time = true,
        biker_biker_events = true,
        updated_at = NOW()
    `);
    const affected = (result.rowCount as number | null) ?? 0;
    return res.json({ success: true, affected });
  } catch (_error) {
    return sendError(res, 500, "Errore reset settings matching");
  }
});

router.post("/matches/recalculate-all", async (_req: Request, res: Response) => {
  try {
    const result = triggerMatchingRun();
    return res.json(result);
  } catch (_error) {
    return sendError(res, 500, "Errore ricalcolo matching");
  }
});

router.post("/force-matching", async (_req: Request, res: Response) => {
  try {
    triggerMatchingRun();
    return sendSuccess(res, { status: "triggered" });
  } catch (_error) {
    return sendError(res, 500, "Errore avvio matching");
  }
});

router.post("/matching/trigger", async (_req: Request, res: Response) => {
  try {
    triggerMatchingRun();
    return res.json({ status: "triggered" });
  } catch (_error) {
    return sendError(res, 500, "Errore avvio matching");
  }
});

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

      const totalZavarrinaMatches = parseInt(bzRes.rows[0]?.cnt ?? "0", 10);
      const totalBikerBikerMatches = parseInt(bbRes.rows[0]?.cnt ?? "0", 10);
      const totalMusicMatches = parseInt(musicRes.rows[0]?.cnt ?? "0", 10);
      const cycleMeta = getLastMatchingCycleMeta();
      const lastRunAt = cycleMeta?.completedAt ?? null;

      return res.json({ totalZavarrinaMatches, totalBikerBikerMatches, totalMusicMatches, lastRunAt });
    } finally {
      client.release();
    }
  } catch (_error) {
    return sendError(res, 500, "Errore lettura statistiche matching");
  }
});


router.delete("/reset-matches", async (_req: Request, res: Response) => {
  try {
    const bzDeleted = await db.delete(bikerZavarrinaMatches).returning({ id: bikerZavarrinaMatches.id });
    const bbDeleted = await db.delete(bikerBikerMatches).returning({ id: bikerBikerMatches.id });
    const unlock = forceUnlockMatching();
    console.log(
      `[admin/reset-matches] biker_biker=${bbDeleted.length}, biker_zavorrina=${bzDeleted.length}, wasRunning=${unlock.wasRunning}`
    );
    return res.json({
      success: true,
      deleted: {
        bikerBiker: bbDeleted.length,
        bikerZavorrina: bzDeleted.length,
        total: bbDeleted.length + bzDeleted.length,
      },
      unlock,
    });
  } catch (error) {
    console.error("[admin/reset-matches] error:", error);
    return sendError(res, 500, "Errore reset match");
  }
});

router.post("/matching/force-unlock", async (_req: Request, res: Response) => {
  try {
    const before = getMatchingLockState();
    const unlock = forceUnlockMatching();
    return res.json({ success: true, before, unlock });
  } catch (error) {
    console.error("[admin/matching/force-unlock] error:", error);
    return sendError(res, 500, "Errore force-unlock matching");
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

router.get("/matching/debug", async (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : null;
    if (!userId) return sendError(res, 400, "userId richiesto come query param");

    const { users: usersTable, userMotorcycles, zavarrinaWishlists, zavarrinaWishlistMotos } = await import("@shared/db");
    const { eq, and, isNotNull } = await import("drizzle-orm");
    const { systemAccountConditions } = await import("../../lib/system-account-filter");

    const targetUser = await db.select({
      id: usersTable.id,
      nickname: usersTable.nickname,
      userType: usersTable.userType,
      isFake: usersTable.isFake,
      status: usersTable.status,
      ghostMode: usersTable.ghostMode,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (targetUser.length === 0) return sendError(res, 404, "Utente non trovato");
    const user = targetUser[0];

    const filters: Record<string, { passed: number; rejected: number; reason?: string }> = {};

    const myMotorcycles = await db.select().from(userMotorcycles).where(eq(userMotorcycles.userId, userId));
    const myWishlistRows = await db.select().from(zavarrinaWishlists).where(eq(zavarrinaWishlists.userId, userId)).limit(1);
    const myWishlistMotos = myWishlistRows[0]
      ? await db.select().from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.wishlistId, myWishlistRows[0].id))
      : [];

    const allCandidatesRaw = await db.select({
      id: usersTable.id,
      nickname: usersTable.nickname,
      userType: usersTable.userType,
      isFake: usersTable.isFake,
      status: usersTable.status,
      ghostMode: usersTable.ghostMode,
      role: usersTable.role,
    }).from(usersTable)
      .where(and(
        isNotNull(usersTable.id),
      ));

    const totalCandidates = allCandidatesRaw.length;
    filters["total"] = { passed: totalCandidates, rejected: 0 };

    const afterSelfFilter = allCandidatesRaw.filter(c => c.id !== userId);
    filters["self_excluded"] = { passed: afterSelfFilter.length, rejected: totalCandidates - afterSelfFilter.length, reason: "same user" };

    const afterFakeFilter = afterSelfFilter.filter(c => !c.isFake);
    filters["is_fake=false"] = { passed: afterFakeFilter.length, rejected: afterSelfFilter.length - afterFakeFilter.length, reason: "isFake=true" };

    const afterStatusFilter = afterFakeFilter.filter(c => c.status === "active");
    filters["status=active"] = { passed: afterStatusFilter.length, rejected: afterFakeFilter.length - afterStatusFilter.length, reason: "status != active" };

    const afterGhostFilter = afterStatusFilter.filter(c => !c.ghostMode);
    filters["ghostMode=false"] = { passed: afterGhostFilter.length, rejected: afterStatusFilter.length - afterGhostFilter.length, reason: "ghostMode=true" };

    const afterSystemFilter = afterGhostFilter.filter(c => !["admin", "moderator"].includes(c.role ?? ""));
    filters["system_excluded"] = { passed: afterSystemFilter.length, rejected: afterGhostFilter.length - afterSystemFilter.length, reason: "admin/system account" };

    const bikerCandidates = afterSystemFilter.filter(c => c.userType === "biker" || c.userType === "coppia");
    const zavCandidates = afterSystemFilter.filter(c => c.userType === "zavorrina");

    const myMoto = myMotorcycles[0];
    const myWish = myWishlistMotos[0];

    const [myPrefsRow] = await db.select().from(matchPreferences).where(eq(matchPreferences.userId, userId)).limit(1).catch(() => [undefined]);
    const { DEFAULT_PREFS } = await import("../match-preferences");
    const myPrefs = myPrefsRow ?? DEFAULT_PREFS;
    const disabledPrefs = Object.entries(myPrefs)
      .filter(([k, v]) => k !== "id" && k !== "userId" && k !== "createdAt" && k !== "updatedAt" && v === false)
      .map(([k]) => k);

    const candidateMotorcycles = myMoto
      ? await db.select({ motorcycle: userMotorcycles, userId: userMotorcycles.userId })
          .from(userMotorcycles)
          .innerJoin(usersTable, eq(usersTable.id, userMotorcycles.userId))
          .where(and(
            eq(usersTable.isFake, false),
            eq(usersTable.status, "active"),
            ...systemAccountConditions(usersTable),
          ))
      : [];

    const candidateMotosFiltered = candidateMotorcycles.filter(cm =>
      afterSystemFilter.some(c => c.id === cm.userId)
    );

    const brandMatches: string[] = [];
    const typeMatches: string[] = [];

    for (const cm of candidateMotosFiltered) {
      if (cm.userId === userId) continue;
      if (myMoto?.brand && cm.motorcycle.brand && myMoto.brand.toLowerCase() === cm.motorcycle.brand.toLowerCase()) {
        brandMatches.push(cm.userId);
      } else if (myMoto?.motorcycleType && cm.motorcycle.motorcycleType && myMoto.motorcycleType.toLowerCase() === cm.motorcycle.motorcycleType.toLowerCase()) {
        typeMatches.push(cm.userId);
      }
    }

    const top5BrandMatches = brandMatches.slice(0, 5).map(uid => {
      const c = afterSystemFilter.find(x => x.id === uid);
      return { userId: uid, nickname: c?.nickname ?? uid, matchType: "brand", matchValue: myMoto?.brand };
    });
    const top5TypeMatches = typeMatches.slice(0, 5).map(uid => {
      const c = afterSystemFilter.find(x => x.id === uid);
      return { userId: uid, nickname: c?.nickname ?? uid, matchType: "motorcycleType", matchValue: myMoto?.motorcycleType };
    });
    const top5 = [...top5BrandMatches, ...top5TypeMatches].slice(0, 5);

    const afterBrandPref = myPrefs.bikerBikerBrand || myPrefs.bikerZavorrinaBrand ? brandMatches.length : 0;
    const afterTypePref = myPrefs.bikerBikerTypeStyle || myPrefs.bikerZavarrinaTypeStyle ? typeMatches.length : 0;

    filters["pref_brand_match"] = {
      passed: myPrefs.bikerBikerBrand || myPrefs.bikerZavorrinaBrand ? brandMatches.length : 0,
      rejected: (!myPrefs.bikerBikerBrand && !myPrefs.bikerZavorrinaBrand) ? brandMatches.length : 0,
      reason: (!myPrefs.bikerBikerBrand && !myPrefs.bikerZavorrinaBrand) ? "bikerBikerBrand + bikerZavorrinaBrand disabled" : undefined,
    };
    filters["pref_type_style_match"] = {
      passed: myPrefs.bikerBikerTypeStyle || myPrefs.bikerZavarrinaTypeStyle ? typeMatches.length : 0,
      rejected: (!myPrefs.bikerBikerTypeStyle && !myPrefs.bikerZavarrinaTypeStyle) ? typeMatches.length : 0,
      reason: (!myPrefs.bikerBikerTypeStyle && !myPrefs.bikerZavarrinaTypeStyle) ? "bikerBikerTypeStyle + bikerZavarrinaTypeStyle disabled" : undefined,
    };

    return res.json({
      user: { id: user.id, nickname: user.nickname, userType: user.userType, isFake: user.isFake, status: user.status, ghostMode: user.ghostMode },
      myMotorcycle: myMoto ?? null,
      myWishlistMoto: myWish ?? null,
      filters,
      candidateCounts: {
        total: totalCandidates,
        afterFilters: afterSystemFilter.length,
        bikers: bikerCandidates.length,
        zavorrine: zavCandidates.length,
        withMatchingBrand: brandMatches.length,
        withMatchingType: typeMatches.length,
        effectiveBrandMatches: afterBrandPref,
        effectiveTypeMatches: afterTypePref,
      },
      matchPreferences: {
        hasCustomRow: !!myPrefsRow,
        disabledPrefTypes: disabledPrefs,
        allPrefs: myPrefs,
      },
      top5Matches: top5,
    });
  } catch (_error) {
    console.error("[admin] matching debug error:", _error);
    return sendError(res, 500, "Errore debug matching");
  }
});

router.get("/notifications/stats", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const perPriorityRes = await client.query<{ day: string; priority: string; cnt: string }>(`
        SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
               notification_priority AS priority,
               COUNT(*) AS cnt
          FROM (
            SELECT created_at, notification_priority FROM biker_zavorrina_matches
            UNION ALL
            SELECT created_at, notification_priority FROM biker_biker_matches
            UNION ALL
            SELECT created_at, notification_priority FROM proposal_matches
            UNION ALL
            SELECT created_at, notification_priority FROM proposal_profile_matches
          ) s
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY day, priority
         ORDER BY day DESC, priority
      `);

      const budgetExhaustedRes = await client.query<{ day: string; users: string }>(`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, COUNT(*) AS users
          FROM daily_push_counts
         WHERE individual_count >= 3
           AND day >= (CURRENT_DATE - INTERVAL '7 days')
         GROUP BY day
         ORDER BY day DESC
      `);

      // Pending = participants of match rows at this priority WITHOUT an
      // entry in match_notification_deliveries. Mirrors the dispatcher logic.
      const pendingRes = await client.query<{ priority: string; cnt: string }>(`
        WITH participants AS (
          SELECT notification_priority AS priority, 'biker_zavorrina_matches' AS t, id::text AS mid, biker_id AS uid FROM biker_zavorrina_matches
          UNION ALL
          SELECT notification_priority, 'biker_zavorrina_matches', id::text, zavorrina_id FROM biker_zavorrina_matches
          UNION ALL
          SELECT notification_priority, 'biker_biker_matches', id::text, biker1_id FROM biker_biker_matches
          UNION ALL
          SELECT notification_priority, 'biker_biker_matches', id::text, biker2_id FROM biker_biker_matches
          UNION ALL
          SELECT notification_priority, 'proposal_matches', id::text, user_id_1 FROM proposal_matches
          UNION ALL
          SELECT notification_priority, 'proposal_matches', id::text, user_id_2 FROM proposal_matches
          UNION ALL
          SELECT notification_priority, 'proposal_profile_matches', id::text, biker_id FROM proposal_profile_matches
          UNION ALL
          SELECT notification_priority, 'proposal_profile_matches', id::text, zavorrina_id FROM proposal_profile_matches
        )
        SELECT priority, COUNT(*)::text AS cnt
          FROM participants p
         WHERE p.uid IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM match_notification_deliveries d
              WHERE d.match_table = p.t AND d.match_id = p.mid AND d.user_id = p.uid
           )
         GROUP BY priority
      `);

      return res.json({
        perPriorityPerDay: perPriorityRes.rows.map(r => ({
          day: r.day,
          priority: r.priority,
          count: parseInt(r.cnt, 10),
        })),
        budgetExhaustedPerDay: budgetExhaustedRes.rows.map(r => ({
          day: r.day,
          users: parseInt(r.users, 10),
        })),
        pendingByPriority: Object.fromEntries(
          pendingRes.rows.map(r => [r.priority, parseInt(r.cnt, 10)])
        ),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[admin] notifications stats error:", error);
    return sendError(res, 500, "Errore stats notifiche");
  }
});

router.get("/time-profile-distribution", async (_req: Request, res: Response) => {
  try {
    const data = await getTimeProfileLabelDistribution();
    return res.json(data);
  } catch (err) {
    console.error("[admin] time-profile-distribution error:", err);
    return sendError(res, 500, "Errore lettura distribuzione profili orari");
  }
});

router.post("/time-profile/run", async (_req: Request, res: Response) => {
  if (isTimeProfileJobRunning()) {
    return res.status(409).json({ message: "Job profilo orario già in esecuzione." });
  }
  runUserTimeProfileJob().catch((err) =>
    console.error("[admin/time-profile/run] background error:", err)
  );
  return sendSuccess(res, { started: true });
});

router.get("/weights-distribution", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const fbRes = await client.query<{ feature_key: string; action: string; cnt: string }>(`
        SELECT feature_key, action, COUNT(*) AS cnt
        FROM match_feedback
        GROUP BY feature_key, action
      `);
      const byFeature: Record<string, { accepts: number; rejects: number; ignores: number; total: number; acceptRate: number }> = {};
      for (const row of fbRes.rows) {
        const fk = row.feature_key;
        if (!byFeature[fk]) byFeature[fk] = { accepts: 0, rejects: 0, ignores: 0, total: 0, acceptRate: 0 };
        const n = parseInt(row.cnt, 10);
        byFeature[fk].total += n;
        if (row.action === "accept") byFeature[fk].accepts += n;
        else if (row.action === "reject" || row.action === "block") byFeature[fk].rejects += n;
        else if (row.action === "ignore") byFeature[fk].ignores += n;
      }
      for (const k of Object.keys(byFeature)) {
        const v = byFeature[k];
        const decisive = v.accepts + v.rejects;
        v.acceptRate = decisive > 0 ? Math.round((v.accepts / decisive) * 1000) / 1000 : 0;
      }

      const profilesRes = await client.query<{
        feedback_count: string;
        weights: Record<string, number>;
      }>(`
        SELECT feedback_count, feature_weights AS weights FROM user_match_profile
      `);
      const totalProfiles = profilesRes.rows.length;
      const profilesWithPersonalization = profilesRes.rows.filter(p => parseInt(p.feedback_count, 10) >= 10).length;

      const weightAggregates: Record<string, { values: number[]; mean: number; min: number; max: number }> = {};
      for (const row of profilesRes.rows) {
        const w = row.weights || {};
        for (const [fk, val] of Object.entries(w)) {
          if (typeof val !== "number") continue;
          if (!weightAggregates[fk]) weightAggregates[fk] = { values: [], mean: 0, min: val, max: val };
          weightAggregates[fk].values.push(val);
          if (val < weightAggregates[fk].min) weightAggregates[fk].min = val;
          if (val > weightAggregates[fk].max) weightAggregates[fk].max = val;
        }
      }
      for (const k of Object.keys(weightAggregates)) {
        const vs = weightAggregates[k].values;
        weightAggregates[k].mean = vs.length > 0
          ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 1000) / 1000
          : 0;
      }

      return res.json({
        totalProfiles,
        profilesWithPersonalization,
        coldStartThreshold: 10,
        globalAcceptRates: byFeature,
        personalWeightAggregates: Object.fromEntries(
          Object.entries(weightAggregates).map(([k, v]) => [k, { mean: v.mean, min: v.min, max: v.max, sampleSize: v.values.length }]),
        ),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[admin] weights-distribution error:", error);
    return sendError(res, 500, "Errore lettura distribuzione pesi matching");
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Match Rules (Task #2511) — configurable compatibility matrix.
// GET lists all pairs; PATCH updates a single rule and invalidates the cache.
// ──────────────────────────────────────────────────────────────────────────
router.get("/match-rules", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(matchRules).orderBy(matchRules.searchTypeA, matchRules.searchTypeB);
    return res.json({ rules: rows });
  } catch (err) {
    console.error("[admin] GET /match-rules error:", err);
    return sendError(res, 500, "Errore lettura match rules");
  }
});

router.patch("/match-rules/:id", async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id: string | null = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? (rawId[0] ?? null) : null;
    if (!id) return sendError(res, 400, "ID mancante");
    const parsed = updateMatchRuleSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.compatible !== undefined) updates.compatible = parsed.data.compatible;
    if (parsed.data.weight !== undefined) updates.weight = parsed.data.weight;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    const [updated] = await db.update(matchRules).set(updates).where(eq(matchRules.id, id)).returning();
    if (!updated) return sendError(res, 404, "Regola non trovata");
    invalidateMatchRulesCache();
    return res.json({ rule: updated });
  } catch (err) {
    console.error("[admin] PATCH /match-rules/:id error:", err);
    return sendError(res, 500, "Errore aggiornamento regola");
  }
});

export default router;

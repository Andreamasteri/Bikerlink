import { Router, type Request, type Response } from "express";
import { db, pool } from "../../db";
import { gpsRejectionStats, bikerZavarrinaMatches, bikerBikerMatches } from "@shared/db";
import { sendSuccess, sendError } from "../../lib/api-response";
import { desc, sql } from "drizzle-orm";
import { triggerMatchingRun, getLastMatchingCycleMeta } from "../../matching-engine";
import { storage } from "../../storage";
import {
  captureSchemaSnapshot,
  loadSchemaSnapshot,
  diffSchemas,
  saveSchemaSnapshot,
} from "../../scripts/snapshot-schema";

const router = Router();

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

router.post("/trigger", async (_req: Request, res: Response) => {
  try {
    triggerMatchingRun();
    return sendSuccess(res, { status: "triggered" });
  } catch (_error) {
    return sendError(res, 500, "Errore avvio matching");
  }
});

router.delete("/reset-matches", async (_req: Request, res: Response) => {
  try {
    await db.delete(bikerZavarrinaMatches);
    await db.delete(bikerBikerMatches);
    return sendSuccess(res);
  } catch (_error) {
    return sendError(res, 500, "Errore reset match");
  }
});

export default router;

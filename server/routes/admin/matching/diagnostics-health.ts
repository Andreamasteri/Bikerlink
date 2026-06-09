// Estratto meccanico da diagnostics.ts per rispettare il gate ratchet 600 righe.
// Contiene: GET /match-health e GET /real-users-matchability
// Montato in diagnostics.ts tramite router.use(healthRouter).
import { Router, type Request, type Response } from "express";
import { pool } from "../../../db";
import { sendError } from "../../../lib/api-response";
import {
  captureSchemaSnapshot,
  loadSchemaSnapshot,
  diffSchemas,
  saveSchemaSnapshot,
} from "../../../scripts/snapshot-schema";
import type { SourceFamily } from "./diagnostics";
import {
  MATCH_TYPES,
  SOURCE_PROBES,
  SOURCE_FAMILY_BY_ID,
  INACTIVE_TYPE_IDS,
} from "./diagnostics";

const healthRouter = Router();

healthRouter.get("/match-health", async (_req: Request, res: Response) => {
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

    const sourceCounts = new Map<SourceFamily, number>();
    for (const [fam, probe] of Object.entries(SOURCE_PROBES) as [SourceFamily, typeof SOURCE_PROBES[SourceFamily]][]) {
      try {
        const r = await client.query<{ cnt: string }>(probe.sql);
        sourceCounts.set(fam, parseInt(r.rows[0]?.cnt ?? "0", 10));
      } catch (e) {
        console.error(`[match-health] source probe '${fam}' fallita:`, e);
        sourceCounts.set(fam, -1);
      }
    }

    const matchCounts: Array<{
      id: number; key: string; label: string; count: number;
      sourceCount: number; status: "OK" | "WARN" | "NO_DATA" | "INACTIVE";
    }> = [];
    for (const mt of MATCH_TYPES) {
      const r = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ${mt.table} WHERE ${mt.filter}`
      );
      const count = parseInt(r.rows[0]?.cnt ?? "0", 10);

      if (INACTIVE_TYPE_IDS.has(mt.id) && count === 0) {
        matchCounts.push({ id: mt.id, key: mt.key, label: mt.label, count, sourceCount: 0, status: "INACTIVE" });
        continue;
      }

      const fam = SOURCE_FAMILY_BY_ID[mt.id];
      const rawSource = fam ? (sourceCounts.get(fam) ?? 0) : 0;
      const probeMin = fam ? SOURCE_PROBES[fam].min : 1;
      const hasSource = rawSource < 0 ? true : rawSource >= probeMin;
      let status: "OK" | "WARN" | "NO_DATA" | "INACTIVE";
      if (count > 0) {
        status = "OK";
      } else if (hasSource) {
        status = "WARN";
      } else {
        status = "NO_DATA";
      }
      if (status === "WARN") {
        warns.push(
          `Tipo ${mt.id} (${mt.key}): 0 match nonostante ${rawSource < 0 ? "?" : rawSource} sorgenti idonee`
        );
      }
      matchCounts.push({ id: mt.id, key: mt.key, label: mt.label, count, sourceCount: Math.max(0, rawSource), status });
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

    const realUsersRes = await client.query<{ cnt: string }>(`
      SELECT COUNT(*)::int AS cnt FROM users
      WHERE is_fake = false AND is_system = false AND role <> 'admin' AND status = 'active'
    `);
    const realUsersTotal = parseInt(realUsersRes.rows[0]?.cnt ?? "0", 10);

    const missingPrefsRes = await client.query<{ cnt: string }>(`
      SELECT COUNT(*)::int AS cnt FROM users u
      LEFT JOIN match_preferences mp ON mp.user_id = u.id
      WHERE u.is_fake = false AND u.is_system = false AND u.role <> 'admin'
        AND u.status = 'active' AND mp.id IS NULL
    `);
    const missingPrefs = parseInt(missingPrefsRes.rows[0]?.cnt ?? "0", 10);

    const missingCoordsRes = await client.query<{ cnt: string }>(`
      SELECT COUNT(*)::int AS cnt FROM users u
      INNER JOIN user_profiles up ON up.user_id = u.id
      WHERE u.is_fake = false AND u.is_system = false AND u.role <> 'admin'
        AND u.status = 'active' AND (up.latitude IS NULL OR up.longitude IS NULL)
    `);
    const missingCoords = parseInt(missingCoordsRes.rows[0]?.cnt ?? "0", 10);

    const missingMotosRes = await client.query<{ cnt: string }>(`
      SELECT COUNT(*)::int AS cnt FROM users u
      LEFT JOIN user_motorcycles um ON um.user_id = u.id
      WHERE u.is_fake = false AND u.is_system = false AND u.role <> 'admin'
        AND u.status = 'active' AND um.id IS NULL
    `);
    const missingMotos = parseInt(missingMotosRes.rows[0]?.cnt ?? "0", 10);

    if (missingPrefs > 0) {
      warns.push(`${missingPrefs} utenti reali privi di match_preferences — eseguire il backfill`);
    }
    if (missingCoords > 0) {
      warns.push(`${missingCoords} utenti reali privi di coordinate GPS — eseguire il backfill`);
    }

    const typesWithZeroResults = matchCounts.filter(m => m.count === 0).length;
    const typesAnomalous = matchCounts.filter(m => m.status === "WARN").length;
    const typesNoData = matchCounts.filter(m => m.status === "NO_DATA").length;
    const typesInactive = matchCounts.filter(m => m.status === "INACTIVE").length;
    const overallStatus: "OK" | "WARN" | "ERROR" = errors.length > 0 ? "ERROR" : warns.length > 0 ? "WARN" : "OK";

    await saveSchemaSnapshot();

    return res.json({
      overallStatus,
      checkedAt,
      summary: {
        totalMatchTypes: MATCH_TYPES.length,
        typesWithZeroResults,
        typesAnomalous,
        typesNoData,
        typesInactive,
        schemaStatus,
        prefsStatus,
        distanceStatus,
        adminGateStatus,
        realUsers: { total: realUsersTotal, missingPrefs, missingCoords, missingMotos },
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
        preferences: { status: prefsStatus, message: prefsMessage, missingFromDb, unknownInDb },
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

/**
 * GET /api/admin/matching/real-users-matchability
 *
 * Report degli utenti reali non matchabili con il motivo.
 */
healthRouter.get("/real-users-matchability", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const rows = await client.query<{
      user_id: string;
      nickname: string;
      email: string;
      user_type: string;
      status: string;
      has_prefs: boolean;
      has_coords: boolean;
      has_motos: boolean;
      has_tags: boolean;
    }>(`
      SELECT
        u.id                                            AS user_id,
        u.nickname,
        u.email,
        u.user_type,
        u.status,
        (mp.id IS NOT NULL)                             AS has_prefs,
        (up.latitude IS NOT NULL AND up.longitude IS NOT NULL) AS has_coords,
        (COUNT(DISTINCT um.id) > 0)                    AS has_motos,
        (COUNT(DISTINCT et.id) > 0)                    AS has_tags
      FROM users u
      LEFT JOIN match_preferences mp ON mp.user_id = u.id
      LEFT JOIN user_profiles     up ON up.user_id = u.id
      LEFT JOIN user_motorcycles  um ON um.user_id = u.id
      LEFT JOIN entity_tags       et ON et.entity_id = u.id AND et.entity_type = 'user'
      WHERE u.is_fake  = false
        AND u.is_system = false
        AND u.role <> 'admin'
        AND u.status = 'active'
      GROUP BY u.id, u.nickname, u.email, u.user_type, u.status, mp.id, up.latitude, up.longitude
      ORDER BY u.nickname
    `);

    const users_list = rows.rows.map((r) => {
      const reasons: string[] = [];
      if (!r.has_prefs)  reasons.push("no_preferences");
      if (!r.has_coords) reasons.push("no_coordinates");
      if (!r.has_motos)  reasons.push("no_motorcycles");
      if (!r.has_tags)   reasons.push("no_tags");
      return {
        userId: r.user_id,
        nickname: r.nickname,
        email: r.email,
        userType: r.user_type,
        status: r.status,
        hasPrefs: r.has_prefs,
        hasCoords: r.has_coords,
        hasMotos: r.has_motos,
        hasTags: r.has_tags,
        matchable: reasons.length === 0,
        reasons,
      };
    });

    const total = users_list.length;
    const matchable = users_list.filter(u => u.matchable).length;
    const notMatchable = users_list.filter(u => !u.matchable);

    return res.json({
      summary: { total, matchable, notMatchable: total - matchable },
      users: users_list,
      nonMatchableUsers: notMatchable,
    });
  } catch (error) {
    console.error("[real-users-matchability] error:", error);
    return sendError(res, 500, "Errore report matchabilità utenti reali");
  } finally {
    client.release();
  }
});

export default healthRouter;

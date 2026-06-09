// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { db, pool } from "../../../db";
import { gpsRejectionStats } from "@shared/db";
import {
  getCountableMatchingTypes,
} from "@shared/matching-registry";
import { sendError } from "../../../lib/api-response";
import { desc } from "drizzle-orm";
import { getLastMatchingCycleMeta } from "../../../matching-engine";
import { storage } from "../../../storage";
import {
  captureSchemaSnapshot,
  loadSchemaSnapshot,
  diffSchemas,
  saveSchemaSnapshot,
} from "../../../scripts/snapshot-schema";

const router = Router();

// Task #2527 — i tipi sono ora nel registry centralizzato (`shared/matching-registry.ts`).
// `MATCH_TYPES` rimane come adapter di sola lettura per non rompere i call-site
// esistenti: espone gli stessi campi `{id,key,label,table,filter,prefColumn}` ma
// derivati dalla sorgente unica.
const MATCH_TYPES: ReadonlyArray<{
  id: number;
  key: string;
  label: string;
  table: string;
  filter: string;
  prefColumn: string;
}> = getCountableMatchingTypes().map((t) => ({
  id: t.id,
  key: t.key,
  label: t.label,
  table: t.table as string,
  filter: t.brandPattern as string,
  prefColumn: t.prefColumn,
}));

// ── Source-data probes ──────────────────────────────────────────────────────
// Ogni matcher (run-*.ts) produce 0 risultati per due ragioni MOLTO diverse:
//   1. NESSUN dato sorgente idoneo nel DB → 0 è corretto e atteso (NO_DATA).
//   2. Dati sorgente presenti ma il matcher non crea nulla → vera anomalia (WARN).
// Senza distinguere i due casi l'admin vede 17 "anomalie" su un DB privo di dati.
// Le sonde sotto contano le entità sorgente idonee per "famiglia" di matcher;
// `min` è il minimo perché un match sia anche solo possibile (i matcher a coppie
// richiedono ≥2 entità; le sonde che contano già coppie compatibili usano min=1).
type SourceFamily =
  | "brand" | "wishlist" | "club" | "motoTags" | "motoTagsZav"
  | "routeCentroid" | "musicTags" | "routeTelemetry" | "routeSpeed" | "events";

// Tipi senza alcun matcher che li produca (legacy/non eseguiti dallo scheduler):
// nessun run-*.ts genera la stringa `club_zav:%`. Vanno marcati INACTIVE così
// non producono mai un falso WARN quando esistono dati club nel DB.
const INACTIVE_TYPE_IDS: ReadonlySet<number> = new Set([4]);

const SOURCE_FAMILY_BY_ID: Readonly<Record<number, SourceFamily>> = {
  1: "brand",
  2: "wishlist",
  3: "club",
  4: "club",
  5: "motoTags",
  6: "motoTagsZav",
  7: "routeCentroid",
  8: "routeCentroid",
  9: "musicTags",
  10: "musicTags",
  11: "routeTelemetry",
  12: "routeSpeed",
  13: "routeSpeed",
  14: "routeTelemetry",
  15: "routeTelemetry",
  16: "routeTelemetry",
  17: "events",
};

const SOURCE_PROBES: Readonly<Record<SourceFamily, { min: number; desc: string; sql: string }>> = {
  brand: {
    min: 1,
    desc: "utenti biker in un bucket-brand con ≥2 proprietari",
    sql: `
      SELECT COALESCE(SUM(c),0)::int AS cnt FROM (
        SELECT COUNT(DISTINCT um.user_id) c
        FROM user_motorcycles um
        JOIN users u ON u.id = um.user_id
        WHERE u.is_fake = false AND u.status = 'active'
          AND u.user_type IN ('biker','coppia')
          AND um.brand IS NOT NULL AND um.brand <> ''
        GROUP BY LOWER(um.brand)
        HAVING COUNT(DISTINCT um.user_id) >= 2
      ) t`,
  },
  wishlist: {
    min: 1,
    desc: "coppie wishlist↔garage compatibili (brand o tipo)",
    sql: `
      SELECT COUNT(*)::int AS cnt
      FROM zavorrina_wishlist_motos w
      JOIN zavorrina_wishlists wl ON wl.id = w.wishlist_id
      JOIN users wu ON wu.id = wl.user_id AND wu.is_fake = false AND wu.status = 'active'
      JOIN user_motorcycles m ON (
        (w.brand IS NOT NULL AND w.brand <> '' AND m.brand IS NOT NULL AND m.brand <> '' AND LOWER(w.brand)=LOWER(m.brand))
        OR (w.motorcycle_type IS NOT NULL AND w.motorcycle_type <> '' AND m.motorcycle_type IS NOT NULL AND m.motorcycle_type <> '' AND LOWER(w.motorcycle_type)=LOWER(m.motorcycle_type))
      )
      JOIN users mu ON mu.id = m.user_id AND mu.is_fake = false AND mu.status = 'active' AND mu.user_type IN ('biker','coppia')
      WHERE wl.user_id <> m.user_id`,
  },
  club: {
    min: 1,
    desc: "club approvati con brand + membro attivo + biker dello stesso brand",
    sql: `
      SELECT COUNT(*)::int AS cnt
      FROM moto_clubs c
      JOIN moto_club_members mem ON mem.club_id = c.id AND mem.status = 'active'
      JOIN user_motorcycles m ON m.brand IS NOT NULL AND LOWER(m.brand) = LOWER(c.brand_name)
      JOIN users mu ON mu.id = m.user_id AND mu.is_fake = false AND mu.status = 'active' AND mu.user_type IN ('biker','coppia')
      WHERE c.is_approved = true AND c.brand_name IS NOT NULL AND c.brand_name <> '' AND mem.user_id <> m.user_id`,
  },
  motoTags: {
    min: 2,
    desc: "moto con tag tipo_moto/stile_guida",
    sql: `
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT et.entity_id
        FROM entity_tags et
        JOIN tags t ON t.id = et.tag_id
        JOIN tag_categories tc ON tc.id = t.category_id AND tc.slug IN ('tipo_moto','stile_guida')
        WHERE et.entity_type = 'motorcycle'
        GROUP BY et.entity_id
      ) t`,
  },
  motoTagsZav: {
    min: 1,
    desc: "coppie biker(moto con tag tipo/stile) ↔ zavorrina(wishlist con tipo/stile)",
    sql: `
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT DISTINCT bm.user_id AS biker_id, wl.user_id AS zav_id
        FROM user_motorcycles bm
        JOIN entity_tags et ON et.entity_type = 'motorcycle' AND et.entity_id = bm.id
        JOIN tags t ON t.id = et.tag_id
        JOIN tag_categories tc ON tc.id = t.category_id AND tc.slug IN ('tipo_moto','stile_guida')
        JOIN users bu ON bu.id = bm.user_id AND bu.is_fake = false AND bu.status = 'active' AND bu.user_type IN ('biker','coppia')
        JOIN zavorrina_wishlists wl ON wl.user_id <> bm.user_id
        JOIN zavorrina_wishlist_motos wm ON wm.wishlist_id = wl.id AND (wm.motorcycle_type IS NOT NULL OR wm.riding_style IS NOT NULL)
        JOIN users zu ON zu.id = wl.user_id AND zu.is_fake = false AND zu.status = 'active'
      ) t`,
  },
  routeCentroid: {
    min: 2,
    desc: "utenti con almeno una rotta georeferenziata (route_points)",
    sql: `
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT r.user_id
        FROM routes r
        JOIN route_points rp ON rp.route_id = r.id
        JOIN users u ON u.id = r.user_id AND u.is_fake = false
        GROUP BY r.user_id
      ) t`,
  },
  musicTags: {
    min: 2,
    desc: "utenti con almeno un tag musica",
    sql: `
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT et.entity_id
        FROM entity_tags et
        JOIN tags t ON t.id = et.tag_id
        JOIN tag_categories tc ON tc.id = t.category_id AND tc.slug = 'musica'
        JOIN users u ON u.id = et.entity_id AND u.is_fake = false
        WHERE et.entity_type = 'user'
        GROUP BY et.entity_id
      ) t`,
  },
  routeTelemetry: {
    min: 2,
    desc: "utenti con telemetria rotta (avg_speed + duration)",
    sql: `
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT r.user_id
        FROM routes r
        JOIN users u ON u.id = r.user_id AND u.is_fake = false
        WHERE r.avg_speed_kmh IS NOT NULL AND r.duration_seconds IS NOT NULL AND r.duration_seconds > 0
        GROUP BY r.user_id
      ) t`,
  },
  routeSpeed: {
    min: 2,
    desc: "utenti con rotte georeferenziate + velocità media",
    sql: `
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT r.user_id
        FROM routes r
        JOIN route_points rp ON rp.route_id = r.id
        JOIN users u ON u.id = r.user_id AND u.is_fake = false
        WHERE r.avg_speed_kmh IS NOT NULL
        GROUP BY r.user_id
      ) t`,
  },
  events: {
    min: 1,
    desc: "eventi con ≥2 partecipanti reali",
    sql: `
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT ep.event_id
        FROM event_participants ep
        JOIN users u ON u.id = ep.user_id AND u.is_fake = false
        GROUP BY ep.event_id
        HAVING COUNT(DISTINCT ep.user_id) >= 2
      ) t`,
  },
};

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

// Task #2527 — `/matching-stats` mantiene compatibilità con i client legacy;
// la sorgente unica è `/matching/stats` (vedi sotto). Entrambi gli endpoint
// continuano a rispondere finché non vengono migrati tutti i client.
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

    // Sonde dati-sorgente per famiglia (una query per famiglia, riusata dai tipi).
    const sourceCounts = new Map<SourceFamily, number>();
    for (const [fam, probe] of Object.entries(SOURCE_PROBES) as [SourceFamily, typeof SOURCE_PROBES[SourceFamily]][]) {
      try {
        const r = await client.query<{ cnt: string }>(probe.sql);
        sourceCounts.set(fam, parseInt(r.rows[0]?.cnt ?? "0", 10));
      } catch (e) {
        // Sonda fallita → segnata come -1 (sconosciuto): trattata in modo conservativo.
        console.error(`[match-health] source probe '${fam}' fallita:`, e);
        sourceCounts.set(fam, -1);
      }
    }

    const matchCounts: Array<{
      id: number; key: string; label: string; count: number;
      sourceCount: number; status: "OK" | "WARN" | "NO_DATA" | "INACTIVE";
    }> = [];
    for (const mt of MATCH_TYPES) {
      const res = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ${mt.table} WHERE ${mt.filter}`
      );
      const count = parseInt(res.rows[0]?.cnt ?? "0", 10);

      // Tipo senza matcher produttore: stato neutro, mai WARN, niente sonda.
      if (INACTIVE_TYPE_IDS.has(mt.id) && count === 0) {
        matchCounts.push({
          id: mt.id, key: mt.key, label: mt.label, count,
          sourceCount: 0, status: "INACTIVE",
        });
        continue;
      }

      const fam = SOURCE_FAMILY_BY_ID[mt.id];
      const rawSource = fam ? (sourceCounts.get(fam) ?? 0) : 0;
      const probeMin = fam ? SOURCE_PROBES[fam].min : 1;
      // rawSource < 0 = sonda fallita → consideriamo "dati presenti" per non
      // mascherare una possibile anomalia.
      const hasSource = rawSource < 0 ? true : rawSource >= probeMin;
      let status: "OK" | "WARN" | "NO_DATA" | "INACTIVE";
      if (count > 0) {
        status = "OK";
      } else if (hasSource) {
        status = "WARN";
      } else {
        status = "NO_DATA";
      }
      // Solo le vere anomalie (dati sorgente presenti ma 0 match) finiscono nei warns.
      if (status === "WARN") {
        warns.push(
          `Tipo ${mt.id} (${mt.key}): 0 match nonostante ${rawSource < 0 ? "?" : rawSource} sorgenti idonee`
        );
      }
      matchCounts.push({
        id: mt.id, key: mt.key, label: mt.label, count,
        sourceCount: Math.max(0, rawSource), status,
      });
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
        realUsers: {
          total: realUsersTotal,
          missingPrefs,
          missingCoords,
          missingMotos,
        },
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

/**
 * GET /api/admin/matching/real-users-matchability
 *
 * Report degli utenti reali non matchabili con il motivo.
 * Lista ogni utente reale attivo non di servizio e indica se mancano:
 *   - match_preferences (riga nella tabella)
 *   - coordinate GPS (lat/lon in user_profiles)
 *   - moto in garage (user_motorcycles)
 *   - entity_tags
 */
router.get("/real-users-matchability", async (_req: Request, res: Response) => {
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

export default router;

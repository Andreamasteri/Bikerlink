// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
// Task #3666 — split ulteriore: /match-health e /real-users-matchability
//              spostati in diagnostics-health.ts per gate ratchet 600 righe.
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
import healthRouter from "./diagnostics-health";

const router = Router();

// Task #2527 — i tipi sono ora nel registry centralizzato (`shared/matching-registry.ts`).
// `MATCH_TYPES` rimane come adapter di sola lettura per non rompere i call-site
// esistenti: espone gli stessi campi `{id,key,label,table,filter,prefColumn}` ma
// derivati dalla sorgente unica.
export const MATCH_TYPES: ReadonlyArray<{
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
export type SourceFamily =
  | "brand" | "wishlist" | "club" | "motoTags" | "motoTagsZav"
  | "routeCentroid" | "musicTags" | "routeTelemetry" | "routeSpeed" | "events"
  | "intentSearch";

// Tipi senza alcun matcher che li produca (legacy/non eseguiti dallo scheduler):
// nessun run-*.ts genera la stringa `club_zav:%`. Vanno marcati INACTIVE così
// non producono mai un falso WARN quando esistono dati club nel DB.
export const INACTIVE_TYPE_IDS: ReadonlySet<number> = new Set([4]);

export const SOURCE_FAMILY_BY_ID: Readonly<Record<number, SourceFamily>> = {
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
  24: "intentSearch",
};

export const SOURCE_PROBES: Readonly<Record<SourceFamily, { min: number; desc: string; sql: string }>> = {
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
  intentSearch: {
    min: 1,
    desc: "biker con searchPreference zavorrina/both attivi",
    sql: `
      SELECT COUNT(*)::int AS cnt
      FROM user_profiles bp
      JOIN users bu ON bu.id = bp.user_id
        AND bu.is_fake = false AND bu.status = 'active'
        AND bu.user_type IN ('biker','coppia')
        AND bu.matching_disabled = false
      WHERE bp.search_preference IN ('zavorrina','both')`,
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

      return res.json({ visible, autoMatchEnabled, cycleMeta, stats });
    } finally {
      client.release();
    }
  } catch (_error) {
    return sendError(res, 500, "Errore lettura settings matching");
  }
});

// /match-health e /real-users-matchability sono in diagnostics-health.ts
router.use(healthRouter);

export default router;

// Companion di diagnostics.ts — split meccanico per limite 600 righe.
// Contiene: /matching/real-users-matchability
import { Router, type Request, type Response } from "express";
import { pool } from "../../../db";
import { sendError } from "../../../lib/api-response";

const router = Router();

/**
 * GET /api/admin/matching/real-users-matchability
 *
 * Elenco degli utenti reali attivi (non fake, non di servizio) con il loro
 * stato di matchabilità: coordinate, moto in garage, match_preferences, tag.
 * Utile per diagnosticare perché certi utenti non ricevono match.
 */
router.get("/matching/real-users-matchability", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const rows = await client.query<{
      id: string;
      nickname: string;
      email: string;
      user_type: string;
      region: string | null;
      country: string | null;
      latitude: number | null;
      longitude: number | null;
      has_prefs: boolean;
      has_moto: boolean;
      has_tags: boolean;
    }>(`
      SELECT
        u.id,
        u.nickname,
        u.email,
        u.user_type,
        u.region,
        u.country,
        up.latitude,
        up.longitude,
        EXISTS(
          SELECT 1 FROM match_preferences mp WHERE mp.user_id = u.id
        ) AS has_prefs,
        EXISTS(
          SELECT 1 FROM user_motorcycles um WHERE um.user_id = u.id
        ) AS has_moto,
        EXISTS(
          SELECT 1 FROM entity_tags et WHERE et.entity_type = 'user' AND et.entity_id = u.id
        ) AS has_tags
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.is_fake = false
        AND u.is_system = false
        AND u.status = 'active'
        AND u.role <> 'admin'
      ORDER BY u.created_at ASC
    `);

    const users = rows.rows.map((r) => {
      const hasCoords = r.latitude != null && r.longitude != null;
      const issues: string[] = [];
      if (!hasCoords) issues.push("nessuna coordinata GPS");
      if (!r.has_moto && (r.user_type === "biker" || r.user_type === "coppia")) {
        issues.push("nessuna moto in garage");
      }
      if (!r.has_prefs) issues.push("nessuna match_preferences (esegui backfill)");
      if (!r.has_tags) issues.push("nessun entity_tag");
      const matchable = issues.length === 0;
      return {
        id: r.id,
        nickname: r.nickname,
        email: r.email,
        userType: r.user_type,
        region: r.region,
        country: r.country,
        hasCoords,
        hasMoto: r.has_moto,
        hasPrefs: r.has_prefs,
        hasTags: r.has_tags,
        matchable,
        issues,
      };
    });

    const summary = {
      total: users.length,
      matchable: users.filter((u) => u.matchable).length,
      missingCoords: users.filter((u) => !u.hasCoords).length,
      missingMoto: users.filter((u) => !u.hasMoto && (u.userType === "biker" || u.userType === "coppia")).length,
      missingPrefs: users.filter((u) => !u.hasPrefs).length,
      missingTags: users.filter((u) => !u.hasTags).length,
    };

    return res.json({ summary, users });
  } catch (error) {
    console.error("[real-users-matchability] errore:", error);
    return sendError(res, 500, "Errore report matchabilità");
  } finally {
    client.release();
  }
});

export default router;

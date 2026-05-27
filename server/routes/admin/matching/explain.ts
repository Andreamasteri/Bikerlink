// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { db } from "../../../db";
import { entityTags, tags as tagsTable, tagCategories, appSettings } from "@shared/db";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { eq, sql, and, inArray } from "drizzle-orm";
import {
  tagOverlap,
  loadMatchThresholds,
  getThresholdSync,
  getSupermatchMinCategories,
  isSupermatchByBreakdown,
  combinedMusicScore,
  type ScoreBreakdown,
} from "../../../matching/scoring";

const router = Router();

// ──────────────────────────────────────────────────────────────────────────
// Task #2513 — match explain endpoint.
// Calcola al volo il breakdown jaccard (musica / stile_guida / tipo_moto)
// per una coppia di utenti, senza richiedere che esista un match già
// salvato. Utile per il match-inspector dell'admin: capire perché due
// utenti hanno (o non hanno) generato un supermatch.
//   - musica:      tag su entity_type='user'
//   - stile_guida + tipo_moto: aggregati su TUTTE le moto degli utenti
//     (union per ciascun utente).
// ──────────────────────────────────────────────────────────────────────────
router.get("/matching/explain", async (req: Request, res: Response) => {
  try {
    const rawA = req.query.userA;
    const rawB = req.query.userB;
    const userA = typeof rawA === "string" ? rawA : null;
    const userB = typeof rawB === "string" ? rawB : null;
    if (!userA || !userB) return sendError(res, 400, "userA e userB sono obbligatori");
    if (userA === userB) return sendError(res, 400, "userA e userB devono essere diversi");

    const motoRows = await db.execute<{ id: string; user_id: string }>(sql`
      SELECT id, user_id FROM user_motorcycles WHERE user_id IN (${userA}, ${userB})
    `);
    const motoIdsA: string[] = [];
    const motoIdsB: string[] = [];
    for (const r of motoRows.rows) {
      if (r.user_id === userA) motoIdsA.push(String(r.id));
      else if (r.user_id === userB) motoIdsB.push(String(r.id));
    }

    type TagRow = { entityType: string; entityId: string; slug: string; catSlug: string };
    const collectTags = async (entityType: "user" | "motorcycle", ids: string[]): Promise<TagRow[]> => {
      if (ids.length === 0) return [];
      return db.select({
        entityType: entityTags.entityType,
        entityId: entityTags.entityId,
        slug: tagsTable.slug,
        catSlug: tagCategories.slug,
      })
        .from(entityTags)
        .innerJoin(tagsTable, eq(tagsTable.id, entityTags.tagId))
        .innerJoin(tagCategories, eq(tagCategories.id, tagsTable.categoryId))
        .where(and(eq(entityTags.entityType, entityType), inArray(entityTags.entityId, ids)));
    };

    const [userTags, motoTagsA, motoTagsB] = await Promise.all([
      collectTags("user", [userA, userB]),
      collectTags("motorcycle", motoIdsA),
      collectTags("motorcycle", motoIdsB),
    ]);

    const aggregate = (rows: TagRow[], filterEntityId?: string) => {
      const map: Record<string, Set<string>> = { musica: new Set(), stile_guida: new Set(), tipo_moto: new Set() };
      for (const r of rows) {
        if (filterEntityId && r.entityId !== filterEntityId) continue;
        if (map[r.catSlug]) map[r.catSlug].add(r.slug);
      }
      return map;
    };
    const aUser = aggregate(userTags, userA);
    const bUser = aggregate(userTags, userB);
    const aMoto = aggregate(motoTagsA);
    const bMoto = aggregate(motoTagsB);

    const thresholds = await loadMatchThresholds();
    const minCategories = await getSupermatchMinCategories();

    const buildCategory = (cat: string, tagsA: Set<string>, tagsB: Set<string>) => {
      const ov = tagOverlap(tagsA, tagsB);
      const thr = getThresholdSync(cat, thresholds);
      const passes = ov.jaccard >= thr.jaccardThreshold && ov.common >= thr.minCommonTags;
      return {
        tagsA: [...tagsA].sort(),
        tagsB: [...tagsB].sort(),
        common: ov.common,
        jaccard: Number(ov.jaccard.toFixed(4)),
        overlap: Number(ov.overlap.toFixed(4)),
        threshold: thr.jaccardThreshold,
        minCommonTags: thr.minCommonTags,
        passes,
      };
    };

    const categories = {
      musica: buildCategory("musica", aUser.musica, bUser.musica),
      stile_guida: buildCategory("stile_guida", aMoto.stile_guida, bMoto.stile_guida),
      tipo_moto: buildCategory("tipo_moto", aMoto.tipo_moto, bMoto.tipo_moto),
    };

    const breakdown: ScoreBreakdown = {
      musicScore: categories.musica.jaccard,
      musicCommon: categories.musica.common,
      styleScore: categories.stile_guida.jaccard,
      styleCommon: categories.stile_guida.common,
      bikeTypeScore: categories.tipo_moto.jaccard,
      bikeTypeCommon: categories.tipo_moto.common,
    };
    const categoriesAbove = (Object.values(categories) as Array<{ passes: boolean }>).filter(c => c.passes).length;
    const isSupermatch = isSupermatchByBreakdown(breakdown, thresholds, minCategories);

    // Task #2516 — affinità musicale combinata: aggiunge embedding cosine
    // e combined score al payload explain (best-effort, non blocca se
    // mancano embedding o tabella).
    let musicAffinity: {
      tagJaccard: number;
      embeddingScore: number | null;
      combinedScore: number | null;
      weightTag: number;
      weightEmbedding: number;
      threshold: number;
      passes: boolean;
      reason?: string;
    } | null = null;
    try {
      const embRes = await db.execute<{ sim: number | string | null }>(sql`
        SELECT 1 - (a.embedding <=> b.embedding) AS sim
        FROM embeddings a
        INNER JOIN embeddings b ON b.entity_type = 'user'
          AND b.field = 'music_taste'
          AND b.entity_id = ${userB}
        WHERE a.entity_type = 'user'
          AND a.field = 'music_taste'
          AND a.entity_id = ${userA}
        LIMIT 1
      `);
      const simRaw = embRes.rows[0]?.sim;
      const embeddingScore = simRaw == null
        ? null
        : Math.max(0, Math.min(1, Number(simRaw)));

      const [wTagRow] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, "match_music_combined_weight_tag"))
        .limit(1);
      const [wEmbRow] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, "match_music_combined_weight_embedding"))
        .limit(1);
      const wTag = Number.isFinite(parseFloat(String(wTagRow?.value ?? "")))
        ? parseFloat(String(wTagRow!.value))
        : 0.5;
      const wEmb = Number.isFinite(parseFloat(String(wEmbRow?.value ?? "")))
        ? parseFloat(String(wEmbRow!.value))
        : 0.5;
      const combinedThr = thresholds.get("music_taste_combined")?.jaccardThreshold ?? 0.55;

      const combined = embeddingScore == null
        ? null
        : Number(combinedMusicScore(categories.musica.jaccard, embeddingScore, wTag, wEmb).toFixed(4));

      musicAffinity = {
        tagJaccard: categories.musica.jaccard,
        embeddingScore: embeddingScore == null ? null : Number(embeddingScore.toFixed(4)),
        combinedScore: combined,
        weightTag: wTag,
        weightEmbedding: wEmb,
        threshold: combinedThr,
        passes: combined != null && combined >= combinedThr,
        reason: embeddingScore == null ? "embedding `music_taste` mancante per uno o entrambi gli utenti" : undefined,
      };
    } catch (err) {
      console.warn("[admin/matching/explain] music_affinity calc failed:", err);
    }

    breakdown.musicEmbeddingScore = musicAffinity?.embeddingScore ?? undefined;
    breakdown.combinedMusicScore = musicAffinity?.combinedScore ?? undefined;
    breakdown.musicWeightTag = musicAffinity?.weightTag;
    breakdown.musicWeightEmbedding = musicAffinity?.weightEmbedding;

    // Task #2515 — bio similarity (cosine on text-embedding vectors).
    // Best-effort: if either user lacks a bio embedding, returns null.
    const bioAffinity: {
      similarity: number | null;
      threshold: number;
      bioA: string | null;
      bioB: string | null;
      model: string | null;
    } = { similarity: null, threshold: 0.78, bioA: null, bioB: null, model: null };
    try {
      const bioRowsRes = await db.execute<{
        user_id: string;
        bio: string | null;
        embedding: string | null;
        model: string | null;
      }>(sql`
        SELECT
          up.user_id AS user_id,
          up.bio AS bio,
          e.embedding::text AS embedding,
          e.model AS model
        FROM user_profiles up
        LEFT JOIN embeddings e
          ON e.entity_type = 'user'
         AND e.entity_id = up.user_id
         AND e.field = 'bio'
        WHERE up.user_id IN (${userA}, ${userB})
      `);
      const bioRows = (bioRowsRes.rows ?? bioRowsRes) as Array<{
        user_id: string;
        bio: string | null;
        embedding: string | null;
        model: string | null;
      }>;
      const aRow = bioRows.find((r) => r.user_id === userA);
      const bRow = bioRows.find((r) => r.user_id === userB);
      const snippet = (s: string | null | undefined, n = 240) =>
        s ? (s.length > n ? s.slice(0, n) + "…" : s) : null;
      bioAffinity.bioA = snippet(aRow?.bio ?? null);
      bioAffinity.bioB = snippet(bRow?.bio ?? null);
      bioAffinity.model = aRow?.model ?? bRow?.model ?? null;

      if (aRow?.embedding && bRow?.embedding) {
        const simRes = await db.execute<{ sim: number }>(sql`
          SELECT 1 - (
            ${aRow.embedding}::vector <=> ${bRow.embedding}::vector
          ) AS sim
        `);
        const simRow = (simRes.rows ?? simRes)[0] as { sim: number | string } | undefined;
        if (simRow != null) {
          bioAffinity.similarity = Number(Number(simRow.sim).toFixed(4));
        }
      }
    } catch (bioErr) {
      console.error("[admin] explain bio similarity error:", bioErr);
    }
    return sendSuccess(res, {
      userA, userB,
      categories,
      categoriesAboveThreshold: categoriesAbove,
      minCategories,
      isSupermatch,
      musicAffinity,
      bioAffinity,
      breakdown,
    });
  } catch (err) {
    console.error("[admin] GET /matching/explain error:", err);
    return sendError(res, 500, "Errore calcolo explain");
  }
});

export default router;

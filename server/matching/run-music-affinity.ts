import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  entityTags,
  musicAffinityMatches,
  tagCategories,
  tags,
  appSettings,
} from "@shared/db";
import { findSimilar } from "../embeddings";
import { loadMatchPreferencesMap, bothPrefsEnabled, loadMatchingDisabledSet, neitherMatchingDisabled } from "./filters";
import { tagOverlap, loadMatchThresholds } from "./scoring";
import { protectedNicknamesSqlArray } from "./protection-filter";

/**
 * Task #2516 — Matcher per affinità musicale combinata.
 *
 * Per ogni utente che ha un embedding `music_taste`, recupera i K vicini
 * più simili (cosine), poi calcola lo score combinato:
 *   combined = tagJaccard * w1 + embeddingSim * w2
 * Default w1=w2=0.5, override da app_settings (`match_music_combined_weight_tag`
 * / `match_music_combined_weight_embedding`). Crea match quando il combined
 * supera la soglia `music_taste_combined` (default 0.55).
 *
 * Complementa — non sostituisce — `runMusicMatchBikerZavorrina` (tag-only).
 *
 * Scalabilità (Task #3754): gli embedding vengono processati a batch di
 * EMBEDDING_BATCH_SIZE utenti alla volta anziché caricarli tutti in RAM.
 * I tag musicali vengono invece caricati una sola volta per tutti gli utenti
 * attivi (sono dati leggeri: solo slug stringhe) in modo da non dover fare
 * lookup ripetuti per i neighbor restituiti da findSimilar.
 */

const DEFAULT_K = 20;
const DEFAULT_MIN_SIMILARITY = 0.40;
const DEFAULT_W_TAG = 0.5;
const DEFAULT_W_EMB = 0.5;

/** Numero di utenti caricati in memoria per ciclo di elaborazione. */
const EMBEDDING_BATCH_SIZE = 200;

async function loadWeight(key: string, fallback: number): Promise<number> {
  try {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    const v = parseFloat(String(row?.value ?? ""));
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
  } catch {
    /* fall through */
  }
  return fallback;
}

async function loadCombinedThreshold(): Promise<number> {
  try {
    const thresholds = await loadMatchThresholds();
    const t = thresholds.get("music_taste_combined");
    if (t) return t.jaccardThreshold;
  } catch {
    /* fall through */
  }
  return DEFAULT_MIN_SIMILARITY;
}

interface UserMusicEmbedding {
  userId: string;
  vector: number[];
}

/**
 * Restituisce gli ID di tutti gli utenti attivi con embedding `music_taste`.
 * Non carica i vettori: è usata per dimensionare il batch loop e per
 * precaricare i tag musicali di tutti i potenziali neighbor.
 */
async function loadMusicEmbeddingUserIds(): Promise<string[]> {
  // Ordina per notified_at ASC NULLS FIRST: chi non ha mai ricevuto un match
  // musicale (o lo ha ricevuto meno di recente) viene processato prima,
  // così il cap non svantaggia sistematicamente gli stessi utenti.
  const result = await db.execute<{ entity_id: string }>(sql`
    SELECT e.entity_id
    FROM embeddings e
    INNER JOIN users u ON u.id = e.entity_id
    WHERE e.entity_type = 'user'
      AND e.field = 'music_taste'
      AND u.is_fake = false
      AND u.status = 'active'
      AND u.nickname <> ALL(${sql.raw(protectedNicknamesSqlArray())})
    ORDER BY (
      SELECT MAX(m.notified_at)
      FROM music_affinity_matches m
      WHERE m.user_a_id = e.entity_id OR m.user_b_id = e.entity_id
    ) ASC NULLS FIRST, e.entity_id
  `);
  const rows = (result.rows ?? result) as Array<{ entity_id: string }>;
  return rows.map((r) => r.entity_id);
}

/**
 * Carica i vettori di embedding per una singola pagina di utenti, identificati
 * dall'array `userIds`. La dimensione della pagina è controllata dal chiamante
 * tramite `EMBEDDING_BATCH_SIZE`.
 *
 * Usa un parametro bound `$1::text[]` per passare l'array di ID così da
 * ottenere plan caching e non dover fare escaping manuale dei valori.
 */
async function loadEmbeddingBatch(userIds: string[]): Promise<UserMusicEmbedding[]> {
  if (userIds.length === 0) return [];
  const result = await db.execute<{ entity_id: string; vec: string }>(
    sql`SELECT entity_id, embedding::text AS vec
        FROM embeddings
        WHERE entity_type = 'user'
          AND field = 'music_taste'
          AND entity_id = ANY(${userIds}::text[])`,
  );
  const rows = (result.rows ?? result) as Array<{ entity_id: string; vec: string }>;
  return rows.map((r) => ({
    userId: r.entity_id,
    vector: parsePgVector(r.vec),
  }));
}

function parsePgVector(s: string): number[] {
  // pgvector ::text returns "[v1,v2,...]"
  const trimmed = s.trim();
  if (!trimmed || trimmed[0] !== "[") return [];
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((x) => Number(x));
}

async function loadMusicTagsByUser(userIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({ entityId: entityTags.entityId, slug: tags.slug })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .innerJoin(tagCategories, and(
      eq(tagCategories.id, tags.categoryId),
      eq(tagCategories.slug, "musica"),
    ))
    .where(and(
      eq(entityTags.entityType, "user"),
      inArray(entityTags.entityId, userIds),
    ));
  for (const r of rows) {
    let s = out.get(r.entityId);
    if (!s) { s = new Set(); out.set(r.entityId, s); }
    s.add(r.slug);
  }
  return out;
}

export type MusicAffinityCapStatus = {
  cap: number;
  capReached: boolean;
  usersProcessed: number;
  usersSkipped: number;
  skipReasons: {
    capReached: number;
    noCandidate: number;
  };
};

/** Fallback identico al vecchio hardcoded — music affinity era 1000. */
const DEFAULT_MUSIC_CAP = 1000;

let lastMusicAffinityCapStatus: MusicAffinityCapStatus = {
  cap: DEFAULT_MUSIC_CAP,
  capReached: false,
  usersProcessed: 0,
  usersSkipped: 0,
  skipReasons: { capReached: 0, noCandidate: 0 },
};

export function getLastMusicAffinityCapStatus(): MusicAffinityCapStatus { return lastMusicAffinityCapStatus; }

async function loadMusicMatchingCap(): Promise<number> {
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "matching_max_per_run")).limit(1);
    const v = parseInt(String(row?.value ?? ""), 10);
    if (Number.isFinite(v) && v > 0) return v;
  } catch { /* fall through */ }
  return DEFAULT_MUSIC_CAP;
}

export async function runMusicAffinityMatching(): Promise<number> {
  try {
    const [allUserIds, prefsMap, blocked, wTag, wEmb, minCombined, matchingDisabledSet, maxTotal] = await Promise.all([
      loadMusicEmbeddingUserIds(),
      loadMatchPreferencesMap(),
      storage.getAllBlockedPairs(),
      loadWeight("match_music_combined_weight_tag", DEFAULT_W_TAG),
      loadWeight("match_music_combined_weight_embedding", DEFAULT_W_EMB),
      loadCombinedThreshold(),
      loadMatchingDisabledSet(),
      loadMusicMatchingCap(),
    ]);

    if (allUserIds.length < 2) {
      console.log("[MusicAffinity] meno di 2 embedding `music_taste`, skip.");
      return 0;
    }

    const blockedSet = new Set(
      blocked.flatMap((b) => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`]),
    );

    // I tag musicali vengono caricati una volta sola per tutti gli utenti attivi
    // (sono leggeri). Questo copre sia i source-user del batch corrente sia i
    // neighbor che findSimilar può restituire da qualsiasi batch.
    const tagSetsByUser = await loadMusicTagsByUser(allUserIds);

    let matchCount = 0;
    let attempted = 0;
    let skipped = 0;
    let skippedBelowThreshold = 0;
    let usersBlockedBySoglia = 0;
    let usersProcessed = 0;
    let batchIndex = 0;

    outer:
    for (let offset = 0; offset < allUserIds.length; offset += EMBEDDING_BATCH_SIZE) {
      const batchIds = allUserIds.slice(offset, offset + EMBEDDING_BATCH_SIZE);
      const batchEmbeddings = await loadEmbeddingBatch(batchIds);
      batchIndex++;

      for (const { userId: uidA, vector } of batchEmbeddings) {
        if (matchCount >= maxTotal) break outer;
        usersProcessed++;

        // Solo utenti che hanno il toggle musicAffinity attivo (default true)
        const prefA = prefsMap.get(uidA);
        if (prefA && prefA.musicAffinity === false) continue;

        const neighbors = await findSimilar("user", "music_taste", vector, DEFAULT_K + 1, 0);
        const setA = tagSetsByUser.get(uidA) ?? new Set<string>();

        let userMatchesThisRun = 0;
        let userPairsBelowSoglia = 0;

        for (const hit of neighbors) {
          if (matchCount >= maxTotal) break outer;
          const uidB = hit.entityId;
          if (!uidB || uidB === uidA) continue;
          if (blockedSet.has(`${uidA}:${uidB}`)) { skipped++; continue; }
          if (!bothPrefsEnabled(prefsMap, uidA, uidB, "musicAffinity")) { skipped++; continue; }
          if (!neitherMatchingDisabled(matchingDisabledSet, uidA, uidB)) { skipped++; continue; }

          const setB = tagSetsByUser.get(uidB) ?? new Set<string>();
          const ov = tagOverlap(setA, setB);
          const embSim = Math.max(0, Math.min(1, hit.similarity));
          const combined = ov.jaccard * wTag + embSim * wEmb;
          attempted++;
          if (combined < minCombined) { skipped++; skippedBelowThreshold++; userPairsBelowSoglia++; continue; }

          const idA = uidA < uidB ? uidA : uidB;
          const idB = uidA < uidB ? uidB : uidA;
          try {
            const inserted = await db
              .insert(musicAffinityMatches)
              .values({
                userAId: idA,
                userBId: idB,
                tagScore: Number(ov.jaccard.toFixed(4)),
                embeddingScore: Number(embSim.toFixed(4)),
                combinedScore: Number(combined.toFixed(4)),
                tagCommon: ov.common,
                status: "new",
              })
              .onConflictDoNothing()
              .returning({ id: musicAffinityMatches.id });
            if (inserted.length > 0) { matchCount++; userMatchesThisRun++; }
            else skipped++;
          } catch (err) {
            console.error("[MusicAffinity] insert err:", err);
            skipped++;
          }
        }

        // Utente bloccato dalla soglia: ha avuto candidati valutati ma
        // nessun match prodotto e almeno una coppia scartata per soglia.
        if (userMatchesThisRun === 0 && userPairsBelowSoglia > 0) {
          usersBlockedBySoglia++;
        }
      }

      console.log(
        `[MusicAffinity] batch ${batchIndex} (utenti ${offset + 1}-${Math.min(offset + EMBEDDING_BATCH_SIZE, allUserIds.length)}/${allUserIds.length}) — match finora: ${matchCount}`,
      );
    }

    const capReached = matchCount >= maxTotal;
    const usersSkipped = allUserIds.length - usersProcessed;

    console.log(
      `[MusicAffinity] ${matchCount} match (cap=${maxTotal}, combined>=${minCombined}, K=${DEFAULT_K}, w_tag=${wTag}, w_emb=${wEmb}); ` +
      `utenti_processati=${usersProcessed}, utenti_saltati=${usersSkipped}, utenti_bloccati_da_soglia=${usersBlockedBySoglia}, ` +
      `coppie_valutate=${attempted}, saltate_sotto_soglia=${skippedBelowThreshold}, saltate_altro=${skipped - skippedBelowThreshold}`,
    );

    if (capReached) {
      console.warn(
        `[MusicAffinity] cap raggiunto (${maxTotal}) — ${usersSkipped} utenti non processati. Aumenta matching_max_per_run per coprire tutta la base utenti.`,
      );
    }

    lastMusicAffinityCapStatus = {
      cap: maxTotal,
      capReached,
      usersProcessed,
      usersSkipped,
      skipReasons: { capReached: usersSkipped, noCandidate: skipped },
    };

    return matchCount;
  } catch (err) {
    console.error("[MusicAffinity] error:", err);
    return 0;
  }
}

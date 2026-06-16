/**
 * Task #2515 — Bio Affinity Matcher
 *
 * Per ogni utente con embedding bio salvato, trova i top K utenti con bio
 * semanticamente simile (pgvector cosine) e crea match `bio_affinity_matches`.
 *
 * Filtri applicati:
 *  - preferenza `bioAffinity` di entrambi gli utenti (default true)
 *  - utenti `isFake = false`
 *  - blocchi reciproci (storage.getAllBlockedPairs)
 *  - prossimità: maxPickupDistance (Haversine via server/geo.ts)
 *  - similarità >= SIM_THRESHOLD
 *
 * Cap globale: MAX_NEW_MATCHES_PER_RUN. Cap per-utente: TOP_K (=10).
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { bioAffinityMatches } from "@shared/db";
import { findSimilar, EMBEDDING_MODEL_TAG } from "../embeddings";
import { loadMatchPreferencesMap, bothPrefsEnabled, loadMatchingDisabledSet, neitherMatchingDisabled } from "./filters";
import { haversineKm } from "../geo";
import { protectedNicknamesSqlArray } from "./protection-filter";

const TOP_K = 10;
const SIM_THRESHOLD = Number(process.env.BIO_AFFINITY_THRESHOLD ?? 0.65);
const MAX_NEW_MATCHES_PER_RUN = 500;
const CANDIDATE_FETCH_MULTIPLIER = 4;

type BioRow = {
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  max_pickup_distance: number | null;
  embedding: string; // pgvector serialised as text
  model: string | null;
};

let lastStats = { matchesCreated: 0, usersProcessed: 0, durationMs: 0 };
export function getLastBioAffinityStats() {
  return lastStats;
}

function parseEmbedding(raw: string | number[]): number[] {
  if (Array.isArray(raw)) return raw;
  // pgvector returns "[0.1,0.2,...]"
  const trimmed = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  return trimmed.split(",").map((v) => Number(v));
}

export async function runBioAffinityMatching(): Promise<number> {
  const startedAt = Date.now();
  let matchesCreated = 0;
  let usersProcessed = 0;
  try {
    const rowsRes = await db.execute<BioRow>(sql`
      SELECT
        e.entity_id AS user_id,
        up.latitude AS latitude,
        up.longitude AS longitude,
        up.max_pickup_distance AS max_pickup_distance,
        e.embedding::text AS embedding,
        e.model AS model
      FROM embeddings e
      INNER JOIN users u ON u.id = e.entity_id
      LEFT JOIN user_profiles up ON up.user_id = e.entity_id
      WHERE e.entity_type = 'user'
        AND e.field = 'bio'
        AND u.is_fake = false
        AND u.nickname <> ALL(${sql.raw(protectedNicknamesSqlArray())})
    `);
    const rows = (rowsRes.rows ?? rowsRes) as BioRow[];
    if (rows.length < 2) {
      console.log(`[BioAffinity] Solo ${rows.length} utenti con embedding bio, skip.`);
      lastStats = { matchesCreated: 0, usersProcessed: rows.length, durationMs: Date.now() - startedAt };
      return 0;
    }

    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSet = await loadMatchingDisabledSet();
    const blockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      blockedPairs.flatMap((b) => [
        `${b.blockerId}:${b.blockedId}`,
        `${b.blockedId}:${b.blockerId}`,
      ]),
    );

    const userMeta = new Map<string, { lat: number | null; lon: number | null; maxKm: number }>();
    for (const r of rows) {
      userMeta.set(r.user_id, {
        lat: r.latitude,
        lon: r.longitude,
        maxKm: r.max_pickup_distance ?? 50,
      });
    }

    outer:
    for (const row of rows) {
      if (matchesCreated >= MAX_NEW_MATCHES_PER_RUN) break;
      usersProcessed++;
      const userA = row.user_id;
      const aMeta = userMeta.get(userA)!;
      let vec: number[];
      try {
        vec = parseEmbedding(row.embedding);
      } catch {
        continue;
      }

      let hits;
      try {
        // Confronto SOLO tra embeddings dello stesso modello: cosine fra
        // OpenAI e fallback locale non è semanticamente affidabile.
        hits = await findSimilar(
          "user",
          "bio",
          vec,
          TOP_K * CANDIDATE_FETCH_MULTIPLIER,
          SIM_THRESHOLD,
          row.model ?? undefined,
        );
      } catch (err) {
        console.error(`[BioAffinity] findSimilar failed for ${userA}:`, err);
        continue;
      }

      let kept = 0;
      for (const hit of hits) {
        if (kept >= TOP_K) break;
        if (matchesCreated >= MAX_NEW_MATCHES_PER_RUN) break outer;
        const userB = hit.entityId;
        if (userB === userA) continue;
        if (!userMeta.has(userB)) continue; // userB filtered out (fake/deleted)
        if (blockedSet.has(`${userA}:${userB}`)) continue;
        if (!bothPrefsEnabled(prefsMap, userA, userB, "bioAffinity")) continue;
        if (!neitherMatchingDisabled(matchingDisabledSet, userA, userB)) continue;

        // Geo filter: respect the smaller maxPickupDistance of the two.
        const bMeta = userMeta.get(userB)!;
        if (aMeta.lat != null && aMeta.lon != null && bMeta.lat != null && bMeta.lon != null) {
          const d = haversineKm(aMeta.lat, aMeta.lon, bMeta.lat, bMeta.lon);
          const limit = Math.min(aMeta.maxKm, bMeta.maxKm);
          if (d > limit) continue;
        }

        const [aId, bId] = userA < userB ? [userA, userB] : [userB, userA];
        try {
          const inserted = await db
            .insert(bioAffinityMatches)
            .values({
              userAId: aId,
              userBId: bId,
              similarity: Math.round(hit.similarity * 10000) / 10000,
              model: hit.model ?? EMBEDDING_MODEL_TAG,
            })
            .onConflictDoNothing()
            .returning({ id: bioAffinityMatches.id });
          if (inserted.length > 0) {
            matchesCreated++;
            kept++;
          } else {
            // Already existed — still counts toward per-user cap to avoid runaway scans.
            kept++;
          }
        } catch (err) {
          console.error("[BioAffinity] insert error:", err);
        }
      }
    }

    const elapsed = Date.now() - startedAt;
    lastStats = { matchesCreated, usersProcessed, durationMs: elapsed };
    console.log(
      `[BioAffinity] ${matchesCreated} nuovi match in ${(elapsed / 1000).toFixed(1)}s ` +
        `(processati ${usersProcessed}/${rows.length} utenti, soglia=${SIM_THRESHOLD})`,
    );
    return matchesCreated;
  } catch (err) {
    console.error("[BioAffinity] errore:", err);
    lastStats = { matchesCreated, usersProcessed, durationMs: Date.now() - startedAt };
    return matchesCreated;
  }
}

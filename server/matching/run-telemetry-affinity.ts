/**
 * Task #3393 — Telemetry Affinity Matcher
 *
 * Per ogni utente con embedding `telemetry_style` salvato, trova i top K utenti
 * con stile di guida simile e crea/aggiorna match `telemetry_affinity_matches`.
 *
 * Score combinato:
 *   combinedScore = 0.4 * algorithmicScore + 0.6 * embeddingScore
 *     - algorithmicScore = Jaccard sulle style-label derivate dai bucket
 *       (velocità / piega / durata / fascia oraria)
 *     - embeddingScore   = coseno pgvector su `telemetry_style` (findSimilar)
 * Soglia: combinedScore >= COMBINED_THRESHOLD (default 0.55).
 *
 * Filtri applicati:
 *  - preferenza `telemetryAffinity` di entrambi gli utenti (default true)
 *  - utenti `is_fake = false` + nickname protetti esclusi
 *  - blocchi reciproci (storage.getAllBlockedPairs)
 *  - club scope (clubScopeAllows)
 *  - gate `data_quality >= MIN_SESSIONS_FOR_EMBED` (implicito: l'embedding
 *    esiste solo per profili che superano la soglia)
 *
 * Cap globale: MAX_NEW_MATCHES_PER_RUN. Cap per-utente: TOP_K.
 * Upsert: se la coppia esiste, aggiorna gli score (lo stile evolve nel tempo).
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { telemetryAffinityMatches, type Proposal } from "@shared/db";
import { findSimilar } from "../embeddings";
import { loadMatchPreferencesMap, bothPrefsEnabled, clubScopeAllows, getActiveClubMembershipKeys, loadMatchingDisabledSet, neitherMatchingDisabled } from "./filters";
import { protectedNicknamesSqlArray } from "./protection-filter";
import { styleLabelsFromProfile } from "../ai/telemetry-style-embedder";

const TOP_K = 10;
const COMBINED_THRESHOLD = Number(process.env.TELEMETRY_AFFINITY_THRESHOLD ?? 0.55);
const EMBED_PREFILTER = Number(process.env.TELEMETRY_AFFINITY_EMBED_PREFILTER ?? 0.2);
const ALGO_WEIGHT = 0.4;
const EMBED_WEIGHT = 0.6;
const MAX_NEW_MATCHES_PER_RUN = 500;
const CANDIDATE_FETCH_MULTIPLIER = 4;

type TelemetryRow = {
  user_id: string;
  club_id: string | null;
  embedding: string;
  model: string | null;
  speed_bucket: string;
  lean_bucket: string;
  duration_bucket: string;
  fraction_morning: number;
  fraction_evening: number;
};

let lastStats = { matchesCreated: 0, matchesUpdated: 0, usersProcessed: 0, durationMs: 0 };
export function getLastTelemetryAffinityStats() {
  return lastStats;
}

function parseEmbedding(raw: string | number[]): number[] {
  if (Array.isArray(raw)) return raw;
  const trimmed = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  return trimmed.split(",").map((v) => Number(v));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export async function runTelemetryAffinityMatching(): Promise<number> {
  const startedAt = Date.now();
  let matchesCreated = 0;
  let matchesUpdated = 0;
  let usersProcessed = 0;
  try {
    const rowsRes = await db.execute<TelemetryRow>(sql`
      SELECT
        e.entity_id AS user_id,
        mcm.club_id AS club_id,
        e.embedding::text AS embedding,
        e.model AS model,
        tp.speed_bucket AS speed_bucket,
        tp.lean_bucket AS lean_bucket,
        tp.duration_bucket AS duration_bucket,
        tp.fraction_morning AS fraction_morning,
        tp.fraction_evening AS fraction_evening
      FROM embeddings e
      INNER JOIN users u ON u.id = e.entity_id
      INNER JOIN user_telemetry_profile tp ON tp.user_id = e.entity_id
      LEFT JOIN LATERAL (
        SELECT club_id FROM moto_club_members
        WHERE user_id = e.entity_id AND status = 'active'
        LIMIT 1
      ) mcm ON true
      WHERE e.entity_type = 'user'
        AND e.field = 'telemetry_style'
        AND u.is_fake = false
        AND u.nickname <> ALL(${sql.raw(protectedNicknamesSqlArray())})
    `);
    const rows = (rowsRes.rows ?? rowsRes) as TelemetryRow[];
    if (rows.length < 2) {
      console.log(`[TelemetryAffinity] Solo ${rows.length} utenti con embedding telemetry_style, skip.`);
      lastStats = { matchesCreated: 0, matchesUpdated: 0, usersProcessed: rows.length, durationMs: Date.now() - startedAt };
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

    const meta = new Map<string, { clubId: string | null; labels: Set<string> }>();
    for (const r of rows) {
      meta.set(r.user_id, {
        clubId: r.club_id,
        labels: new Set(
          styleLabelsFromProfile({
            speedBucket: r.speed_bucket,
            leanBucket: r.lean_bucket,
            durationBucket: r.duration_bucket,
            fractionMorning: r.fraction_morning,
            fractionEvening: r.fraction_evening,
          }),
        ),
      });
    }

    // Club scope: carica le membership attive solo per gli utenti con club.
    const clubUserIds = rows.filter((r) => !!r.club_id).map((r) => r.user_id);
    const clubIds = [...new Set(rows.map((r) => r.club_id).filter((c): c is string => !!c))];
    const membershipKeys = await getActiveClubMembershipKeys(clubUserIds, clubIds);

    outer:
    for (const row of rows) {
      if (matchesCreated >= MAX_NEW_MATCHES_PER_RUN) break;
      usersProcessed++;
      const userA = row.user_id;
      const aMeta = meta.get(userA)!;
      let vec: number[];
      try {
        vec = parseEmbedding(row.embedding);
      } catch {
        continue;
      }

      let hits;
      try {
        hits = await findSimilar(
          "user",
          "telemetry_style",
          vec,
          TOP_K * CANDIDATE_FETCH_MULTIPLIER,
          EMBED_PREFILTER,
          row.model ?? undefined,
        );
      } catch (err) {
        console.error(`[TelemetryAffinity] findSimilar failed for ${userA}:`, err);
        continue;
      }

      let kept = 0;
      for (const hit of hits) {
        if (kept >= TOP_K) break;
        if (matchesCreated >= MAX_NEW_MATCHES_PER_RUN) break outer;
        const userB = hit.entityId;
        if (userB === userA) continue;
        const bMeta = meta.get(userB);
        if (!bMeta) continue;
        if (blockedSet.has(`${userA}:${userB}`)) continue;
        if (!bothPrefsEnabled(prefsMap, userA, userB, "telemetryAffinity")) continue;
        if (!neitherMatchingDisabled(matchingDisabledSet, userA, userB)) continue;
        if (!clubScopeAllows(
          { userId: userA, clubId: aMeta.clubId } as Proposal,
          { userId: userB, clubId: bMeta.clubId } as Proposal,
          membershipKeys,
        )) continue;

        const embeddingScore = hit.similarity;
        const algorithmicScore = jaccard(aMeta.labels, bMeta.labels);
        const combinedScore = ALGO_WEIGHT * algorithmicScore + EMBED_WEIGHT * embeddingScore;
        if (combinedScore < COMBINED_THRESHOLD) continue;

        const commonLabels = [...aMeta.labels].filter((l) => bMeta.labels.has(l));
        const [aId, bId] = userA < userB ? [userA, userB] : [userB, userA];
        const round = (n: number) => Math.round(n * 10000) / 10000;

        try {
          // Insert-or-update: l'unique index è su un'espressione (LEAST/GREATEST),
          // quindi non usiamo onConflictDoUpdate (target espressione fragile in
          // drizzle). Inseriamo con onConflictDoNothing e, se la coppia esiste
          // già, aggiorniamo gli score (lo stile evolve nel tempo).
          const inserted = await db
            .insert(telemetryAffinityMatches)
            .values({
              userAId: aId,
              userBId: bId,
              algorithmicScore: round(algorithmicScore),
              embeddingScore: round(embeddingScore),
              combinedScore: round(combinedScore),
              styleLabels: commonLabels,
            })
            .onConflictDoNothing()
            .returning({ id: telemetryAffinityMatches.id });
          if (inserted.length > 0) {
            matchesCreated++;
          } else {
            await db
              .update(telemetryAffinityMatches)
              .set({
                algorithmicScore: round(algorithmicScore),
                embeddingScore: round(embeddingScore),
                combinedScore: round(combinedScore),
                styleLabels: commonLabels,
              })
              .where(sql`
                LEAST(${telemetryAffinityMatches.userAId}, ${telemetryAffinityMatches.userBId}) = ${aId}
                AND GREATEST(${telemetryAffinityMatches.userAId}, ${telemetryAffinityMatches.userBId}) = ${bId}
              `);
            matchesUpdated++;
          }
          kept++;
        } catch (err) {
          console.error("[TelemetryAffinity] upsert error:", err);
        }
      }
    }

    const elapsed = Date.now() - startedAt;
    lastStats = { matchesCreated, matchesUpdated, usersProcessed, durationMs: elapsed };
    console.log(
      `[TelemetryAffinity] ${matchesCreated} nuovi / ${matchesUpdated} aggiornati in ${(elapsed / 1000).toFixed(1)}s ` +
        `(processati ${usersProcessed}/${rows.length} utenti, soglia=${COMBINED_THRESHOLD})`,
    );
    return matchesCreated;
  } catch (err) {
    console.error("[TelemetryAffinity] errore:", err);
    lastStats = { matchesCreated, matchesUpdated, usersProcessed, durationMs: Date.now() - startedAt };
    return matchesCreated;
  }
}

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
 *
 * Task #4548 — Budget interno + cursore persistente
 *  - Budget di tempo interno (`bio_affinity_budget_ms`, default 75s): il job si
 *    ferma da solo prima del hard timeout (90s) dello scheduler, evitando il
 *    WARN "BioAffinity interrotto per timeout".
 *  - Cursore persistente (`bio_affinity_cursor_user_id`): ogni run riparte da
 *    dove il precedente si era fermato (ordinamento per entity_id), così nessun
 *    utente resta strutturalmente saltato; alla fine della lista il cursore si
 *    azzera e il ciclo successivo ricomincia dall'inizio.
 *  - Controllo HNSW esplicito a inizio job (un'unica query pg_indexes) invece di
 *    scoprirlo come side-effect di N findSimilar() sequenziali.
 *  - Parametri chiave configurabili via AppSetting senza deploy.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { bioAffinityMatches } from "@shared/db";
import { findSimilar, hnswIndexExists, EMBEDDING_MODEL_TAG } from "../embeddings";
import { loadMatchPreferencesMap, bothPrefsEnabled, loadMatchingDisabledSet, neitherMatchingDisabled } from "./filters";
import { haversineKm } from "../geo";
import { protectedNicknamesSqlArray } from "./protection-filter";

// ─── Default dei parametri configurabili via AppSetting ─────────────────────
const DEFAULT_TOP_K = 10;
const DEFAULT_SIM_THRESHOLD = Number(process.env.BIO_AFFINITY_THRESHOLD ?? 0.65);
// Budget di wall-clock interno: lascia ~15s di margine rispetto al hard timeout
// (DEFAULT_MATCHING_CYCLE_TIMEOUT_MS = 90s) dello scheduler.
const DEFAULT_BUDGET_MS = 75_000;
// 0 = nessun cap sul numero di "driver" per ciclo (governa solo il budget).
const DEFAULT_BATCH_SIZE = 0;

const MAX_NEW_MATCHES_PER_RUN = 500;
const CANDIDATE_FETCH_MULTIPLIER = 4;

const CURSOR_KEY = "bio_affinity_cursor_user_id";

type BioRow = {
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  max_pickup_distance: number | null;
  embedding: string; // pgvector serialised as text
  model: string | null;
};

let lastStats = {
  matchesCreated: 0,
  usersProcessed: 0,
  usersRemaining: 0,
  durationMs: 0,
  stoppedByBudget: false,
};
export function getLastBioAffinityStats() {
  return lastStats;
}

function parseEmbedding(raw: string | number[]): number[] {
  if (Array.isArray(raw)) return raw;
  // pgvector returns "[0.1,0.2,...]"
  const trimmed = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  return trimmed.split(",").map((v) => Number(v));
}

/**
 * Legge un AppSetting tollerando sia la colonna `value` (stringa) sia
 * `valueJson` (jsonb), così è indifferente come l'admin lo abbia salvato.
 */
async function readSettingRaw(key: string): Promise<string | null> {
  try {
    const s = await storage.getAppSetting(key);
    if (!s) return null;
    if (s.value != null && s.value !== "") return s.value;
    if (s.valueJson != null) return String(s.valueJson);
    return null;
  } catch {
    return null;
  }
}

async function readNumberSetting(key: string, fallback: number): Promise<number> {
  const raw = await readSettingRaw(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function readBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const raw = await readSettingRaw(key);
  if (raw == null) return fallback;
  return raw === "true" || raw === "1";
}

export async function runBioAffinityMatching(): Promise<number> {
  const startedAt = Date.now();
  let matchesCreated = 0;
  let usersProcessed = 0;
  let usersRemaining = 0;
  let stoppedByBudget = false;

  const finalize = () => {
    lastStats = {
      matchesCreated,
      usersProcessed,
      usersRemaining,
      durationMs: Date.now() - startedAt,
      stoppedByBudget,
    };
  };

  try {
    // ── Parametri configurabili ───────────────────────────────────────────
    // Pool budget (Task #5323): letture di setup in sequenza, non con
    // Promise.all — quest'ultimo apriva 5 connessioni del pool insieme (burst
    // non budgettato che contribuisce ai picchi di "waiting" con pool max=10).
    const budgetMs = await readNumberSetting("bio_affinity_budget_ms", DEFAULT_BUDGET_MS);
    const topK = await readNumberSetting("bio_affinity_top_k", DEFAULT_TOP_K);
    const simThreshold = await readNumberSetting("bio_affinity_threshold", DEFAULT_SIM_THRESHOLD);
    const batchSize = await readNumberSetting("bio_affinity_batch_size", DEFAULT_BATCH_SIZE);
    const requireHnsw = await readBoolSetting("bio_affinity_require_hnsw", false);
    const BUDGET_MS = Math.max(1_000, budgetMs);
    const TOP_K = Math.max(1, Math.floor(topK));
    const SIM_THRESHOLD = Math.max(0, Math.min(1, simThreshold));
    const BATCH_SIZE = Math.max(0, Math.floor(batchSize));

    // ── Controllo HNSW esplicito a inizio job ─────────────────────────────
    const hnswOk = await hnswIndexExists();
    if (!hnswOk) {
      console.warn(
        "[BioAffinity] WARN: indice HNSW 'embeddings_vec_hnsw_cosine_idx' mancante — " +
          "findSimilar() userà un sequential scan (molto lento a scala).",
      );
      if (requireHnsw) {
        console.warn(
          "[BioAffinity] bio_affinity_require_hnsw=true — run saltato per non saturare il pool con scansioni sequenziali.",
        );
        finalize();
        return 0;
      }
    }

    // ── Metadata di TUTTI gli utenti con embedding bio ────────────────────
    // Serve l'intero insieme per userMeta (i candidati userB di findSimilar
    // possono essere ovunque nella lista), ordinato per entity_id per il cursore.
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
      ORDER BY e.entity_id ASC
    `);
    const rows = (rowsRes.rows ?? rowsRes) as BioRow[];
    if (rows.length < 2) {
      console.log(`[BioAffinity] Solo ${rows.length} utenti con embedding bio, skip.`);
      finalize();
      return 0;
    }

    // ── Cursore persistente ───────────────────────────────────────────────
    const cursor = (await readSettingRaw(CURSOR_KEY)) ?? "";
    const drivers = cursor ? rows.filter((r) => r.user_id > cursor) : rows;
    if (drivers.length === 0) {
      // Cursore oltre la fine della lista (o lista accorciata): azzera e
      // riparti dall'inizio al prossimo ciclo.
      await storage.upsertAppSetting(CURSOR_KEY, "");
      console.log(
        `[BioAffinity] Cursore '${cursor}' oltre la fine della lista (${rows.length} utenti) — azzerato, ripartirà dall'inizio.`,
      );
      finalize();
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

    let lastProcessedUserId: string | null = null;
    let reachedEnd = false;

    outer:
    for (let i = 0; i < drivers.length; i++) {
      const row = drivers[i];

      // Budget di tempo interno: fermati da solo prima del hard timeout.
      if (Date.now() - startedAt >= BUDGET_MS) {
        stoppedByBudget = true;
        break;
      }
      // Cap opzionale sul numero di driver per ciclo (0 = illimitato).
      if (BATCH_SIZE > 0 && usersProcessed >= BATCH_SIZE) {
        break;
      }
      if (matchesCreated >= MAX_NEW_MATCHES_PER_RUN) break;

      usersProcessed++;
      lastProcessedUserId = row.user_id;
      if (i === drivers.length - 1) reachedEnd = true;

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

    // ── Persistenza del cursore ───────────────────────────────────────────
    // Se abbiamo esaurito la lista (ultimo driver processato) azzeriamo il
    // cursore per ripartire dall'inizio; altrimenti salviamo l'ultimo utente
    // processato così il prossimo ciclo continua da lì.
    const completedFullList = reachedEnd && !stoppedByBudget && matchesCreated < MAX_NEW_MATCHES_PER_RUN;
    let nextCursor: string;
    if (completedFullList || lastProcessedUserId == null) {
      nextCursor = "";
    } else {
      nextCursor = lastProcessedUserId;
    }
    await storage.upsertAppSetting(CURSOR_KEY, nextCursor);

    usersRemaining = completedFullList
      ? 0
      : Math.max(0, drivers.length - usersProcessed);

    const elapsed = Date.now() - startedAt;
    finalize();

    const stopReason = stoppedByBudget
      ? "budget esaurito"
      : matchesCreated >= MAX_NEW_MATCHES_PER_RUN
        ? "cap match raggiunto"
        : completedFullList
          ? "lista completata"
          : "batch completato";
    console.log(
      `[BioAffinity] ${matchesCreated} nuovi match in ${(elapsed / 1000).toFixed(1)}s — ` +
        `processati ${usersProcessed} utenti, ~${usersRemaining} rimanenti, ` +
        `soglia=${SIM_THRESHOLD}, budget=${(BUDGET_MS / 1000).toFixed(0)}s, ` +
        `stop=${stopReason}, cursore=${nextCursor || "(inizio)"}`,
    );
    return matchesCreated;
  } catch (err) {
    console.error("[BioAffinity] errore:", err);
    finalize();
    return matchesCreated;
  }
}

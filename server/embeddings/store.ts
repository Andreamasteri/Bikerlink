import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { embeddings, embeddingCallLog } from "@shared/db";
import {
  generateEmbedding,
  generateLocalEmbedding,
  getLastUsedModelTag,
  EMBEDDING_DIMENSIONS,
} from "./client";
import { storage } from "../storage";

const EF_SEARCH_DEFAULT = 64;
const EF_SEARCH_MIN = 1;
const EF_SEARCH_MAX = 1000;

const HNSW_INDEX_NAME = "embeddings_vec_hnsw_cosine_idx";

/**
 * Once-per-process guard: query pg_indexes once to verify the HNSW index
 * exists. If it is missing we emit a clear warning so operators know that
 * findSimilar() is silently falling back to a sequential scan.
 */
let _hnswIndexChecked = false;
async function warnIfHnswIndexMissing(
  client: import("pg").PoolClient,
): Promise<void> {
  if (_hnswIndexChecked) return;
  try {
    const res = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'embeddings'
           AND indexname = $1
       ) AS exists`,
      [HNSW_INDEX_NAME],
    );
    _hnswIndexChecked = true;
    if (!(res.rows[0]?.exists ?? false)) {
      console.warn(
        `[embeddings] WARNING: HNSW index '${HNSW_INDEX_NAME}' non trovato — ` +
          "findSimilar() userà un sequential scan (molto lento a scala). " +
          "Riavviare il server per il self-heal automatico o eseguire la migration manualmente.",
      );
    }
  } catch {
    // Non-fatal: the index check must never block the actual query.
  }
}

/**
 * Read hnsw.ef_search from AppSetting `embedding_ef_search`.
 * Falls back to 64 if the setting is absent or invalid.
 */
async function getEfSearch(): Promise<number> {
  try {
    const setting = await storage.getAppSetting("embedding_ef_search");
    if (!setting?.value) return EF_SEARCH_DEFAULT;
    const n = parseInt(setting.value, 10);
    if (!Number.isFinite(n)) return EF_SEARCH_DEFAULT;
    return Math.max(EF_SEARCH_MIN, Math.min(EF_SEARCH_MAX, n));
  } catch {
    return EF_SEARCH_DEFAULT;
  }
}

// ─── Daily cap enforcement ─────────────────────────────────────────────────
// In-memory counter of real OpenAI API calls (non-cached) made today (UTC date).
// Resets automatically when the UTC date changes.
// Cap is read from AppSetting `embedding_daily_cap` (default 500), cached 5min.

const DEFAULT_DAILY_CAP = 500;
let _todayApiCallCount = 0;
let _todayDateStr = "";          // "YYYY-MM-DD" UTC
let _cachedCap: number | null = null;
let _capCacheExpiry = 0;

function _utcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function _resetCounterIfNewDay(): void {
  const today = _utcDateStr();
  if (today !== _todayDateStr) {
    _todayDateStr = today;
    _todayApiCallCount = 0;
  }
}

async function getDailyCap(): Promise<number> {
  if (_cachedCap !== null && Date.now() < _capCacheExpiry) return _cachedCap;
  try {
    const setting = await storage.getAppSetting("embedding_daily_cap");
    const n = setting?.value ? parseInt(setting.value, 10) : NaN;
    _cachedCap = Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
  } catch {
    _cachedCap = DEFAULT_DAILY_CAP;
  }
  _capCacheExpiry = Date.now() + 5 * 60 * 1000;
  return _cachedCap;
}

/** Expose today's API call count for the /stats endpoint (read-only). */
export function getTodayEmbeddingApiCallCount(): number {
  _resetCounterIfNewDay();
  return _todayApiCallCount;
}

/** Invalidate the in-memory cap cache so the next call re-reads from AppSetting. */
export function invalidateDailyCapCache(): void {
  _cachedCap = null;
  _capCacheExpiry = 0;
}

// ─── Audit logging ─────────────────────────────────────────────────────────
// Fire-and-forget insert into embedding_call_log. Never blocks the caller.

function logEmbeddingCall(
  entityType: string,
  entityId: string,
  field: string,
  model: string,
  cached: boolean,
): void {
  db.insert(embeddingCallLog)
    .values({ entityType, entityId, field, model, cached })
    .catch((err) => {
      console.warn("[Embed] log insert failed (non-fatal):", (err as Error)?.message ?? err);
    });
}

/**
 * Task #2514 — Embeddings store: upsert + similarity search helpers.
 */

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function toVectorLiteral(vec: number[]): string {
  if (vec.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Vector dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${vec.length}`,
    );
  }
  return `[${vec.join(",")}]`;
}

export interface UpsertEmbeddingResult {
  id: string;
  cached: boolean;
  model: string;
  durationMs: number;
}

/**
 * Generate (or reuse cached) embedding for `text` and upsert it under
 * `(entityType, entityId, field)`. When the sourceHash matches the existing
 * row, no API call is made and `cached=true` is returned.
 *
 * Hard daily cap: if the number of real OpenAI API calls today exceeds
 * `embedding_daily_cap` (default 500), the local HF fallback is used instead
 * and the result is tagged with model='local:cap_reached'.
 */
export async function upsertEmbedding(
  entityType: string,
  entityId: string,
  field: string,
  text: string,
): Promise<UpsertEmbeddingResult> {
  const cleaned = text?.trim();
  if (!cleaned) {
    throw new Error("upsertEmbedding: testo vuoto");
  }
  const hash = sha256(cleaned);
  const started = Date.now();

  const existing = await db.execute<{ id: string; source_hash: string | null; model: string | null }>(
    sql`SELECT id, source_hash, model FROM embeddings
        WHERE entity_type = ${entityType}
          AND entity_id = ${entityId}
          AND field = ${field}
        LIMIT 1`,
  );
  const existingRow = (existing.rows ?? existing)[0] as
    | { id: string; source_hash: string | null; model: string | null }
    | undefined;
  if (existingRow && existingRow.source_hash === hash) {
    const model = existingRow.model ?? "unknown";
    logEmbeddingCall(entityType, entityId, field, model, true);
    return {
      id: existingRow.id,
      cached: true,
      model,
      durationMs: Date.now() - started,
    };
  }

  // ── Daily cap check ────────────────────────────────────────────────────
  _resetCounterIfNewDay();
  const cap = await getDailyCap();

  let vector: number[];
  let usedModel: string;

  if (_todayApiCallCount >= cap) {
    console.warn(
      `[Embed] Daily cap reached (cap=${cap}, today=${_todayApiCallCount})` +
      ` — local HF fallback for field=${field} entity=${entityType}/${entityId}`,
    );
    vector = await generateLocalEmbedding(cleaned);
    usedModel = "local:cap_reached";
  } else {
    vector = await generateEmbedding(cleaned);
    usedModel = getLastUsedModelTag();
    if (!usedModel.startsWith("local:")) {
      _todayApiCallCount++;
      console.info(
        `[Embed] NEW field=${field} entity=${entityType}/${entityId}` +
        ` model=${usedModel} todayApiCalls=${_todayApiCallCount}/${cap}`,
      );
    }
  }

  const literal = toVectorLiteral(vector);

  const upserted = await db.execute<{ id: string }>(
    sql`INSERT INTO embeddings
          (entity_type, entity_id, field, embedding, model, source_hash, updated_at)
        VALUES
          (${entityType}, ${entityId}, ${field}, ${literal}::vector,
           ${usedModel}, ${hash}, now())
        ON CONFLICT (entity_type, entity_id, field) DO UPDATE
          SET embedding = EXCLUDED.embedding,
              model = EXCLUDED.model,
              source_hash = EXCLUDED.source_hash,
              updated_at = now()
        RETURNING id`,
  );
  const row = (upserted.rows ?? upserted)[0] as { id: string };

  logEmbeddingCall(entityType, entityId, field, usedModel, false);

  return {
    id: row.id,
    cached: false,
    model: usedModel,
    durationMs: Date.now() - started,
  };
}

export interface SimilarHit {
  id: string;
  entityType: string;
  entityId: string;
  field: string;
  similarity: number;
  model: string;
  updatedAt: Date;
}

/**
 * Find rows whose embedding is similar to `vec`, ordered by cosine distance.
 * Filters by `entityType` and `field`. Returns at most `limit` rows whose
 * similarity is >= `minSimilarity` (default 0).
 */
export async function findSimilar(
  entityType: string,
  field: string,
  vec: number[],
  limit = 5,
  minSimilarity = 0,
  modelFilter?: string,
): Promise<SimilarHit[]> {
  const literal = toVectorLiteral(vec);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const maxDistance = 1 - Math.max(0, Math.min(1, minSimilarity));
  const efSearch = await getEfSearch();

  const client = await pool.connect();
  try {
    await warnIfHnswIndexMissing(client);
    await client.query("BEGIN");
    await client.query(`SET LOCAL hnsw.ef_search = ${efSearch}`);

    const selectSql = modelFilter
      ? `SELECT id, entity_type, entity_id, field, model, updated_at,
                (embedding <=> $1::vector) AS distance
         FROM embeddings
         WHERE entity_type = $2
           AND field = $3
           AND model = $4
           AND (embedding <=> $1::vector) <= $5
         ORDER BY embedding <=> $1::vector
         LIMIT $6`
      : `SELECT id, entity_type, entity_id, field, model, updated_at,
                (embedding <=> $1::vector) AS distance
         FROM embeddings
         WHERE entity_type = $2
           AND field = $3
           AND (embedding <=> $1::vector) <= $4
         ORDER BY embedding <=> $1::vector
         LIMIT $5`;

    const params = modelFilter
      ? [literal, entityType, field, modelFilter, maxDistance, safeLimit]
      : [literal, entityType, field, maxDistance, safeLimit];

    const result = await client.query<{
      id: string;
      entity_type: string;
      entity_id: string;
      field: string;
      distance: number | string;
      model: string;
      updated_at: Date;
    }>(selectSql, params);

    await client.query("COMMIT");

    return result.rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      field: r.field,
      similarity: 1 - Number(r.distance),
      model: r.model,
      updatedAt: r.updated_at,
    }));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete the embedding row for `(entityType, entityId, field)` if it exists.
 * Returns the number of rows deleted (0 or 1).
 */
export async function deleteEmbedding(
  entityType: string,
  entityId: string,
  field: string,
): Promise<number> {
  const res = await db.execute(
    sql`DELETE FROM embeddings
        WHERE entity_type = ${entityType}
          AND entity_id = ${entityId}
          AND field = ${field}`,
  );
  const count =
    (res as unknown as { rowCount?: number }).rowCount ??
    (Array.isArray((res as unknown as { rows?: unknown[] }).rows)
      ? ((res as unknown as { rows: unknown[] }).rows.length as number)
      : 0);
  return count ?? 0;
}

export { embeddings };

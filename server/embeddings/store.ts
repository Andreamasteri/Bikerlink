import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { embeddings } from "@shared/db";
import {
  generateEmbedding,
  EMBEDDING_MODEL_TAG,
  EMBEDDING_DIMENSIONS,
} from "./client";

/**
 * Task #2514 — Embeddings store: upsert + similarity search helpers.
 *
 * Uses pgvector's cosine distance operator `<=>` and the HNSW index on
 * `embeddings.embedding` (vector_cosine_ops). Similarity is returned as
 * `1 - distance` in `[0, 1]` (clamped server-side by pgvector).
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

  const existing = await db.execute<{ id: string; source_hash: string | null }>(
    sql`SELECT id, source_hash FROM embeddings
        WHERE entity_type = ${entityType}
          AND entity_id = ${entityId}
          AND field = ${field}
        LIMIT 1`,
  );
  const existingRow = (existing.rows ?? existing)[0] as
    | { id: string; source_hash: string | null }
    | undefined;
  if (existingRow && existingRow.source_hash === hash) {
    return {
      id: existingRow.id,
      cached: true,
      model: EMBEDDING_MODEL_TAG,
      durationMs: Date.now() - started,
    };
  }

  const vector = await generateEmbedding(cleaned);
  const literal = toVectorLiteral(vector);

  const upserted = await db.execute<{ id: string }>(
    sql`INSERT INTO embeddings
          (entity_type, entity_id, field, embedding, model, source_hash, updated_at)
        VALUES
          (${entityType}, ${entityId}, ${field}, ${literal}::vector,
           ${EMBEDDING_MODEL_TAG}, ${hash}, now())
        ON CONFLICT (entity_type, entity_id, field) DO UPDATE
          SET embedding = EXCLUDED.embedding,
              model = EXCLUDED.model,
              source_hash = EXCLUDED.source_hash,
              updated_at = now()
        RETURNING id`,
  );
  const row = (upserted.rows ?? upserted)[0] as { id: string };
  return {
    id: row.id,
    cached: false,
    model: EMBEDDING_MODEL_TAG,
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
): Promise<SimilarHit[]> {
  const literal = toVectorLiteral(vec);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const maxDistance = 1 - Math.max(0, Math.min(1, minSimilarity));

  const result = await db.execute<{
    id: string;
    entity_type: string;
    entity_id: string;
    field: string;
    distance: number;
    model: string;
    updated_at: Date;
  }>(
    sql`SELECT id, entity_type, entity_id, field, model, updated_at,
               (embedding <=> ${literal}::vector) AS distance
        FROM embeddings
        WHERE entity_type = ${entityType}
          AND field = ${field}
          AND (embedding <=> ${literal}::vector) <= ${maxDistance}
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${safeLimit}`,
  );
  const rows = (result.rows ?? result) as Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    field: string;
    distance: number | string;
    model: string;
    updated_at: Date;
  }>;
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    field: r.field,
    similarity: 1 - Number(r.distance),
    model: r.model,
    updatedAt: r.updated_at,
  }));
}

export { embeddings };

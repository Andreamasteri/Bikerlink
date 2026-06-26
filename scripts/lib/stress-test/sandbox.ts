/**
 * Tabelle sandbox isolate dello stress test (Task #4970).
 *
 * TUTTE le scritture del test vivono in tabelle prefissate `_stress_`, create e
 * distrutte da questo modulo: zero impatto sui dati reali. Le tabelle riusano le
 * estensioni già attive nel DB (pgvector per la similarity HNSW, PostGIS per le
 * query spaziali) ma su dati totalmente sintetici.
 */
import type { Pool, RunContext } from "./types";

export const SANDBOX_TABLES = ["_stress_writes", "_stress_embeddings", "_stress_spatial"] as const;

const EMBEDDING_DIM = 1536;

/** Genera un literal pgvector `[f,f,...]` normalizzato grossolanamente. */
function randomVectorLiteral(): string {
  const parts: number[] = new Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) parts[i] = Math.round((Math.random() * 2 - 1) * 1000) / 1000;
  return `[${parts.join(",")}]`;
}

export interface SandboxSeedOptions {
  embeddingRows: number;
  spatialRows: number;
  /** Quanti literal vettoriali pre-generare per riuso a runtime (basso CPU client). */
  vectorPoolSize: number;
}

/**
 * Crea le tabelle sandbox, le indicizza (HNSW + GIST) e le riempie di dati
 * sintetici. Idempotente: CREATE TABLE IF NOT EXISTS + TRUNCATE prima del seed
 * così rilanci consecutivi ripartono puliti.
 */
export async function setupSandbox(pool: Pool, opts: SandboxSeedOptions): Promise<RunContext> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _stress_writes (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        worker      integer NOT NULL,
        seq         bigint  NOT NULL,
        value       double precision NOT NULL,
        payload     text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS _stress_embeddings (
        id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        label     text NOT NULL,
        embedding vector(${EMBEDDING_DIM}) NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS _stress_spatial (
        id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        geom geography(Point, 4326) NOT NULL
      )
    `);

    // Reset per ripartire pulito a ogni run.
    await client.query(`TRUNCATE _stress_writes, _stress_embeddings, _stress_spatial`);

    // Seed embeddings (per la similarity HNSW serve massa critica).
    for (let i = 0; i < opts.embeddingRows; i++) {
      await client.query(
        `INSERT INTO _stress_embeddings (label, embedding) VALUES ($1, $2::vector)`,
        [`seed_${i}`, randomVectorLiteral()],
      );
    }

    // Seed spatial: punti random in un bounding box ampio (Europa + Nord Africa).
    await client.query(
      `INSERT INTO _stress_spatial (name, geom)
       SELECT 'p_' || g,
              ST_SetSRID(ST_MakePoint(-10 + random() * 50, 30 + random() * 35), 4326)::geography
       FROM generate_series(1, $1) AS g`,
      [opts.spatialRows],
    );

    // Indici: HNSW cosine per gli embeddings, GIST per la geografia.
    await client.query(
      `CREATE INDEX IF NOT EXISTS _stress_embeddings_hnsw_idx
         ON _stress_embeddings USING hnsw (embedding vector_cosine_ops)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS _stress_spatial_geom_idx
         ON _stress_spatial USING gist (geom)`,
    );
    await client.query(`ANALYZE _stress_embeddings, _stress_spatial`);

    const vectorLiterals = Array.from({ length: opts.vectorPoolSize }, randomVectorLiteral);
    return {
      vectorLiterals,
      spatialRows: opts.spatialRows,
      embeddingRows: opts.embeddingRows,
    };
  } finally {
    client.release();
  }
}

/** Droppa tutte le tabelle sandbox. Best-effort: non lancia in caso di errore. */
export async function teardownSandbox(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`DROP TABLE IF EXISTS ${SANDBOX_TABLES.join(", ")} CASCADE`);
  } finally {
    client.release();
  }
}

export interface IntegrityResult {
  totalRows: number;
  distinctIds: number;
  duplicateIds: number;
  nullPayloads: number;
  /** Righe attese (inserimenti contati con successo dall'accumulatore). */
  expectedRows: number;
}

/**
 * Verifica l'integrità di `_stress_writes` dopo lo storm di write concorrenti:
 * - conteggio reale vs atteso (write perse?)
 * - id duplicati (doppia applicazione sotto concorrenza?)
 * - payload NULL (corruzione?)
 */
export async function verifyWriteIntegrity(pool: Pool, expectedRows: number): Promise<IntegrityResult> {
  const client = await pool.connect();
  try {
    const r = await client.query<{
      total: string;
      distinct_ids: string;
      null_payloads: string;
    }>(`
      SELECT
        COUNT(*)                                  AS total,
        COUNT(DISTINCT id)                        AS distinct_ids,
        COUNT(*) FILTER (WHERE payload IS NULL)   AS null_payloads
      FROM _stress_writes
    `);
    const row = r.rows[0];
    const totalRows = Number(row?.total ?? 0);
    const distinctIds = Number(row?.distinct_ids ?? 0);
    return {
      totalRows,
      distinctIds,
      duplicateIds: totalRows - distinctIds,
      nullPayloads: Number(row?.null_payloads ?? 0),
      expectedRows,
    };
  } finally {
    client.release();
  }
}

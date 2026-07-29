import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response";
import {
  generateEmbedding,
  findSimilar,
  getHnswIndexStatus,
  rebuildHnswIndex,
  EMBEDDING_MODEL_TAG,
  EMBEDDING_DIMENSIONS,
} from "../../embeddings";
import { pool } from "../../db";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { storage } from "../../storage";
import { getTodayEmbeddingApiCallCount, invalidateDailyCapCache } from "../../embeddings/store";

const router = Router();

const testBodySchema = z.object({
  text: z.string().min(1).max(8000),
  entityType: z.string().min(1).max(40).optional(),
  field: z.string().min(1).max(40).optional(),
});

/**
 * Task #2514 — Smoke test endpoint.
 *
 * POST /api/admin/embeddings/test
 * Body: { text: string, entityType?: string, field?: string }
 *
 * Generates an embedding for `text` and returns the vector dimensions,
 * generation latency, and (if `entityType`+`field` are provided) the top 5
 * most similar rows from the embeddings table.
 */
router.post("/test", async (req: Request, res: Response) => {
  const parsed = testBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Body non valido");
  }
  const { text, entityType, field } = parsed.data;

  try {
    const genStarted = Date.now();
    const vector = await generateEmbedding(text);
    const genMs = Date.now() - genStarted;

    let similar: Awaited<ReturnType<typeof findSimilar>> = [];
    let searchMs: number | null = null;
    if (entityType && field) {
      const searchStarted = Date.now();
      similar = await findSimilar(entityType, field, vector, 5, 0);
      searchMs = Date.now() - searchStarted;
    }

    return sendSuccess(res, {
      model: EMBEDDING_MODEL_TAG,
      dimensions: vector.length,
      expectedDimensions: EMBEDDING_DIMENSIONS,
      generationMs: genMs,
      searchMs,
      preview: vector.slice(0, 8),
      similar,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/embeddings/test] error:", msg);
    return sendError(res, 500, `Errore generazione embedding: ${msg}`);
  }
});

/**
 * GET /api/admin/embeddings/coverage
 *
 * Returns embedding coverage for active users broken down by field.
 * Focuses on `field = 'bio'` (the primary matching field) but also
 * reports aggregates for any other fields present.
 *
 * Response shape:
 * {
 *   efSearch: number,          // current hnsw.ef_search value in use
 *   activeUsers: number,       // total users with status = 'active'
 *   bioEligibleUsers: number,   // active users with a non-empty bio
 *   byField: Array<{
 *     field: string,
 *     eligibleUsers: number,
 *     withEmbedding: number,
 *     missingEmbedding: number,
 *     coveragePct: number,     // 0–100
 *     lastUpdated: string | null,
 *   }>,
 *   coverageWarning: boolean,  // true when bio coverage < threshold
 * }
 */
router.get("/coverage", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const [
        activeUsersResult,
        bioEligibleResult,
        embeddingStatsResult,
        bioCoverageResult,
        efSearchSetting,
        thresholdSetting,
        capSetting,
      ] = await Promise.all([
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM users WHERE status = 'active'`,
        ),
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total
           FROM users u
           JOIN user_profiles up ON up.user_id = u.id
           WHERE u.status = 'active'
             AND up.bio IS NOT NULL
             AND trim(up.bio) != ''`,
        ),
        client.query<{
          field: string;
          with_embedding: string;
          last_updated: Date | null;
        }>(
          `SELECT e.field,
                  COUNT(DISTINCT e.entity_id) AS with_embedding,
                  MAX(e.updated_at)            AS last_updated
           FROM embeddings e
           JOIN users u ON u.id = e.entity_id
             AND u.status = 'active'
           WHERE e.entity_type = 'user'
           GROUP BY e.field`,
        ),
        client.query<{ with_embedding: string; last_updated: Date | null }>(
          `SELECT COUNT(DISTINCT e.entity_id) AS with_embedding,
                  MAX(e.updated_at) AS last_updated
           FROM embeddings e
           JOIN users u ON u.id = e.entity_id AND u.status = 'active'
           JOIN user_profiles up ON up.user_id = u.id
           WHERE e.entity_type = 'user'
             AND e.field = 'bio'
             AND up.bio IS NOT NULL
             AND trim(up.bio) != ''
             AND e.source_hash = encode(sha256(trim(up.bio)::bytea), 'hex')`,
        ),
        storage.getAppSetting("embedding_ef_search"),
        storage.getAppSetting("embedding_coverage_threshold"),
        storage.getAppSetting("embedding_daily_cap"),
      ]);

      const activeUsers = parseInt(activeUsersResult.rows[0]?.total ?? "0", 10);
      const bioEligibleUsers = parseInt(bioEligibleResult.rows[0]?.total ?? "0", 10);

      const efSearch = (() => {
        const raw = efSearchSetting?.value;
        if (!raw) return 64;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? Math.max(1, Math.min(1000, n)) : 64;
      })();

      const coverageThreshold = (() => {
        const raw = thresholdSetting?.value;
        if (!raw) return 80;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 80;
      })();

      const dailyCap = (() => {
        const raw = capSetting?.value;
        if (!raw) return 500;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n > 0 ? n : 500;
      })();

      const fieldMap = new Map<
        string,
        { withEmbedding: number; lastUpdated: Date | null }
      >();
      for (const row of embeddingStatsResult.rows) {
        fieldMap.set(row.field, {
          withEmbedding: parseInt(row.with_embedding, 10),
          lastUpdated: row.last_updated,
        });
      }
      const currentBio = bioCoverageResult.rows[0];
      fieldMap.set("bio", {
        withEmbedding: parseInt(currentBio?.with_embedding ?? "0", 10),
        lastUpdated: currentBio?.last_updated ?? null,
      });

      const trackedFields = new Set([
        "bio",
        ...Array.from(fieldMap.keys()),
      ]);

      const byField = Array.from(trackedFields).map((field) => {
        const data = fieldMap.get(field);
        const eligibleUsers = field === "bio" ? bioEligibleUsers : activeUsers;
        const withEmbedding = Math.min(data?.withEmbedding ?? 0, eligibleUsers);
        const missingEmbedding = Math.max(0, eligibleUsers - withEmbedding);
        const coveragePct =
          eligibleUsers > 0
            ? Math.round((withEmbedding / eligibleUsers) * 100 * 10) / 10
            : 100;
        return {
          field,
          eligibleUsers,
          withEmbedding,
          missingEmbedding,
          coveragePct,
          lastUpdated: data?.lastUpdated?.toISOString() ?? null,
        };
      });

      const bioBioRow = byField.find((r) => r.field === "bio");
      const coverageWarning =
        bioBioRow !== undefined && bioBioRow.coveragePct < coverageThreshold;

      return sendSuccess(res, {
        efSearch,
        activeUsers,
        bioEligibleUsers,
        byField,
        coverageWarning,
        coverageThresholdPct: coverageThreshold,
        dailyCap,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/embeddings/coverage] error:", msg);
    return sendError(res, 500, `Errore coverage check: ${msg}`);
  }
});

/**
 * PATCH /api/admin/embeddings/settings
 *
 * Updates embedding-related AppSettings: `embedding_ef_search` and/or
 * `embedding_coverage_threshold`. Both are optional — only the keys present in
 * the body are updated.
 */
const settingsBodySchema = z.object({
  efSearch: z.number().int().min(1).max(1000).optional(),
  coverageThreshold: z.number().int().min(0).max(100).optional(),
  dailyCap: z.number().int().min(1).optional(),
});

router.patch("/settings", async (req: Request, res: Response) => {
  const parsed = settingsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Body non valido");
  }
  const { efSearch, coverageThreshold, dailyCap } = parsed.data;
  if (efSearch === undefined && coverageThreshold === undefined && dailyCap === undefined) {
    return sendError(res, 400, "Nessun campo da aggiornare");
  }

  try {
    const updates: Promise<unknown>[] = [];
    if (efSearch !== undefined) {
      updates.push(storage.upsertAppSetting("embedding_ef_search", String(efSearch)));
    }
    if (coverageThreshold !== undefined) {
      updates.push(storage.upsertAppSetting("embedding_coverage_threshold", String(coverageThreshold)));
    }
    if (dailyCap !== undefined) {
      updates.push(storage.upsertAppSetting("embedding_daily_cap", String(dailyCap)));
    }
    await Promise.all(updates);
    if (dailyCap !== undefined) {
      invalidateDailyCapCache();
    }
    return sendSuccess(res, { updated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/embeddings/settings] error:", msg);
    return sendError(res, 500, `Errore salvataggio impostazioni embedding: ${msg}`);
  }
});

/**
 * GET /api/admin/embeddings/stats
 *
 * Returns:
 *   - lastReport: the latest daily report from AppSetting `embedding_daily_report`
 *   - last7Days: per-day totals from embedding_call_log (API calls, cache hits, local fallback)
 *   - cap: current configured daily cap (AppSetting `embedding_daily_cap`, default 500)
 *   - todayApiCalls: in-memory counter for the current day
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [reportSetting, capSetting] = await Promise.all([
      storage.getAppSetting("embedding_daily_report"),
      storage.getAppSetting("embedding_daily_cap"),
    ]);

    const lastReport = reportSetting?.valueJson ?? null;
    const cap = capSetting?.value ? parseInt(capSetting.value, 10) : 500;
    const todayApiCalls = getTodayEmbeddingApiCallCount();

    // Last 7 days of totals from embedding_call_log
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows7d = await db.execute<{
      day: string;
      model: string;
      cached: boolean;
      cnt: string;
    }>(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'UTC') AS day,
        model,
        cached,
        COUNT(*) AS cnt
      FROM embedding_call_log
      WHERE created_at >= ${sevenDaysAgo}::timestamptz
      GROUP BY day, model, cached
      ORDER BY day
    `);

    type DayEntry = { apiCalls: number; cacheHits: number; localFallback: number };
    const dayMap = new Map<string, DayEntry>();
    for (const r of (rows7d.rows ?? []) as { day: string; model: string; cached: boolean; cnt: string }[]) {
      const day = typeof r.day === "string" ? r.day.slice(0, 10) : new Date(r.day).toISOString().slice(0, 10);
      const cnt = parseInt(r.cnt, 10);
      if (!dayMap.has(day)) dayMap.set(day, { apiCalls: 0, cacheHits: 0, localFallback: 0 });
      const entry = dayMap.get(day)!;
      if (r.cached) entry.cacheHits += cnt;
      else if (r.model.startsWith("local:")) entry.localFallback += cnt;
      else entry.apiCalls += cnt;
    }

    const last7Days = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return sendSuccess(res, {
      lastReport,
      last7Days,
      cap: Number.isFinite(cap) && cap > 0 ? cap : 500,
      todayApiCalls,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/embeddings/stats] error:", msg);
    return sendError(res, 500, `Errore stats embedding: ${msg}`);
  }
});

/**
 * GET /api/admin/embeddings/hnsw-status
 *
 * Reports the state of the HNSW cosine index on the embeddings table so admins
 * can verify in-app whether findSimilar() is using the index or falling back to
 * a slow sequential scan.
 *
 * Response: { exists: boolean, valid: boolean }
 *   - exists && valid   → OK
 *   - exists && !valid  → invalido (build interrotta)
 *   - !exists           → mancante
 */
router.get("/hnsw-status", async (_req: Request, res: Response) => {
  try {
    const status = await getHnswIndexStatus();
    return sendSuccess(res, { exists: status.exists, valid: status.valid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/embeddings/hnsw-status] error:", msg);
    return sendError(res, 500, `Errore controllo indice HNSW: ${msg}`);
  }
});

const rebuildBodySchema = z.object({
  force: z.boolean().optional(),
});

/**
 * POST /api/admin/embeddings/hnsw-rebuild
 *
 * (Re)creates the HNSW cosine index on the embeddings table, reusing the same
 * self-heal logic as the boot sequence (Phase 3 DB init):
 *   - missing → CREATE INDEX CONCURRENTLY
 *   - invalid → DROP INDEX CONCURRENTLY + CREATE INDEX CONCURRENTLY
 *   - valid   → no-op (unless body { force: true })
 *
 * CONCURRENTLY never takes an exclusive lock, so findSimilar() keeps serving
 * user queries (via sequential scan) while the index is being rebuilt.
 *
 * Response: { action: "created" | "rebuilt" | "noop", exists, valid }
 */
router.post("/hnsw-rebuild", async (req: Request, res: Response) => {
  const parsed = rebuildBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, "Body non valido");
  }
  try {
    const { action, status } = await rebuildHnswIndex(parsed.data.force ?? false);
    console.info(
      `[admin/embeddings/hnsw-rebuild] action=${action} exists=${status.exists} valid=${status.valid}`,
    );
    return sendSuccess(res, {
      action,
      exists: status.exists,
      valid: status.valid,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/embeddings/hnsw-rebuild] error:", msg);
    return sendError(res, 500, `Errore ricostruzione indice HNSW: ${msg}`);
  }
});

export default router;

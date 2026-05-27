import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response";
import {
  generateEmbedding,
  findSimilar,
  EMBEDDING_MODEL_TAG,
  EMBEDDING_DIMENSIONS,
} from "../../embeddings";

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

export default router;

/**
 * Task #2515 — In-process async queue for generating bio embeddings.
 *
 * Uses p-queue for bounded concurrency and Bottleneck (`limiters.openai`)
 * inside `upsertEmbedding` calls for global provider rate limiting.
 *
 * Fire-and-forget: callers enqueue and return immediately. Failures are
 * logged but do not affect the originating request.
 */

import PQueue from "p-queue";
import { upsertEmbedding } from "./store";
import { limiters } from "../lib/throttle";
import { redactPII } from "../lib/redact-pii";

const CONCURRENCY = Number(process.env.BIO_EMBED_CONCURRENCY ?? 2);
const MAX_BIO_CHARS = 2000;

const queue = new PQueue({ concurrency: CONCURRENCY });

function prepareText(raw: string): string {
  const trimmed = (raw ?? "").trim().slice(0, MAX_BIO_CHARS);
  if (!trimmed) return "";
  return redactPII(trimmed);
}

/**
 * Enqueue a bio embedding generation. Returns immediately.
 * Empty/whitespace bios are skipped silently.
 */
export function enqueueBioEmbedding(
  userId: string,
  bioText: string | null | undefined,
): void {
  if (!userId) return;
  const cleaned = prepareText(bioText ?? "");
  if (!cleaned) return;
  void queue.add(async () => {
    try {
      await limiters.openai.schedule(() =>
        upsertEmbedding("user", userId, "bio", cleaned),
      );
    } catch (err) {
      console.error(`[BioEmbed] generation failed for user ${userId}:`, err);
    }
  });
}

/**
 * Awaitable variant — used by the backfill script so it can throttle
 * batches and report progress.
 */
export async function runBioEmbeddingNow(
  userId: string,
  bioText: string,
): Promise<{ cached: boolean } | null> {
  const cleaned = prepareText(bioText);
  if (!cleaned) return null;
  const result = await limiters.openai.schedule(() =>
    upsertEmbedding("user", userId, "bio", cleaned),
  );
  return { cached: result.cached };
}

export function getBioQueueStats() {
  return { size: queue.size, pending: queue.pending, concurrency: CONCURRENCY };
}

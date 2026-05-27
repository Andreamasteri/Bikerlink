import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import pRetry, { AbortError } from "p-retry";

/**
 * Task #2514 — Embeddings client.
 *
 * Default provider: OpenAI `text-embedding-3-small` (1536 dim).
 * Motivazione in `replit.md`. Local fallback (HF transformers) NON è
 * implementato qui — vedi piano B documentato.
 */

export const EMBEDDING_MODEL_ID = "text-embedding-3-small";
export const EMBEDDING_MODEL_TAG = `openai:${EMBEDDING_MODEL_ID}`;
export const EMBEDDING_DIMENSIONS = 1536;

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

function getModel() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY non configurata: impossibile generare embeddings.",
    );
  }
  return openai.textEmbedding(EMBEDDING_MODEL_ID);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Embeddings ${label} timeout dopo ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function isRetryable(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; message?: string };
  const status = e?.statusCode ?? e?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  if (typeof e?.message === "string" && /timeout|ECONN|ENOTFOUND|fetch failed/i.test(e.message)) {
    return true;
  }
  return false;
}

/**
 * Generate an embedding for a single text. Returns a `number[]` of length
 * `EMBEDDING_DIMENSIONS`. Throws on persistent failure.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text?.trim();
  if (!cleaned) {
    throw new Error("generateEmbedding: testo vuoto");
  }
  const model = getModel();
  const result = await pRetry(
    async () => {
      try {
        const { embedding } = await withTimeout(
          embed({ model, value: cleaned }),
          REQUEST_TIMEOUT_MS,
          "embed",
        );
        return embedding;
      } catch (err) {
        if (!isRetryable(err)) throw new AbortError(err as Error);
        throw err;
      }
    },
    { retries: MAX_RETRIES, factor: 2, minTimeout: 500, maxTimeout: 5_000 },
  );
  return result as number[];
}

/**
 * Generate embeddings for many texts in a single API call.
 * Returns vectors in the same order as the input array.
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const cleaned = texts.map((t) => t?.trim() ?? "");
  if (cleaned.some((t) => !t)) {
    throw new Error("generateEmbeddings: almeno un testo è vuoto");
  }
  const model = getModel();
  const result = await pRetry(
    async () => {
      try {
        const { embeddings } = await withTimeout(
          embedMany({ model, values: cleaned }),
          REQUEST_TIMEOUT_MS,
          "embedMany",
        );
        return embeddings;
      } catch (err) {
        if (!isRetryable(err)) throw new AbortError(err as Error);
        throw err;
      }
    },
    { retries: MAX_RETRIES, factor: 2, minTimeout: 500, maxTimeout: 5_000 },
  );
  return result as number[][];
}

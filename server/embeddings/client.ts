import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import pRetry, { AbortError } from "p-retry";

/**
 * Task #2514 / #2515 — Embeddings client.
 *
 * Stack vincolante (vedi `_ai-stack-decision.md`):
 *   • Provider primario: OpenAI `text-embedding-3-large` con
 *     `dimensions=1536` (compatibile con la colonna pgvector esistente).
 *   • Fallback locale: `@huggingface/transformers` con un modello
 *     feature-extraction caricato pigramente. Usato quando OPENAI_API_KEY
 *     manca o quando OpenAI risponde con quota/429/5xx persistenti.
 *
 * Le righe generate dal fallback locale conservano provenienza nel campo
 * `model` (prefix `local:`) per distinguerle dalle righe OpenAI.
 */

export const EMBEDDING_MODEL_ID = "text-embedding-3-large";
export const EMBEDDING_MODEL_TAG = `openai:${EMBEDDING_MODEL_ID}`;
export const EMBEDDING_DIMENSIONS = 1536;
export const LOCAL_EMBEDDING_MODEL_ID = "Xenova/multilingual-e5-small";
export const LOCAL_EMBEDDING_MODEL_TAG = `local:${LOCAL_EMBEDDING_MODEL_ID}`;

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getModel() {
  return openai.textEmbedding(EMBEDDING_MODEL_ID);
}

// text-embedding-3-large defaults to 3072 dim; we coerce to 1536 to fit
// the existing pgvector column via providerOptions on each embed call.
const PROVIDER_OPTIONS = {
  openai: { dimensions: EMBEDDING_DIMENSIONS },
} as const;

// ─── Local fallback (Hugging Face Transformers) ────────────────────────────
// Caricamento pigro per evitare il costo di init quando OpenAI è disponibile.
// Il modello produce vettori a 384 dim, che proiettiamo a 1536 via
// concatenazione (4x) + L2-normalize, così restano confrontabili con
// embeddings di altre origini *all'interno del fallback* (rows tagged `local:`).
// La similarità coseno cross-provider (openai vs local) non è significativa:
// il matcher filtra per `model` quando serve confronto omogeneo.

type FeatureExtractionPipeline = (
  text: string | string[],
  options?: { pooling?: "mean" | "cls" | "none"; normalize?: boolean },
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

let _localPipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getLocalPipeline(): Promise<FeatureExtractionPipeline> {
  if (!_localPipelinePromise) {
    _localPipelinePromise = (async () => {
      const mod = await import("@huggingface/transformers");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pipeline types differ between major versions
      const pipeline = (mod as any).pipeline;
      const pipe = await pipeline(
        "feature-extraction",
        LOCAL_EMBEDDING_MODEL_ID,
        { quantized: true },
      );
      return pipe as FeatureExtractionPipeline;
    })().catch((err) => {
      _localPipelinePromise = null;
      throw err;
    });
  }
  return _localPipelinePromise;
}

function projectTo1536(vec: number[]): number[] {
  // Il modello locale (all-MiniLM-L6-v2) produce 384 dim. Replichiamo 4 volte
  // per arrivare a 1536, poi normalizziamo L2 per usabilità con cosine.
  if (vec.length === EMBEDDING_DIMENSIONS) return vec;
  const repeat = Math.ceil(EMBEDDING_DIMENSIONS / vec.length);
  const expanded: number[] = new Array(repeat * vec.length);
  for (let i = 0; i < repeat; i++) {
    for (let j = 0; j < vec.length; j++) {
      expanded[i * vec.length + j] = vec[j];
    }
  }
  const out = expanded.slice(0, EMBEDDING_DIMENSIONS);
  let norm = 0;
  for (const x of out) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

async function generateLocal(text: string): Promise<number[]> {
  const pipe = await getLocalPipeline();
  const out = await pipe(text, { pooling: "mean", normalize: true });
  const arr = Array.from(out.data as Float32Array);
  return projectTo1536(arr);
}

/**
 * Force local HF embedding regardless of OPENAI_API_KEY presence.
 * Used by the hard daily cap path in upsertEmbedding so we never call OpenAI
 * when the cap is reached, without needing to monkey-patch env vars.
 */
export async function generateLocalEmbedding(text: string): Promise<number[]> {
  const cleaned = text?.trim();
  if (!cleaned) throw new Error("generateLocalEmbedding: testo vuoto");
  const vec = await generateLocal(cleaned);
  _lastUsedModelTag = LOCAL_EMBEDDING_MODEL_TAG;
  return vec;
}

async function generateLocalMany(texts: string[]): Promise<number[][]> {
  const pipe = await getLocalPipeline();
  const out = await pipe(texts, { pooling: "mean", normalize: true });
  // dims is [batch, hidden]; reshape manually for safety.
  const data = Array.from(out.data as Float32Array);
  const [batch, hidden] =
    out.dims.length === 2 ? out.dims : [texts.length, data.length / texts.length];
  const result: number[][] = [];
  for (let i = 0; i < batch; i++) {
    result.push(projectTo1536(data.slice(i * hidden, (i + 1) * hidden)));
  }
  return result;
}

/**
 * Indica il tag del modello effettivamente usato per l'ultimo embedding
 * sintetizzato (utile a chi vuole loggare/persistere `model` corretto).
 * Aggiornato come effetto collaterale dalle funzioni di generazione.
 */
let _lastUsedModelTag: string = EMBEDDING_MODEL_TAG;
export function getLastUsedModelTag(): string {
  return _lastUsedModelTag;
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
  if (hasOpenAI()) {
    try {
      const model = getModel();
      const result = await pRetry(
        async () => {
          try {
            const { embedding } = await withTimeout(
              embed({ model, value: cleaned, providerOptions: PROVIDER_OPTIONS }),
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
      _lastUsedModelTag = EMBEDDING_MODEL_TAG;
      return result as number[];
    } catch (err) {
      console.warn(
        "[Embeddings] OpenAI fallita, fallback locale HF transformers:",
        (err as Error)?.message ?? err,
      );
    }
  } else {
    console.warn(
      "[Embeddings] OPENAI_API_KEY assente: uso fallback locale HF transformers.",
    );
  }
  const local = await generateLocal(cleaned);
  _lastUsedModelTag = LOCAL_EMBEDDING_MODEL_TAG;
  return local;
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
  if (hasOpenAI()) {
    try {
      const model = getModel();
      const result = await pRetry(
        async () => {
          try {
            const { embeddings } = await withTimeout(
              embedMany({ model, values: cleaned, providerOptions: PROVIDER_OPTIONS }),
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
      _lastUsedModelTag = EMBEDDING_MODEL_TAG;
      return result as number[][];
    } catch (err) {
      console.warn(
        "[Embeddings] OpenAI batch fallita, fallback locale HF transformers:",
        (err as Error)?.message ?? err,
      );
    }
  } else {
    console.warn(
      "[Embeddings] OPENAI_API_KEY assente: uso fallback locale HF transformers (batch).",
    );
  }
  const local = await generateLocalMany(cleaned);
  _lastUsedModelTag = LOCAL_EMBEDDING_MODEL_TAG;
  return local;
}

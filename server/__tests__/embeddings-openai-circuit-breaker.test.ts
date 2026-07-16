// Task #108 — Il reindex Nadir con quota OpenAI esaurita ritentava OpenAI 3x
// PER OGNI chunk (40+ retry "OpenAI fallita, fallback locale" consecutivi in
// prod), trasformando un reindex da ~1 minuto in molti minuti. Questo test
// blocca la regressione: un errore di quota esaurita deve aprire il circuit
// breaker una sola volta e le chiamate successive devono saltare dritte al
// fallback locale, senza nuovi tentativi contro OpenAI.
//
// Task #111 — verifica che le forme REALI di errore di @ai-sdk/openai (APICallError
// con responseBody + data strutturati) attivino correttamente isQuotaExhaustedError.
// Il test precedente usava solo un plain Error con messaggio in prosa; il provider
// reale produce un APICallError con i campi specifici dell'SDK.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const embedMock = vi.hoisted(() => vi.fn());
const embedManyMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embed: embedMock,
  embedMany: embedManyMock,
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: { textEmbedding: vi.fn(() => ({})) },
}));

// Fallback locale: mock leggero, nessun caricamento reale del modello HF.
// Il mock è batch-aware: quando riceve un array di N testi restituisce [N, 384]
// così generateLocalMany produce esattamente N vettori (come farebbe il vero modello).
vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(async () => async (text: unknown) => {
    const n = Array.isArray(text) ? text.length : 1;
    return {
      data: new Float32Array(384 * n).fill(0.01),
      dims: [n, 384],
    };
  }),
}));

// ── Helpers per costruire errori realistici ──────────────────────────────────

/** Forma prosa semplice (pre-Task#111, già coperta). */
function quotaExhaustedError() {
  const err = new Error(
    "429 You exceeded your current quota, please check your plan and billing details.",
  ) as Error & { statusCode?: number };
  err.statusCode = 429;
  return err;
}

/**
 * Forma REALE @ai-sdk/openai: APICallError con responseBody JSON grezzo + data
 * parsato. Il message arriva da `data.error.message` via errorToMessage(), mentre
 * code/type risiedono nel JSON, NON nel message.
 * Questo è il caso che il test pre-Task#111 NON copriva.
 */
function apiCallErrorQuotaExhausted(
  code: string = "insufficient_quota",
  httpStatus: number = 429,
) {
  const errorPayload = {
    error: {
      message: "You exceeded your current quota, please check your plan and billing details.",
      type: code,
      param: null,
      code,
    },
  };
  const err = new Error(errorPayload.error.message) as Error & {
    statusCode?: number;
    responseBody?: string;
    data?: unknown;
  };
  err.statusCode = httpStatus;
  err.responseBody = JSON.stringify(errorPayload);
  err.data = errorPayload;
  return err;
}

/** 429 di rate-limit puro: NON deve attivare il breaker. */
function rateLimitError() {
  const err = new Error("429 Too Many Requests — rate limit exceeded") as Error & {
    statusCode?: number;
  };
  err.statusCode = 429;
  return err;
}

// ── Suite principale ──────────────────────────────────────────────────────────

describe("embeddings client — OpenAI quota circuit breaker (Task #108/#111)", () => {
  const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key"; // pragma: allowlist secret
    embedMock.mockReset();
    embedManyMock.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  // ── Comportamento breaker base (pre-Task#111, regressione) ───────────────

  it("opens the breaker on a quota-exhausted error and skips OpenAI on subsequent calls without retrying", async () => {
    embedMock.mockRejectedValue(quotaExhaustedError());
    const client = await import("../embeddings/client");

    expect(client.isOpenAiCircuitOpen()).toBe(false);

    const first = await client.generateEmbedding("primo chunk");
    expect(first).toHaveLength(1536);
    expect(client.getLastUsedModelTag()).toBe(client.LOCAL_EMBEDDING_MODEL_TAG);
    // Un solo tentativo contro OpenAI per l'errore permanente (AbortError → niente retry pRetry).
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(client.isOpenAiCircuitOpen()).toBe(true);

    // Chunk successivo nello stesso "run": il breaker è aperto, NON deve
    // nemmeno tentare OpenAI (niente nuova chiamata a embed()).
    const second = await client.generateEmbedding("secondo chunk");
    expect(second).toHaveLength(1536);
    expect(client.getLastUsedModelTag()).toBe(client.LOCAL_EMBEDDING_MODEL_TAG);
    expect(embedMock).toHaveBeenCalledTimes(1); // ancora 1, non 2
  });

  it("does not open the breaker on a transient (non-quota) error", async () => {
    const transient = new Error("503 Service Unavailable") as Error & { statusCode?: number };
    transient.statusCode = 503;
    embedMock.mockRejectedValue(transient);
    const client = await import("../embeddings/client");

    await client.generateEmbedding("chunk transitorio");
    expect(client.isOpenAiCircuitOpen()).toBe(false);
    // 503 è retryable: pRetry tenta MAX_RETRIES+1 volte prima di ricadere sul locale.
    expect(embedMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("exposes the reason via getOpenAiCircuitBreakerStatus for admin visibility", async () => {
    embedMock.mockRejectedValue(quotaExhaustedError());
    const client = await import("../embeddings/client");

    await client.generateEmbedding("chunk");
    const status = client.getOpenAiCircuitBreakerStatus();
    expect(status.open).toBe(true);
    expect(status.reason).toMatch(/quota/i);
    expect(status.reopenAt).not.toBeNull();
  });

  // ── Forma reale @ai-sdk/openai (Task #111) ────────────────────────────────

  it("detects quota exhaustion from real APICallError shape (responseBody + data, code=insufficient_quota)", async () => {
    // Questo è il caso che la suite pre-Task#111 NON copriva: il provider reale
    // NON mette la stringa "quota" nel message se il message è solo il testo di
    // errore OpenAI. Il code e il type risiedono nel responseBody/data.
    const realErr = apiCallErrorQuotaExhausted("insufficient_quota");
    embedMock.mockRejectedValue(realErr);
    const client = await import("../embeddings/client");

    const vec = await client.generateEmbedding("chunk reale");
    expect(vec).toHaveLength(1536);
    // Il breaker deve essere aperto: rilevato da responseBody/data, non solo message.
    expect(client.isOpenAiCircuitOpen()).toBe(true);
    // Un solo tentativo: nessun retry su un errore permanente.
    expect(embedMock).toHaveBeenCalledTimes(1);
  });

  it("detects quota exhaustion from billing_hard_limit_reached error code", async () => {
    const realErr = apiCallErrorQuotaExhausted("billing_hard_limit_reached");
    embedMock.mockRejectedValue(realErr);
    const client = await import("../embeddings/client");

    const vec = await client.generateEmbedding("chunk billing limit");
    expect(vec).toHaveLength(1536);
    expect(client.isOpenAiCircuitOpen()).toBe(true);
    expect(embedMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT trip the breaker on a plain 429 rate-limit (no quota keyword)", async () => {
    // Un 429 transitorio (rate-limit puro) deve ritentare con backoff, non aprire il breaker.
    embedMock.mockRejectedValue(rateLimitError());
    const client = await import("../embeddings/client");

    await client.generateEmbedding("chunk rate-limit");
    // Il breaker resta chiuso: la parola "quota" non compare nel haystack.
    expect(client.isOpenAiCircuitOpen()).toBe(false);
    // pRetry ha ritentato più di una volta (è retryable).
    expect(embedMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("skips OpenAI entirely on chunk N+1 after breaker opened on chunk N (real error shape)", async () => {
    // Simula un reindex multi-chunk dove il primo chunk riceve un errore quota
    // nella forma REALE del SDK. I chunk successivi non devono nemmeno chiamare OpenAI.
    const realErr = apiCallErrorQuotaExhausted("insufficient_quota");
    embedMock.mockRejectedValueOnce(realErr);
    const client = await import("../embeddings/client");

    expect(client.isOpenAiCircuitOpen()).toBe(false);

    // Chunk 1: errore quota → breaker si apre, fallback locale usato.
    const v1 = await client.generateEmbedding("chunk 1 — quota esaurita");
    expect(v1).toHaveLength(1536);
    expect(client.isOpenAiCircuitOpen()).toBe(true);
    expect(embedMock).toHaveBeenCalledTimes(1);

    // Chunk 2: breaker aperto → OpenAI non viene nemmeno tentata.
    const v2 = await client.generateEmbedding("chunk 2 — deve saltare OpenAI");
    expect(v2).toHaveLength(1536);
    expect(embedMock).toHaveBeenCalledTimes(1); // ancora 1, non 2

    // Chunk 3: stesso.
    const v3 = await client.generateEmbedding("chunk 3 — deve saltare OpenAI");
    expect(v3).toHaveLength(1536);
    expect(embedMock).toHaveBeenCalledTimes(1); // ancora 1, non 3
  });

  it("embedMany also opens the breaker on quota-exhausted error (batch path)", async () => {
    const realErr = apiCallErrorQuotaExhausted("insufficient_quota");
    embedManyMock.mockRejectedValue(realErr);
    const client = await import("../embeddings/client");

    const vecs = await client.generateEmbeddings(["a", "b", "c"]);
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).toHaveLength(1536);
    // Il breaker deve essere aperto anche per il path batch.
    expect(client.isOpenAiCircuitOpen()).toBe(true);
    expect(embedManyMock).toHaveBeenCalledTimes(1);
  });
});

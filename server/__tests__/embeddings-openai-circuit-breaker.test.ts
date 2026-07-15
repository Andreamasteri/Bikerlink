// Task #108 — Il reindex Nadir con quota OpenAI esaurita ritentava OpenAI 3x
// PER OGNI chunk (40+ retry "OpenAI fallita, fallback locale" consecutivi in
// prod), trasformando un reindex da ~1 minuto in molti minuti. Questo test
// blocca la regressione: un errore di quota esaurita deve aprire il circuit
// breaker una sola volta e le chiamate successive devono saltare dritte al
// fallback locale, senza nuovi tentativi contro OpenAI.
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
vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(async () => async (_text: unknown) => ({
    data: new Float32Array(384).fill(0.01),
    dims: [1, 384],
  })),
}));

function quotaExhaustedError() {
  const err = new Error(
    "429 You exceeded your current quota, please check your plan and billing details.",
  ) as Error & { statusCode?: number };
  err.statusCode = 429;
  return err;
}

describe("embeddings client — OpenAI quota circuit breaker (Task #108)", () => {
  const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
    embedMock.mockReset();
    embedManyMock.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

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
});

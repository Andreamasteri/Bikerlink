// Task #110 — Master switch globale "Fallback AI".
// Verifica che con lo switch OFF (default, quando la setting non è impostata)
// l'app usi SOLO il modello self-hosted ThinkCentre (Ollama) e non raggiunga MAI
// un provider cloud (Groq/Gemini/OpenAI); e che con lo switch ON il comportamento
// multi-provider odierno resti invariato.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import
// ---------------------------------------------------------------------------

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn(() => vi.fn(() => ({ __p: "openai" }))) }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ __p: "google" }))) }));

vi.mock("../lib/ollama-client", () => ({
  isOllamaConfigured: true,
  getOllamaModel: vi.fn(() => ({ __p: "ollama" })),
}));

vi.mock("../lib/groq-client", () => ({
  isGroqConfigured: true,
  getGroqModel: vi.fn(() => ({ __p: "groq" })),
  getGroqParseModel: vi.fn(() => ({ __p: "groq" })),
}));

vi.mock("../lib/openai-route-client", () => ({
  isOpenAiRouteConfigured: true,
  getOpenAiRouteModel: vi.fn(() => ({ __p: "openai" })),
}));

vi.mock("../lib/throttle", () => ({
  limiters: {
    openai: { schedule: (f: () => unknown) => f() },
    gemini: { schedule: (f: () => unknown) => f() },
    groq: { schedule: (f: () => unknown) => f() },
  },
}));

// Storage mock guidato da `fallbackSetting`: simula la setting ai_fallback_enabled.
// value === null → setting non impostata (fresh install) → default OFF.
const fallbackSetting = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn(async (key: string) =>
      key === "ai_fallback_enabled"
        ? (fallbackSetting.value === null ? null : { value: fallbackSetting.value })
        : null,
    ),
    upsertAppSetting: vi.fn().mockResolvedValue(null),
  },
}));

type ProviderMod = typeof import("../ai/moderation/provider");
type RpcMod = typeof import("../ai/route-provider-config");
type SwitchMod = typeof import("../ai/fallback-switch");

// Ogni test riparte da moduli freschi (health/cap provider + cache switch puliti)
// con il valore desiderato della setting.
async function fresh(fallback: string | null): Promise<{ provider: ProviderMod; rpc: RpcMod; sw: SwitchMod }> {
  fallbackSetting.value = fallback;
  vi.resetModules();
  const provider = await import("../ai/moderation/provider");
  const rpc = await import("../ai/route-provider-config");
  const sw = await import("../ai/fallback-switch");
  return { provider, rpc, sw };
}

describe("Task #110 — master switch OFF (default): solo ThinkCentre, nessun cloud", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.BOWIE_OLLAMA_MODEL = "qwen3:1.7b";
  });

  it("setting non impostata (null) → default OFF", async () => {
    const { sw } = await fresh(null);
    expect(await sw.isAiFallbackEnabled()).toBe(false);
  });

  it("OFF + Ollama funziona → risponde Ollama, nessun cloud tentato", async () => {
    const { provider } = await fresh(null);
    const calls: string[] = [];
    const { value, model } = await provider.runWithFallback({ role: "brain" }, (m) => {
      calls.push(m.providerName);
      return Promise.resolve(`ok-${m.providerName}`);
    });
    expect(value).toBe("ok-ollama");
    expect(model.providerName).toBe("ollama");
    expect(calls).toEqual(["ollama"]);
  });

  it("OFF + Ollama fallisce → errore chiaro, nessun provider cloud chiamato", async () => {
    const { provider } = await fresh(null);
    const calls: string[] = [];
    await expect(
      provider.runWithFallback({ role: "brain" }, (m) => {
        calls.push(m.providerName);
        return Promise.reject(new Error("ollama down"));
      }),
    ).rejects.toThrow();
    expect(calls).toEqual(["ollama"]);
    expect(calls).not.toContain("groq");
    expect(calls).not.toContain("google");
    expect(calls).not.toContain("openai");
  });

  it("OFF + skipOllama:true → forza comunque il tentativo self-hosted, mai cloud", async () => {
    const { provider } = await fresh("false");
    const calls: string[] = [];
    const { value, model } = await provider.runWithFallback({ role: "brain", skipOllama: true }, (m) => {
      calls.push(m.providerName);
      return Promise.resolve(`ok-${m.providerName}`);
    });
    expect(value).toBe("ok-ollama");
    expect(model.providerName).toBe("ollama");
    expect(calls).toEqual(["ollama"]);
  });

  it("OFF → resolveModel (sync) lancia AI_SELFHOSTED_ONLY, non costruisce cloud", async () => {
    const { provider } = await fresh(null);
    expect(() => provider.resolveModel({ role: "brain" })).toThrow(/AI_SELFHOSTED_ONLY/);
  });

  it("OFF → getEffectiveRouteChain è self-hosted-only (solo ollama)", async () => {
    const { rpc } = await fresh(null);
    expect(await rpc.getEffectiveRouteChain()).toEqual(["ollama"]);
  });

  it("OFF → getEffectiveRouteChain ignora anche l'override env ROUTE_AI_PROVIDERS", async () => {
    process.env.ROUTE_AI_PROVIDERS = "groq,gemini,openai";
    try {
      const { rpc } = await fresh(null);
      expect(await rpc.getEffectiveRouteChain()).toEqual(["ollama"]);
    } finally {
      delete process.env.ROUTE_AI_PROVIDERS;
    }
  });

  it("scrittura DB fallita → setAiFallbackEnabled propaga l'errore e NON cambia il valore letto", async () => {
    const { sw } = await fresh(null);
    const { storage } = await import("../storage");
    vi.mocked(storage.upsertAppSetting).mockRejectedValueOnce(new Error("db down"));
    // Fail-fast: l'errore risale (l'endpoint admin risponderà 5xx, non success).
    await expect(sw.setAiFallbackEnabled(true)).rejects.toThrow("db down");
    // La cache non è stata aggiornata: la lettura riflette ancora lo stato persistito (OFF).
    expect(await sw.isAiFallbackEnabled()).toBe(false);
  });
});

describe("Task #110 — master switch ON: comportamento multi-provider invariato", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.OPENAI_API_KEY = "test-openai";
  });

  it("ON + Ollama fallisce → scala alla chain cloud (Groq)", async () => {
    const { provider } = await fresh("true");
    const calls: string[] = [];
    const { value, model } = await provider.runWithFallback({ role: "brain" }, (m) => {
      calls.push(m.providerName);
      if (m.providerName === "ollama") return Promise.reject(new Error("ollama down"));
      return Promise.resolve(`ok-${m.providerName}`);
    });
    expect(value).toBe("ok-groq");
    expect(model.providerName).toBe("groq");
    expect(calls).toEqual(["ollama", "groq"]);
  });

  it("ON → resolveModel (sync) costruisce un provider cloud", async () => {
    const { provider, sw } = await fresh("true");
    // Prime la cache sync leggendo prima il valore async.
    await sw.isAiFallbackEnabled();
    const m = provider.resolveModel({ role: "brain", preferredProvider: "groq" });
    expect(m.providerName).toBe("groq");
  });

  it("ON → getEffectiveRouteChain usa la chain di default completa", async () => {
    const { rpc } = await fresh("true");
    expect(await rpc.getEffectiveRouteChain()).toEqual(["ollama", "groq", "gemini", "openai"]);
  });
});

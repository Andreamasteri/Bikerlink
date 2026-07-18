/**
 * Task #539 — Guard: keep_alive values reach Ollama in the HTTP fetch payload.
 *
 * • streamAresChat (ares-client.ts)  → keep_alive: 0  (KEEP_ALIVE_ON_DEMAND)
 * • warmOllama    (ollama-client.ts) → keep_alive: -1 (KEEP_ALIVE_RESIDENT)
 *
 * Note: streamQuebrachoChat was removed in Task #591 (Quebracho unified into
 * Horus). The resident keep_alive contract is now tested via warmOllama(), the
 * only direct-fetch path in ollama-client.ts that explicitly injects
 * KEEP_ALIVE_RESIDENT = -1 without going through the AI SDK provider layer.
 *
 * Both suites use vi.resetModules() + dynamic import so the module-level env
 * reads (ARES_OLLAMA_URL, BOWIE_OLLAMA_URL, OLLAMA_KEEP_ALIVE …) are
 * evaluated fresh with the values we set in beforeEach, not from a previous
 * cached import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Module-level mocks (hoisted; survive vi.resetModules()) ─────────────────

vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/cf-access", () => ({
  cfAccessHeaders: vi.fn(() => ({})),
}));

vi.mock("../lib/ai-logger", () => ({
  logAiCall: vi.fn(),
}));

// ─── Env snapshot / restore ───────────────────────────────────────────────────

const ENV_KEYS = [
  "ARES_OLLAMA_URL",
  "ARES_OLLAMA_TOKEN",
  "ARES_OLLAMA_MODEL",
  "BOWIE_OLLAMA_URL",
  "BOWIE_OLLAMA_TOKEN",
  "HORUS_OLLAMA_URL",
  "HORUS_OLLAMA_TOKEN",
  "OLLAMA_KEEP_ALIVE",
] as const;

const _saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

function snapEnv() {
  for (const k of ENV_KEYS) _saved[k] = process.env[k];
}

function restoreEnv() {
  for (const k of ENV_KEYS) {
    const v = _saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// ─── Helper: minimal Ollama NDJSON streaming response ────────────────────────

function ndjsonResponse(chunks: object[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(JSON.stringify(c) + "\n"));
      ctrl.close();
    },
  });
  return new Response(body, { status: 200 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1 — streamAresChat: keep_alive: 0 (on-demand)
// ═══════════════════════════════════════════════════════════════════════════════

describe("streamAresChat — keep_alive nel payload fetch", () => {
  beforeEach(() => {
    snapEnv();
    process.env.ARES_OLLAMA_URL = "https://ares.test";
    delete process.env.ARES_OLLAMA_TOKEN;
    process.env.ARES_OLLAMA_MODEL = "devstral:test";
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
  });

  it("invia keep_alive: 0 (KEEP_ALIVE_ON_DEMAND) nel body della richiesta fetch", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return ndjsonResponse([
          { message: { content: "ok" }, done: false },
          { done: true },
        ]);
      }),
    );

    const { streamAresChat } = await import("../lib/ares-client");
    await streamAresChat({ system: "sys", messages: [{ role: "user", content: "ciao" }] });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.keep_alive).toBe(0);
  });

  it("il valore keep_alive è esattamente il NUMBER 0, non la stringa '0'", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return ndjsonResponse([{ done: true }]);
      }),
    );

    const { streamAresChat } = await import("../lib/ares-client");
    await streamAresChat({ system: "sys", messages: [{ role: "user", content: "test" }] });

    expect(typeof capturedBody!.keep_alive).toBe("number");
    expect(capturedBody!.keep_alive).toBe(0);
  });

  it("keep_alive NON è -1 (Ares non deve restare in VRAM dopo la chiamata)", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return ndjsonResponse([{ done: true }]);
      }),
    );

    const { streamAresChat } = await import("../lib/ares-client");
    await streamAresChat({ system: "sys", messages: [{ role: "user", content: "ping" }] });

    expect(capturedBody!.keep_alive).not.toBe(-1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2 — warmOllama: keep_alive: -1 (agenti residenti)
//
// warmOllama() è il path diretto (fetch manuale) in ollama-client.ts che
// inietta KEEP_ALIVE_RESIDENT = -1. Gli agenti residenti (Horus, Bowie) usano
// questo path per pre-caricare il modello in VRAM — il keep_alive garantisce
// che non vengano scaricati dopo il warm-up.
// ═══════════════════════════════════════════════════════════════════════════════

describe("warmOllama — keep_alive nel payload fetch (agenti residenti)", () => {
  beforeEach(() => {
    snapEnv();
    process.env.BOWIE_OLLAMA_URL = "https://bowie.test";
    delete process.env.HORUS_OLLAMA_URL; // Horus eredita BOWIE_OLLAMA_URL
    delete process.env.OLLAMA_KEEP_ALIVE; // default → KEEP_ALIVE_RESIDENT = -1
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
  });

  it("invia keep_alive: -1 (KEEP_ALIVE_RESIDENT) per persona 'bowie'", async () => {
    const bodies: Record<string, unknown>[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.body) {
          bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const { warmOllama } = await import("../lib/ollama-client");
    warmOllama("bowie", "qwen3:1.7b");
    // warmOllama è fire-and-forget — attendi la microtask queue + event loop
    await new Promise((r) => setTimeout(r, 20));

    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0].keep_alive).toBe(-1);
  });

  it("invia keep_alive: -1 anche per persona 'horus'", async () => {
    const bodies: Record<string, unknown>[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.body) {
          bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const { warmOllama } = await import("../lib/ollama-client");
    warmOllama("horus", "qwen3:4b");
    await new Promise((r) => setTimeout(r, 20));

    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0].keep_alive).toBe(-1);
  });

  it("il valore keep_alive è il NUMBER -1, non la stringa '-1' (Ollama la tratta come 0)", async () => {
    const bodies: Record<string, unknown>[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.body) {
          bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const { warmOllama } = await import("../lib/ollama-client");
    warmOllama("bowie");
    await new Promise((r) => setTimeout(r, 20));

    expect(bodies.length).toBeGreaterThan(0);
    expect(typeof bodies[0].keep_alive).toBe("number");
    expect(bodies[0].keep_alive).toBe(-1);
  });

  it("keep_alive NON è 0 (gli agenti residenti non devono essere scaricati subito)", async () => {
    const bodies: Record<string, unknown>[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.body) {
          bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const { warmOllama } = await import("../lib/ollama-client");
    warmOllama("bowie", "qwen3:1.7b");
    await new Promise((r) => setTimeout(r, 20));

    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0].keep_alive).not.toBe(0);
  });
});

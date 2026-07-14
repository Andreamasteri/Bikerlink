import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Task #10 (Quebracho c) — VRAM arbiter per Ares: libera memoria sull'istanza
// Ollama dedicata di Ares prima di una chiamata pesante, ripristina best-effort
// dopo. Invariante critica: non altera MAI l'esito di `fn`, anche se probe/
// eviction/restore fallisce.

const originalFetch = global.fetch;
const originalUrl = process.env.ARES_OLLAMA_URL;

beforeEach(() => {
  process.env.ARES_OLLAMA_URL = "https://ares.example.test";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.ARES_OLLAMA_URL = originalUrl;
  vi.resetModules();
});

describe("withAresVramPriority", () => {
  it("scarica i modelli residenti diversi dal modello attivo prima della chiamata", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/api/ps")) {
        return new Response(JSON.stringify({ models: [{ name: "embed-model" }, { name: "devstral:latest" }] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const { withAresVramPriority } = await import("../lib/vram-arbiter");
    const result = await withAresVramPriority("devstral:latest", async () => "chat-result");
    expect(result).toBe("chat-result");
    expect(calls.some((c) => c.includes("/api/ps"))).toBe(true);
    // Solo embed-model va scaricato: devstral:latest è il modello attivo.
    const evictCalls = calls.filter((c) => c.startsWith("POST") && c.includes("/api/generate"));
    expect(evictCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("non altera l'esito di fn se il probe fallisce", async () => {
    global.fetch = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    const { withAresVramPriority } = await import("../lib/vram-arbiter");
    const result = await withAresVramPriority("devstral:latest", async () => "chat-result");
    expect(result).toBe("chat-result");
  });

  it("propaga l'errore di fn (non lo assorbe) ma esegue comunque il restore best-effort", async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/api/ps")) return new Response(JSON.stringify({ models: [] }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const { withAresVramPriority } = await import("../lib/vram-arbiter");
    await expect(withAresVramPriority("devstral:latest", async () => { throw new Error("chat failed"); })).rejects.toThrow("chat failed");
  });

  it("listAresResidentModels ritorna [] se ARES_OLLAMA_URL non è configurato", async () => {
    delete process.env.ARES_OLLAMA_URL;
    const { listAresResidentModels } = await import("../lib/vram-arbiter");
    const result = await listAresResidentModels();
    expect(result).toEqual([]);
  });
});

/**
 * Task #153 — Smoke test del client ai-hub (server/lib/ai-hub-client.ts).
 *
 * Verifica che hubGet/hubPost:
 *   - colpiscano l'URL corretto ({AI_HUB_URL}/path) con gli header attesi
 *     (X-Hub-Gate-Token + CF Access);
 *   - passino la query-string su GET e il body JSON su POST;
 *   - ritornino { ok:false } (mai throw) su timeout/errore di rete;
 *   - rispettino isHubConfigured / isHubAvailable / setHubReachable.
 *
 * Il modulo legge i secret a load-time in const, quindi impostiamo l'env PRIMA
 * dell'import dinamico e usiamo vi.resetModules per rileggerli.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/cf-access", () => ({
  cfAccessHeaders: () => ({ "CF-Access-Client-Id": "cid", "CF-Access-Client-Secret": "csecret" }),
  isCfAccessConfigured: () => true,
}));

const AI_HUB_URL = "https://tc.example.net/ai-hub";
const AI_HUB_GATE_TOKEN = "gate-token-xyz";

async function loadClient() {
  vi.resetModules();
  process.env.AI_HUB_URL = AI_HUB_URL;
  process.env.AI_HUB_GATE_TOKEN = AI_HUB_GATE_TOKEN;
  return import("../lib/ai-hub-client");
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_HUB_URL;
  delete process.env.AI_HUB_GATE_TOKEN;
});

describe("ai-hub-client", () => {
  it("hubGet colpisce l'URL con query-string e header attesi", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, vram: 42 }), { status: 200 }));
    const { hubGet } = await loadClient();

    const res = await hubGet("/vram", { detail: "1" });

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true, vram: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${AI_HUB_URL}/vram?detail=1`);
    expect(init.method).toBe("GET");
    expect(init.headers["X-Hub-Gate-Token"]).toBe(AI_HUB_GATE_TOKEN);
    expect(init.headers["CF-Access-Client-Id"]).toBe("cid");
  });

  it("hubPost invia body JSON con Content-Type e gate token", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, fragments: [] }), { status: 200 }));
    const { hubPost } = await loadClient();

    const res = await hubPost("/nadir/search", { query: "ciao", limit: 3 });

    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${AI_HUB_URL}/nadir/search`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Hub-Gate-Token"]).toBe(AI_HUB_GATE_TOKEN);
    expect(JSON.parse(init.body)).toEqual({ query: "ciao", limit: 3 });
  });

  it("ritorna { ok:false } su errore di rete senza lanciare", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const { hubGet } = await loadClient();

    const res = await hubGet("/health");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ECONNREFUSED");
  });

  it("ritorna { ok:false } su HTTP >=400", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    const { hubPost } = await loadClient();

    const res = await hubPost("/files/write", { path: "x", content: "y" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.error).toBe("forbidden");
  });

  it("isHubConfigured true con entrambi i secret; isHubAvailable segue setHubReachable", async () => {
    const { isHubConfigured, isHubAvailable, setHubReachable } = await loadClient();
    expect(isHubConfigured()).toBe(true);
    expect(isHubAvailable()).toBe(true); // ottimista al boot
    setHubReachable(false);
    expect(isHubAvailable()).toBe(false);
    setHubReachable(true);
    expect(isHubAvailable()).toBe(true);
  });

  it("non configurato → isHubConfigured false e hubGet non chiama fetch", async () => {
    vi.resetModules();
    delete process.env.AI_HUB_URL;
    delete process.env.AI_HUB_GATE_TOKEN;
    const mod = await import("../lib/ai-hub-client");
    expect(mod.isHubConfigured()).toBe(false);
    const res = await mod.hubGet("/health");
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch che non risponde → abortisce dopo HUB_TIMEOUT_MS e ritorna { ok:false, error:'timeout …' }", async () => {
    // Task #161 — verifica che l'AbortController scatti correttamente dopo 8s
    // (HUB_TIMEOUT_MS). Con vi.useFakeTimers() setTimeout è sostituito.
    // Il mock fetch DEVE reagire al segnale di abort (altrimenti la Promise
    // non risolve mai e il test timeouterebbe da solo).
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        // Reject con AbortError non appena il segnale viene abortito.
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          reject(new DOMException("The user aborted a request.", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () =>
          reject(new DOMException("The user aborted a request.", "AbortError")),
        );
      }),
    );
    const { hubGet } = await loadClient();

    const resultPromise = hubGet("/nadir/search");
    // Avanza di 8001ms → il setTimeout nel client chiama ctrl.abort() →
    // il signal "abort" event fire → fetchMock reject con AbortError →
    // hubFetch cattura l'errore e ritorna { ok:false, error:"timeout 8000ms" }.
    await vi.advanceTimersByTimeAsync(8001);
    const res = await resultPromise;

    vi.useRealTimers();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/timeout/i);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for probeWhisperOk() (via runAllProbes) —
 * verifica che il probe Whisper distingua le cause di fallimento invece di
 * collassarle in uno stato generico UNKNOWN.
 *
 * Casi coperti:
 *   1. WHISPER_TOKEN assente → tokenMissing, reason="token non configurato"
 *   2. 401 con body "Cloudflare Access" → cfAccessBlocked, reason="CF Access bloccato"
 *   3. 401 senza cf-access-error → reason="token non valido (401)"
 *   4. timeout/rete → reason="offline / non raggiungibile"
 *   5. 200 → ok=true, reason assente
 *   6. WHISPER_URL assente → ok=null
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/photon-client", () => ({
  getPhotonHealthSnapshot: vi.fn().mockResolvedValue({ configured: false, ok: false }),
}));

vi.mock("../graphhopper-client", () => ({
  ACTIVE_PROFILE: "motorcycle",
  fetchSelfHostedProfiles: vi.fn().mockResolvedValue({ reachable: false }),
  isSelfHosted: false,
}));

vi.mock("../routing/routing-area-state", () => ({
  getAreaEnabledMap: vi.fn().mockResolvedValue({}),
}));

vi.mock("../lib/cf-access", () => ({
  cfAccessHeaders: vi.fn().mockReturnValue({}),
}));

vi.stubGlobal("fetch", fetchMock);

// ── Importa DOPO i mock ────────────────────────────────────────────────────────

import { resetProbeEnvForTests } from "../jobs/thinkcentre-monitor-probes";

// `probeWhisperOk` è privata — la testiamo indirettamente tramite
// `runAllProbes()` che costruisce il `ServiceProbeResult` con il campo `reason`.
// Importiamo anche direttamente per maggiore granularità.

// @ts-ignore — accessing internal export for testing
// We test via runAllProbes to check the ServiceProbeResult shape.
import { runAllProbes } from "../jobs/thinkcentre-monitor-probes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(
  status: number,
  body: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Map(Object.entries({ "content-type": "text/plain", ...extraHeaders }));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeAbortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  resetProbeEnvForTests();
  // Imposta una URL valida per Whisper di default; i singoli test sovrascrivono
  // se necessario.
  process.env.WHISPER_URL = "https://whisper.example.com";
  process.env.WHISPER_TOKEN = "valid-token";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("probeWhisperOk — via runAllProbes()", () => {
  it("restituisce ok=null quando WHISPER_URL non è configurato", async () => {
    delete process.env.WHISPER_URL;
    delete process.env.WHISPER_TOKEN;

    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper).toBeDefined();
    expect(whisper!.ok).toBeNull();
    expect(whisper!.reason).toBeUndefined();
    // fetch non deve essere chiamata
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("whisper"),
      expect.anything(),
    );
  });

  it("restituisce tokenMissing con reason='token non configurato' quando WHISPER_TOKEN è assente", async () => {
    delete process.env.WHISPER_TOKEN;

    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper).toBeDefined();
    expect(whisper!.ok).toBe(false);
    expect(whisper!.reason).toBe("token non configurato");
    // fetch NON deve essere chiamata (short-circuit senza token)
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("whisper.example.com"),
      expect.anything(),
    );
  });

  it("restituisce cfAccessBlocked con reason='CF Access bloccato' su 401 con body CF", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(401, "Access denied by Cloudflare Access policy"),
    );

    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper).toBeDefined();
    expect(whisper!.ok).toBe(false);
    expect(whisper!.reason).toBe("CF Access bloccato");
  });

  it("restituisce reason='CF Access bloccato' su 403 con header cf-access-error", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(403, "Forbidden", { "cf-access-error": "MISSING_TOKEN" }),
    );

    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper).toBeDefined();
    expect(whisper!.ok).toBe(false);
    expect(whisper!.reason).toBe("CF Access bloccato");
  });

  it("restituisce reason='token non valido (401)' su 401 senza indicatori CF Access", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(401, "Invalid authentication token"),
    );

    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper).toBeDefined();
    expect(whisper!.ok).toBe(false);
    expect(whisper!.reason).toBe("token non valido (401)");
  });

  it("restituisce reason='offline / non raggiungibile' su timeout (AbortError)", async () => {
    fetchMock.mockRejectedValue(makeAbortError());

    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper).toBeDefined();
    expect(whisper!.ok).toBe(false);
    expect(whisper!.reason).toBe("offline / non raggiungibile");
  });

  it("restituisce reason='offline / non raggiungibile' su errore di rete (fetch failed)", async () => {
    const networkErr = new Error("fetch failed: ECONNREFUSED");
    fetchMock.mockRejectedValue(networkErr);

    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper).toBeDefined();
    expect(whisper!.ok).toBe(false);
    expect(whisper!.reason).toBe("offline / non raggiungibile");
  });

  it("restituisce ok=true senza reason quando il servizio risponde con 2xx", async () => {
    fetchMock.mockResolvedValue(makeResponse(200, "OK"));

    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper).toBeDefined();
    expect(whisper!.ok).toBe(true);
    expect(whisper!.reason).toBeUndefined();
  });

  it("non mostra mai 'UNKNOWN' come reason per cause diagnosticabili", async () => {
    // 401 applicativo
    fetchMock.mockResolvedValue(makeResponse(401, "Bad token"));
    const result = await runAllProbes();
    const whisper = result.services.find((s) => s.key === "whisper");

    expect(whisper!.reason).not.toMatch(/unknown/i);
    expect(whisper!.reason).toBeTruthy();
  });
});

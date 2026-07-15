/**
 * Task #153 — Test del collector ai-hub (server/ai/watchdog/collectors/ai-hub-collector.ts).
 *
 * Verifica che la probe:
 *   - usi hubGet (che inietta X-Hub-Gate-Token + CF Access) invece di fetch diretto,
 *     così un 401 viene correttamente trattato come "irraggiungibile" (review feedback);
 *   - chiami setHubReachable(true) su risposta 200+{ok:true};
 *   - chiami setHubReachable(false) su risposta 4xx o errore di rete;
 *   - skippi silenziosamente se l'hub non è configurato.
 *
 * Il modulo ha contatori a livello di module scope (consecutiveFailures, hadSuccessfulProbe)
 * che persistono tra test nello stesso file. Ogni test è scritto in modo da non dipendere
 * dallo stato lasciato dai test precedenti: i mock vengono reimpostati in beforeEach e
 * i test sull'escalation sono auto-contenuti (sequenziali nello stesso it).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted garantisce che le variabili siano inizializzate prima che vi.mock
// sollevi le factory (necessario perché vi.mock viene hoistato all'inizio del file).
const { mockHubGet, mockSetHubReachable, mockIsHubConfigured } = vi.hoisted(() => ({
  mockHubGet: vi.fn(),
  mockSetHubReachable: vi.fn(),
  mockIsHubConfigured: vi.fn(),
}));

vi.mock("../lib/ai-hub-client", () => ({
  hubGet: mockHubGet,
  isHubConfigured: mockIsHubConfigured,
  setHubReachable: mockSetHubReachable,
  isHubAvailable: () => true,
}));
vi.mock("../lib/thinkcentre-powered-off", () => ({
  isThinkCentrePoweredOff: () => Promise.resolve(false),
}));
vi.mock("../lib/thinkcentre-maintenance", () => ({
  isThinkCentreInMaintenance: () => Promise.resolve(false),
}));

import { collectAiHub } from "../ai/watchdog/collectors/ai-hub-collector";

// Risposte standard.
const okResponse = () =>
  Promise.resolve({ ok: true, status: 200, data: { ok: true, service: "ai-hub", sharedRoot: "/x" } });
const authError = () =>
  Promise.resolve({ ok: false, status: 401, error: "HTTP 401" });
const netError = () =>
  Promise.resolve({ ok: false, error: "ECONNREFUSED" });

beforeEach(() => {
  vi.clearAllMocks();
  // Reimposta l'implementazione dopo clearAllMocks (che cancella mockReturnValue).
  mockIsHubConfigured.mockReturnValue(true);
});

describe("ai-hub collector — autenticazione e comportamento probe", () => {
  it("salute OK → hubGet viene chiamato su /health, setHubReachable(true), segnale ping_ms", async () => {
    mockHubGet.mockImplementation(okResponse);

    const signals = await collectAiHub();

    // Verifica che usiamo hubGet (non fetch diretto): questo garantisce che
    // X-Hub-Gate-Token + CF Access vengano iniettati automaticamente.
    expect(mockHubGet).toHaveBeenCalledWith("/health");
    expect(mockSetHubReachable).toHaveBeenCalledWith(true);
    expect(signals.some((s) => s.metric === "ai_hub.ping_ms")).toBe(true);
    expect(signals.some((s) => s.metric === "ai_hub.unreachable")).toBe(false);
  });

  it("401 gate token errato/assente → setHubReachable(false) + segnale unreachable (severity warn)", async () => {
    // Questo è il bug che si regressava usando fetch diretto senza X-Hub-Gate-Token:
    // il 401 viene trattato come fallimento (hub non disponibile), non come probe ok.
    // Con hubGet il 401 arriva solo se il token è sbagliato/mancante nel secret.
    mockHubGet.mockImplementation(authError);

    const signals = await collectAiHub();

    expect(mockHubGet).toHaveBeenCalledWith("/health");
    expect(mockSetHubReachable).toHaveBeenCalledWith(false);
    const sig = signals.find((s) => s.metric === "ai_hub.unreachable");
    expect(sig).toBeDefined();
    expect(sig?.severity).toBe("warn");
  });

  it("errore di rete → setHubReachable(false) + segnale unreachable", async () => {
    mockHubGet.mockImplementation(netError);

    const signals = await collectAiHub();

    expect(mockSetHubReachable).toHaveBeenCalledWith(false);
    const sig = signals.find((s) => s.metric === "ai_hub.unreachable");
    expect(sig).toBeDefined();
    expect(sig?.details?.error).toContain("ECONNREFUSED");
  });

  it("probe OK seguita da fallimento → recovery corretto (setHubReachable alterna true/false)", async () => {
    // Sequenza: OK → FAIL, verifica che il recovery ripristini lo stato.
    mockHubGet.mockImplementationOnce(okResponse).mockImplementationOnce(netError);

    const s1 = await collectAiHub();
    expect(mockSetHubReachable).toHaveBeenLastCalledWith(true);
    expect(s1.some((s) => s.metric === "ai_hub.ping_ms")).toBe(true);

    const s2 = await collectAiHub();
    expect(mockSetHubReachable).toHaveBeenLastCalledWith(false);
    expect(s2.some((s) => s.metric === "ai_hub.unreachable")).toBe(true);
  });

  it("non configurato → hubGet NON viene chiamato, segnale ai_hub.absent", async () => {
    mockIsHubConfigured.mockReturnValue(false);

    const signals = await collectAiHub();

    expect(mockHubGet).not.toHaveBeenCalled();
    expect(mockSetHubReachable).not.toHaveBeenCalled();
    expect(signals.some((s) => s.metric === "ai_hub.absent")).toBe(true);
  });

  it("ping_ms severity info se latenza ≤ 3000ms, warn se > 3000ms (SLA Task #161)", async () => {
    // Verifica che la soglia <3s sia rispettata nel collector: latenza entro SLA →
    // severity "info"; latenza oltre SLA → severity "warn". La soglia è codificata
    // in ai-hub-collector.ts (latencyMs > 3000 ? "warn" : "info") e questa suite
    // la ancora al test così una modifica accidentale viene intercettata.
    vi.useFakeTimers();

    // ── Caso 1: risposta veloce (< 3000ms) → severity "info" ──
    mockHubGet.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, data: { ok: true } }),
    );
    // La probe usa Date.now() che sotto fake timers è fermo a t=0:
    // started = 0, after hubGet ≈ 0 → latencyMs ≈ 0 → "info".
    const fastSignals = await collectAiHub();
    vi.useRealTimers();

    const fastPing = fastSignals.find((s) => s.metric === "ai_hub.ping_ms");
    expect(fastPing).toBeDefined();
    expect(fastPing?.severity).toBe("info");

    // ── Caso 2: risposta lenta (> 3000ms) → severity "warn" ──
    vi.useFakeTimers();
    let resolveSlowHub!: () => void;
    mockHubGet.mockImplementation(
      () =>
        new Promise<{ ok: boolean; status: number; data: { ok: boolean } }>((resolve) => {
          resolveSlowHub = () => resolve({ ok: true, status: 200, data: { ok: true } });
        }),
    );
    const slowPromise = collectAiHub();
    // Avanza 3500ms PRIMA che hubGet risolva → latencyMs = 3500 → "warn".
    await vi.advanceTimersByTimeAsync(3500);
    resolveSlowHub();
    const slowSignals = await slowPromise;
    vi.useRealTimers();

    const slowPing = slowSignals.find((s) => s.metric === "ai_hub.ping_ms");
    expect(slowPing).toBeDefined();
    expect(slowPing?.severity).toBe("warn");
  });
});

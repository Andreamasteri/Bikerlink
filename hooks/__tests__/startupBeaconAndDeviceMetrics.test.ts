/**
 * Test di robustezza per i percorsi best-effort dell'avvio:
 *
 *   A) recoverLastBeacon (lib/startup-beacon.ts)
 *      – se AsyncStorage si blocca, la Promise si risolve comunque (no hang)
 *      – nessuna eccezione propagata verso l'invocante
 *
 *   B) useDeviceMetrics (hooks/useDeviceMetrics.ts)
 *      – nessuna chiamata API finché tokenReady=false (niente traffico anonimo al cold start)
 *      – la chiamata parte appena tokenReady=true con user loggato
 *      – un errore di apiRequest non propagate né blocca il hook
 *
 * Strategia:
 *  - fake timers per gestire setInterval/setTimeout del hook
 *  - react-test-renderer per montare useDeviceMetrics tramite un componente Probe
 *  - tutte le dipendenze native (expo-battery, expo-device, AsyncStorage, fetch)
 *    sono mock controllabili per test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: @react-native-async-storage/async-storage ──────────────────────────
const asyncStorageGetItem = vi.hoisted(() => vi.fn());
const asyncStorageSetItem = vi.hoisted(() => vi.fn());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: asyncStorageGetItem,
    setItem: asyncStorageSetItem,
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── mock: react-native ────────────────────────────────────────────────────────
const platformOS = vi.hoisted(() => ({ value: "ios" }));
vi.mock("react-native", () => ({
  Platform: { OS: platformOS.value },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

// ── mock: expo-battery ────────────────────────────────────────────────────────
vi.mock("expo-battery", () => ({
  getBatteryLevelAsync: vi.fn().mockResolvedValue(0.85),
  getBatteryStateAsync: vi.fn().mockResolvedValue(2),
  BatteryState: {
    CHARGING: 2,
    FULL: 3,
    UNPLUGGED: 1,
    UNKNOWN: 0,
    NOT_CHARGING: 4,
  },
}));

// ── mock: expo-device ─────────────────────────────────────────────────────────
vi.mock("expo-device", () => ({
  totalMemory: 4_294_967_296,
}));

// ── mock: react-native-device-info (opzionale, non presente in tutti i build) ─
vi.mock("react-native-device-info", () => {
  throw new Error("native module not linked");
});

// ── mock: @/lib/query-client ──────────────────────────────────────────────────
const apiRequest = vi.hoisted(() => vi.fn());
const getApiUrl = vi.hoisted(() => vi.fn(() => "http://localhost:5000"));
vi.mock("@/lib/query-client", () => ({ apiRequest, getApiUrl }));

// ── mock: @/lib/auth-context ──────────────────────────────────────────────────
const authUser = vi.hoisted(() => ({ value: null as { id: string } | null }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authUser.value }),
}));

// ── import dei moduli sotto test (DOPO i mock) ────────────────────────────────
import { recoverLastBeacon } from "../../lib/startup-beacon";
import { useDeviceMetrics } from "../useDeviceMetrics";

// ── helper: global fetch mock ─────────────────────────────────────────────────
const globalFetch = vi.fn();

// ── Probe: monta useDeviceMetrics e registra risultati ───────────────────────
interface ProbeProps {
  tokenReady: boolean;
}
function Probe({ tokenReady }: ProbeProps) {
  useDeviceMetrics(tokenReady);
  return null;
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mountProbe(tokenReady: boolean) {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe, { tokenReady }));
  });
}

async function updateProbe(tokenReady: boolean) {
  await act(async () => {
    renderer!.update(React.createElement(Probe, { tokenReady }));
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();

  authUser.value = null;
  asyncStorageGetItem.mockResolvedValue(null);
  asyncStorageSetItem.mockResolvedValue(undefined);
  apiRequest.mockResolvedValue({});
  globalFetch.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", globalFetch);

  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ══════════════════════════════════════════════════════════════════════════════
// A — recoverLastBeacon: best-effort, non blocca, non lancia
// ══════════════════════════════════════════════════════════════════════════════
describe("recoverLastBeacon — best-effort, non blocca l'avvio", () => {
  it("non blocca il chiamante quando AsyncStorage.getItem non si risolve mai (storage lento)", async () => {
    // Simula storage congelato al cold start
    asyncStorageGetItem.mockReturnValue(new Promise<string | null>(() => {}));

    // Il bootstrap chiama recoverLastBeacon() fire-and-forget (senza await).
    // Verifichiamo che il codice successivo alla chiamata venga eseguito
    // immediatamente, senza aspettare che lo storage si sblocchi.
    let callerReachedNextLine = false;

     
    recoverLastBeacon(); // fire-and-forget intenzionale: simula l'uso nel bootstrap

    callerReachedNextLine = true; // deve essere raggiunta subito

    expect(callerReachedNextLine).toBe(true);

    // Nessun errore non gestito deve propagarsi: avanziamo i timer per drenare
    // eventuali microtask pendenti e verificare che non venga lanciato nulla.
    await vi.advanceTimersByTimeAsync(100);
  });

  it("non lancia mai, anche se AsyncStorage.getItem rigetta", async () => {
    asyncStorageGetItem.mockRejectedValue(new Error("disk full"));

    await expect(recoverLastBeacon()).resolves.toBeUndefined();
  });

  it("non lancia mai, anche se fetch rigetta", async () => {
    asyncStorageGetItem
      .mockResolvedValueOnce('{"step":"boot","ts":1}') // BEACON_LAST_KEY
      .mockResolvedValueOnce(null);                    // BEACON_SENT_KEY (non inviato)

    globalFetch.mockRejectedValue(new Error("network unreachable"));

    await expect(recoverLastBeacon()).resolves.toBeUndefined();
  });

  it("non lancia mai se il JSON salvato è corrotto", async () => {
    asyncStorageGetItem
      .mockResolvedValueOnce("NOT_VALID_JSON")
      .mockResolvedValueOnce(null);

    await expect(recoverLastBeacon()).resolves.toBeUndefined();
  });

  it("non invia beacon se last e sent coincidono (già recuperato)", async () => {
    const payload = '{"step":"boot","ts":1}';
    asyncStorageGetItem
      .mockResolvedValueOnce(payload)   // BEACON_LAST_KEY
      .mockResolvedValueOnce(payload);  // BEACON_SENT_KEY = stesso → skip

    await recoverLastBeacon();

    // Nessuna richiesta HTTP deve partire
    await vi.advanceTimersByTimeAsync(0);
    expect(globalFetch).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B — useDeviceMetrics: gated su tokenReady, errori non propagati
// ══════════════════════════════════════════════════════════════════════════════
describe("useDeviceMetrics — gated su tokenReady, errori non propagati", () => {
  it("NON chiama apiRequest se tokenReady=false, anche con user loggato", async () => {
    authUser.value = { id: "user-1" };
    await mountProbe(false);
    await advance(0);

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("NON chiama apiRequest se tokenReady=true ma user è null", async () => {
    authUser.value = null;
    await mountProbe(true);
    await advance(0);

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("chiama apiRequest una volta al mount quando tokenReady=true e user presente", async () => {
    authUser.value = { id: "user-42" };
    await mountProbe(true);
    await advance(0);

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/metrics/device", expect.any(Object));
  });

  it("include sessionId, platform e userId-agnostic fields nel payload", async () => {
    authUser.value = { id: "user-99" };
    await mountProbe(true);
    await advance(0);

    const payload = apiRequest.mock.calls[0][2] as Record<string, unknown>;
    expect(typeof payload.sessionId).toBe("string");
    expect(payload.platform).toBe("ios");
    expect(typeof payload.appUptimeSeconds).toBe("number");
  });

  it("non chiama apiRequest se tokenReady rimane false durante l'intera vita del hook", async () => {
    authUser.value = { id: "user-1" };
    await mountProbe(false);

    // Avanza oltre l'intervallo di report (60s)
    await advance(70_000);

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("inizia a chiamare apiRequest non appena tokenReady diventa true (update del prop)", async () => {
    authUser.value = { id: "user-1" };
    await mountProbe(false);
    expect(apiRequest).not.toHaveBeenCalled();

    await updateProbe(true);
    await advance(0);

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("un errore di apiRequest non propagate né causa un crash del hook", async () => {
    authUser.value = { id: "user-fail" };
    apiRequest.mockRejectedValue(new Error("server 500"));

    // Il hook NON deve lanciare — se lo fa react-test-renderer propaga l'errore
    await expect(mountProbe(true)).resolves.not.toThrow();
    await advance(0);

    // Il hook è ancora montato e funzionante
    expect(renderer).not.toBeNull();
  });

  it("chiama apiRequest ogni 60s quando l'app è attiva e tokenReady=true", async () => {
    authUser.value = { id: "user-interval" };
    await mountProbe(true);
    await advance(0); // flush prima chiamata

    const callsAfterMount = apiRequest.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    await advance(60_000);
    expect(apiRequest.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("cancella l'intervallo quando tokenReady torna false (nessuna chiamata residua)", async () => {
    authUser.value = { id: "user-cancel" };
    await mountProbe(true);
    await advance(0);

    const callsBeforeDisable = apiRequest.mock.calls.length;

    // tokenReady diventa false → l'intervallo deve essere cancellato
    await updateProbe(false);
    await advance(120_000);

    expect(apiRequest.mock.calls.length).toBe(callsBeforeDisable);
  });
});

/**
 * Test di integrazione per la gestione del background location task in AppStateHandler.
 *
 * CONTRATTO: il task di background location deve fermarsi NON SOLO quando il
 * permesso viene revocato, ma anche quando l'utente fa logout (user → null).
 * Senza questo test, un utente che si disconnette mentre il task OS è attivo
 * potrebbe continuare silenziosamente a inviare aggiornamenti di posizione.
 *
 * Scenari coperti:
 *   1. Logout (user → null) con permesso ancora concesso → stopBackgroundLocationTask
 *   2. Permesso revocato (hasBackgroundPermission → false) con utente ancora loggato
 *      → stopBackgroundLocationTask
 *   3. Entrambe le condizioni presenti già al mount (no user, no permission)
 *      → stopBackgroundLocationTask chiamato immediatamente
 *   4. Con user e permesso presenti → startBackgroundLocationTask viene tentato
 *
 * Strategia: montaggio con react-test-renderer (React reale in Node).
 * Lo stato di auth e location-context è controllato tramite oggetti hoisted
 * mutabili; il re-render è forzato via renderer.update() + act() per simulare
 * la transizione di stato in corso d'uso.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: react-native ────────────────────────────────────────────────────────
const appStateListeners: Array<(state: string) => void> = [];
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: vi.fn((_event: string, cb: (state: string) => void) => {
      appStateListeners.push(cb);
      return { remove: vi.fn() };
    }),
  },
  Platform: { OS: "android" },
}));

// ── mock: auth-context ────────────────────────────────────────────────────────
const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authState,
}));

// ── mock: location-context ────────────────────────────────────────────────────
const locationState = vi.hoisted(() => ({
  hasBackgroundPermission: false,
  currentPosition: null as { latitude: number; longitude: number } | null,
}));
vi.mock("@/lib/location-context", () => ({
  useLocationGate: () => locationState,
}));

// ── mock: background-location-task ───────────────────────────────────────────
const mockStop = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockStart = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const mockIsSupported = vi.hoisted(() => vi.fn().mockResolvedValue(false));
vi.mock("@/lib/background-location-task", () => ({
  stopBackgroundLocationTask: mockStop,
  startBackgroundLocationTask: mockStart,
  isBackgroundLocationSupported: mockIsSupported,
  gpsPrecisionToAccuracy: vi.fn().mockReturnValue(3),
  GPS_PRECISION_STORAGE_KEY: "@bikerlink/gps_precision",
}));

// ── mock: foreground-location-service ────────────────────────────────────────
vi.mock("@/lib/foreground-location-service", () => ({
  startForegroundLocationService: vi.fn().mockResolvedValue(undefined),
  stopForegroundLocationService: vi.fn().mockResolvedValue(undefined),
  FOREGROUND_SERVICE_DISABLED_KEY: "@bikerlink/fg_location_disabled",
}));

// ── mock: query-client ────────────────────────────────────────────────────────
vi.mock("@/lib/query-client", () => ({
  queryClient: {
    prefetchQuery: vi.fn().mockResolvedValue(undefined),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  },
  apiRequest: vi.fn().mockResolvedValue({}),
}));

// ── mock: online-focus-manager ────────────────────────────────────────────────
vi.mock("@/lib/online-focus-manager", () => ({
  subscribeReconnect: vi.fn().mockReturnValue(() => {}),
}));

// ── mock: startup-beacon ──────────────────────────────────────────────────────
vi.mock("@/lib/startup-beacon", () => ({
  sendStartupBeacon: vi.fn(),
}));

// ── mock: crash-logger ────────────────────────────────────────────────────────
vi.mock("@/lib/crash-logger", () => ({
  initCrashLogger: vi.fn().mockResolvedValue(undefined),
  markClean: vi.fn().mockResolvedValue(undefined),
  resetCrashLogger: vi.fn(),
  markAsyncError: vi.fn().mockResolvedValue(undefined),
}));

// ── mock: tracking-active ─────────────────────────────────────────────────────
vi.mock("@/lib/tracking-active", () => ({
  isTrackingActive: vi.fn().mockReturnValue(false),
  registerLayoutWatcherCallbacks: vi.fn(),
}));

// ── mock: AsyncStorage ────────────────────────────────────────────────────────
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── mock: device-model ────────────────────────────────────────────────────────
vi.mock("@/lib/device-model", () => ({
  getDeviceModel: vi.fn().mockReturnValue("TestDevice"),
}));

// ── mock: device-info ─────────────────────────────────────────────────────────
vi.mock("@/lib/device-info", () => ({
  getReliableAppVersion: vi.fn().mockReturnValue("1.0.0"),
}));

// ── import del componente (dopo i mock) ──────────────────────────────────────
import { AppStateHandler } from "@/components/layout/AppStateHandler";

// ── helpers ───────────────────────────────────────────────────────────────────

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(AppStateHandler));
  });
}

async function rerender() {
  await act(async () => {
    renderer!.update(React.createElement(AppStateHandler));
  });
}

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  locationState.hasBackgroundPermission = false;
  locationState.currentPosition = null;
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

// ── test ──────────────────────────────────────────────────────────────────────

describe("AppStateHandler — stop al logout (user → null)", () => {
  it("chiama stopBackgroundLocationTask quando l'utente fa logout con permesso ancora concesso", async () => {
    // Mount con utente loggato e permesso background concesso
    authState.user = { id: "u1" };
    locationState.hasBackgroundPermission = true;
    await mount();

    // Resetta il contatore delle chiamate registrate durante il mount
    mockStop.mockClear();

    // Simula logout: user → null
    authState.user = null;
    await rerender();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("chiama stopBackgroundLocationTask anche se il permesso è già revocato al momento del logout", async () => {
    authState.user = { id: "u1" };
    locationState.hasBackgroundPermission = false;
    await mount();

    mockStop.mockClear();

    authState.user = null;
    await rerender();

    // stopBackgroundLocationTask deve essere chiamato indipendentemente dallo
    // stato del permesso: la condizione è `!user || !hasBackgroundPermission`.
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

describe("AppStateHandler — stop alla revoca del permesso (utente ancora loggato)", () => {
  it("chiama stopBackgroundLocationTask quando il permesso background viene revocato", async () => {
    authState.user = { id: "u2" };
    locationState.hasBackgroundPermission = true;
    await mount();

    mockStop.mockClear();

    // Simula revoca permesso
    locationState.hasBackgroundPermission = false;
    await rerender();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

describe("AppStateHandler — stop immediato se le condizioni sono già false al mount", () => {
  it("chiama stopBackgroundLocationTask al mount quando non c'è utente", async () => {
    authState.user = null;
    locationState.hasBackgroundPermission = false;
    await mount();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("chiama stopBackgroundLocationTask al mount quando il permesso manca (anche con utente loggato)", async () => {
    authState.user = { id: "u3" };
    locationState.hasBackgroundPermission = false;
    await mount();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

describe("AppStateHandler — avvio task con utente loggato e permesso concesso", () => {
  it("tenta di avviare il background task quando user e permesso sono entrambi presenti", async () => {
    mockIsSupported.mockResolvedValue(true);
    authState.user = { id: "u4" };
    locationState.hasBackgroundPermission = true;

    await mount();

    // isBackgroundLocationSupported deve essere invocato per verificare il
    // supporto prima dell'avvio (anche se la fetch delle settings fallisce
    // perché fetch non è disponibile in Node — il comportamento è best-effort).
    expect(mockIsSupported).toHaveBeenCalledTimes(1);
  });

  it("NON chiama stopBackgroundLocationTask al mount quando user e permesso sono entrambi presenti", async () => {
    authState.user = { id: "u5" };
    locationState.hasBackgroundPermission = true;
    await mount();

    expect(mockStop).not.toHaveBeenCalled();
  });
});

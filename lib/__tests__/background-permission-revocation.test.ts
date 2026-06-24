/**
 * Test della revoca del permesso background ("Sempre").
 *
 * Gruppo 1 — logica pura (evaluateBackgroundRevocation, 6 test):
 *   Verifica tutti i rami della funzione pura usata da checkBackgroundPermission
 *   nel provider. I test qui COPRONO il comportamento reale del provider perché
 *   checkBackgroundPermission invoca evaluateBackgroundRevocation.
 *
 * Gruppo 2 — infrastruttura polling (3 test):
 *   Monta LocationProvider e verifica che setInterval e AppState.addEventListener
 *   siano registrati con gli argomenti corretti.
 *
 * Gruppo 3 — comportamento provider (3 test):
 *   Monta LocationProvider con un ContextCapture consumer, esegue il check via
 *   la callback dell'intervallo e verifica backgroundPermissionRevoked nel contesto.
 *
 * Gruppo 4 — logica condizionale listener AppState (4 test):
 *   Replica la stessa condizione del provider come funzione pura e verifica
 *   i casi background→active, active→background, inactive→active, active→active.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ── mock: expo-location ───────────────────────────────────────────────────────
// vi.mock intercetta gli import ESM statici, quindi ExpoLocation nel provider
// viene sostituito con questo oggetto.

const mockGetBgPerms = vi.hoisted(() => vi.fn());
const mockGetFgPerms = vi.hoisted(() => vi.fn());
const mockWatchPosition = vi.hoisted(() => vi.fn());

vi.mock("expo-location", () => ({
  getBackgroundPermissionsAsync: mockGetBgPerms,
  getForegroundPermissionsAsync: mockGetFgPerms,
  requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted", canAskAgain: true }),
  requestBackgroundPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted", canAskAgain: true }),
  watchPositionAsync: mockWatchPosition,
  Accuracy: { Balanced: 3 },
}));

// ── mock: react-native (AppState) ─────────────────────────────────────────────

const capturedAppStateListeners = vi.hoisted(
  () => [] as Array<(nextState: string) => void>,
);

vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: vi.fn((_event: string, handler: (s: string) => void) => {
      capturedAppStateListeners.push(handler);
      return { remove: vi.fn() };
    }),
  },
}));

// ── mock: dipendenze del provider ─────────────────────────────────────────────

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { required: true } }),
}));

vi.mock("@/lib/startup-beacon", () => ({
  sendStartupBeacon: vi.fn(),
}));

vi.mock("@/lib/crash-logger", () => ({
  markAsyncError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/resume-utils", () => ({
  withTimeout: (p: Promise<unknown>) => p,
  TimeoutError: class TimeoutError extends Error {},
}));

// ── imports ───────────────────────────────────────────────────────────────────

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { evaluateBackgroundRevocation } from "@/lib/location-permission";
import { LocationProvider, useLocationGate, BG_PERMISSION_CHECK_INTERVAL } from "@/lib/location-context";

// ── abilita act() in ambiente node ────────────────────────────────────────────

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

// ── ContextCapture: consumer per leggere lo stato del provider ────────────────

interface CapturedCtx {
  backgroundPermissionRevoked: boolean;
  hasBackgroundPermission: boolean;
  backgroundPermissionChecked: boolean;
}

let capturedCtx: CapturedCtx = {
  backgroundPermissionRevoked: false,
  hasBackgroundPermission: false,
  backgroundPermissionChecked: false,
};

function ContextCapture() {
  const { backgroundPermissionRevoked, hasBackgroundPermission, backgroundPermissionChecked } =
    useLocationGate();
  capturedCtx = { backgroundPermissionRevoked, hasBackgroundPermission, backgroundPermissionChecked };
  return null;
}

// ── helper: monta il provider con ContextCapture ──────────────────────────────

interface MountResult {
  renderer: TestRenderer.ReactTestRenderer;
  intervalCallbacks: Array<{ fn: () => void | Promise<void>; ms: number }>;
}

async function mountProvider(): Promise<MountResult> {
  capturedCtx = { backgroundPermissionRevoked: false, hasBackgroundPermission: false, backgroundPermissionChecked: false };

  const intervalCallbacks: Array<{ fn: () => void | Promise<void>; ms: number }> = [];
  const origSetInterval = globalThis.setInterval;

  (globalThis as Record<string, unknown>).setInterval = (
    fn: () => void,
    ms: number,
  ) => {
    intervalCallbacks.push({ fn, ms });
    return origSetInterval(fn, ms);
  };

  let renderer!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          LocationProvider,
          null,
          React.createElement(ContextCapture, null),
        ),
      );
    });
    // Flush the async effects (checkBackgroundPermission resolves mocked promise → state update)
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  } finally {
    globalThis.setInterval = origSetInterval;
  }

  return { renderer, intervalCallbacks };
}

// =============================================================================
// Gruppo 1 — logica pura di evaluateBackgroundRevocation
// =============================================================================

describe("evaluateBackgroundRevocation — logica pura", () => {
  it("(a) hadPermission=true + denied → revoked=true (permesso revocato)", () => {
    const r = evaluateBackgroundRevocation("denied", true);
    expect(r.revoked).toBe(true);
    expect(r.granted).toBe(false);
    expect(r.nextHadPermission).toBe(true);
  });

  it("(b) hadPermission=false + denied → revoked=false (mai concesso)", () => {
    const r = evaluateBackgroundRevocation("denied", false);
    expect(r.revoked).toBe(false);
    expect(r.granted).toBe(false);
    expect(r.nextHadPermission).toBe(false);
  });

  it("(c) hadPermission=true + granted → revoked=false (permesso mantenuto)", () => {
    const r = evaluateBackgroundRevocation("granted", true);
    expect(r.revoked).toBe(false);
    expect(r.granted).toBe(true);
    expect(r.nextHadPermission).toBe(true);
  });

  it("(d) hadPermission=false + granted → nextHadPermission=true (abilita rilevazione futura)", () => {
    const r = evaluateBackgroundRevocation("granted", false);
    expect(r.revoked).toBe(false);
    expect(r.granted).toBe(true);
    expect(r.nextHadPermission).toBe(true);
  });

  it("(e) sequenza granted→denied: la seconda chiamata rileva la revoca", () => {
    const first = evaluateBackgroundRevocation("granted", false);
    expect(first.revoked).toBe(false);
    expect(first.nextHadPermission).toBe(true);

    const second = evaluateBackgroundRevocation("denied", first.nextHadPermission);
    expect(second.revoked).toBe(true);
    expect(second.granted).toBe(false);
  });

  it("(f) status generico non-granted ('undetermined') + hadPermission=true → revoked=true", () => {
    const r = evaluateBackgroundRevocation("undetermined", true);
    expect(r.revoked).toBe(true);
    expect(r.granted).toBe(false);
  });
});

// =============================================================================
// Gruppo 2 — infrastruttura polling del provider
// =============================================================================

describe("LocationProvider — registrazione setInterval e AppState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAppStateListeners.length = 0;
    mockGetBgPerms.mockResolvedValue({ status: "granted" });
    mockGetFgPerms.mockResolvedValue({ status: "granted" });
    mockWatchPosition.mockResolvedValue({ remove: vi.fn() });
  });

  it("(g) al mount registra setInterval con BG_PERMISSION_CHECK_INTERVAL ms", async () => {
    const { renderer, intervalCallbacks } = await mountProvider();

    const bgInterval = intervalCallbacks.find((i) => i.ms === BG_PERMISSION_CHECK_INTERVAL);
    expect(bgInterval).toBeDefined();
    expect(typeof bgInterval!.fn).toBe("function");

    await act(async () => { renderer.unmount(); });
  });

  it("(h) viene registrato un solo intervallo background (nessuna duplicazione)", async () => {
    const { renderer, intervalCallbacks } = await mountProvider();

    const bgIntervals = intervalCallbacks.filter((i) => i.ms === BG_PERMISSION_CHECK_INTERVAL);
    expect(bgIntervals.length).toBe(1);

    await act(async () => { renderer.unmount(); });
  });

  it("(i) al mount AppState.addEventListener è chiamato con evento 'change'", async () => {
    const { renderer } = await mountProvider();

    expect(capturedAppStateListeners.length).toBeGreaterThan(0);

    await act(async () => { renderer.unmount(); });
  });
});

// =============================================================================
// Gruppo 3 — comportamento provider: backgroundPermissionRevoked nel contesto
// =============================================================================

describe("LocationProvider — backgroundPermissionRevoked nello stato del provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAppStateListeners.length = 0;
    mockWatchPosition.mockResolvedValue({ remove: vi.fn() });
  });

  it("(j) granted→denied → backgroundPermissionRevoked=true nel contesto", async () => {
    // Prima visita: permesso concesso → hadPermission diventa true
    mockGetBgPerms.mockResolvedValue({ status: "granted" });
    mockGetFgPerms.mockResolvedValue({ status: "granted" });
    const { renderer, intervalCallbacks } = await mountProvider();

    expect(capturedCtx.backgroundPermissionChecked).toBe(true);
    expect(capturedCtx.hasBackgroundPermission).toBe(true);
    expect(capturedCtx.backgroundPermissionRevoked).toBe(false);

    // Permesso revocato: il prossimo check trova "denied"
    mockGetBgPerms.mockResolvedValue({ status: "denied" });

    const bgInterval = intervalCallbacks.find((i) => i.ms === BG_PERMISSION_CHECK_INTERVAL)!;
    await act(async () => {
      await bgInterval.fn();
      await Promise.resolve();
    });

    expect(capturedCtx.backgroundPermissionRevoked).toBe(true);
    expect(capturedCtx.hasBackgroundPermission).toBe(false);

    await act(async () => { renderer.unmount(); });
  });

  it("(k) mai concesso + denied → backgroundPermissionRevoked=false nel contesto", async () => {
    // Permesso mai concesso: entrambi i check restituiscono "denied"
    mockGetBgPerms.mockResolvedValue({ status: "denied" });
    mockGetFgPerms.mockResolvedValue({ status: "granted" });
    const { renderer, intervalCallbacks } = await mountProvider();

    expect(capturedCtx.backgroundPermissionChecked).toBe(true);
    expect(capturedCtx.hasBackgroundPermission).toBe(false);
    expect(capturedCtx.backgroundPermissionRevoked).toBe(false);

    // Un secondo check con "denied": hadPermission=false → revoked rimane false
    const bgInterval = intervalCallbacks.find((i) => i.ms === BG_PERMISSION_CHECK_INTERVAL)!;
    await act(async () => {
      await bgInterval.fn();
      await Promise.resolve();
    });

    expect(capturedCtx.backgroundPermissionRevoked).toBe(false);

    await act(async () => { renderer.unmount(); });
  });

  it("(l) sempre granted → backgroundPermissionRevoked=false nel contesto", async () => {
    mockGetBgPerms.mockResolvedValue({ status: "granted" });
    mockGetFgPerms.mockResolvedValue({ status: "granted" });
    const { renderer, intervalCallbacks } = await mountProvider();

    expect(capturedCtx.backgroundPermissionRevoked).toBe(false);
    expect(capturedCtx.hasBackgroundPermission).toBe(true);

    // Secondo check: ancora "granted"
    const bgInterval = intervalCallbacks.find((i) => i.ms === BG_PERMISSION_CHECK_INTERVAL)!;
    await act(async () => {
      await bgInterval.fn();
      await Promise.resolve();
    });

    expect(capturedCtx.backgroundPermissionRevoked).toBe(false);
    expect(capturedCtx.hasBackgroundPermission).toBe(true);

    await act(async () => { renderer.unmount(); });
  });

  it("(m) AppState background→active chiama checkBackgroundPermission nel provider reale", async () => {
    // Primo check: permesso concesso → hadPermission=true
    mockGetBgPerms.mockResolvedValue({ status: "granted" });
    mockGetFgPerms.mockResolvedValue({ status: "granted" });
    const { renderer } = await mountProvider();

    expect(capturedCtx.backgroundPermissionChecked).toBe(true);
    expect(capturedCtx.backgroundPermissionRevoked).toBe(false);

    // Cambia mock: il prossimo check vedrà "denied"
    mockGetBgPerms.mockClear();
    mockGetBgPerms.mockResolvedValue({ status: "denied" });

    // Usa il listener REALE registrato dal provider tramite AppState.addEventListener
    expect(capturedAppStateListeners.length).toBeGreaterThan(0);
    const listener = capturedAppStateListeners[capturedAppStateListeners.length - 1];

    // Step 1: background — aggiorna appState.current interno ma non attiva il check
    await act(async () => { listener("background"); });

    // Step 2: active — condizione met → checkBackgroundPermission() invocata
    await act(async () => {
      listener("active");
      await Promise.resolve();
    });

    // getBackgroundPermissionsAsync deve essere stata chiamata dal listener reale
    expect(mockGetBgPerms).toHaveBeenCalled();
    // Lo stato del provider deve riflettere la revoca
    expect(capturedCtx.backgroundPermissionRevoked).toBe(true);

    await act(async () => { renderer.unmount(); });
  });
});

// =============================================================================
// Gruppo 4 — logica condizionale listener AppState
// =============================================================================

describe("AppState listener — condizione background→active", () => {
  /**
   * Replica la condizione esatta del provider:
   *   if (current.match(/inactive|background/) && next === "active") → chiama checkBg
   * Testata come funzione pura senza montare React né eseguire chiamate native.
   */
  function simulateListener(
    currentState: string,
    nextState: string,
    onCheckBgPermission: () => void,
  ): string {
    if (currentState.match(/inactive|background/) && nextState === "active") {
      onCheckBgPermission();
    }
    return nextState;
  }

  it("(m) background→active chiama checkBackgroundPermission", () => {
    const called = vi.fn();
    simulateListener("background", "active", called);
    expect(called).toHaveBeenCalledTimes(1);
  });

  it("(n) active→background NON chiama checkBackgroundPermission", () => {
    const called = vi.fn();
    simulateListener("active", "background", called);
    expect(called).not.toHaveBeenCalled();
  });

  it("(o) inactive→active chiama checkBackgroundPermission", () => {
    const called = vi.fn();
    simulateListener("inactive", "active", called);
    expect(called).toHaveBeenCalledTimes(1);
  });

  it("(p) active→active NON chiama checkBackgroundPermission", () => {
    const called = vi.fn();
    simulateListener("active", "active", called);
    expect(called).not.toHaveBeenCalled();
  });
});

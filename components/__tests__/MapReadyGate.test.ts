/**
 * Test di robustezza cold start per MapReadyGate.
 *
 * CONTRATTO: MapReadyGate è pass-through immediato — renderizza SEMPRE i children
 * (return <>{children}</>) e NON introduce mai un wrapper bloccante (overlay/View
 * o ActivityIndicator). map-context ha default sicuri (tile di fallback), quindi
 * l'app resta usabile mentre le 3 query di config si risolvono in background.
 * Regressione storica: un overlay opaco bloccante smontava di fatto la UI e dopo
 * il grant del permesso posizione lo schermo restava appeso (il timeout di
 * sicurezza si azzerava a ogni cambio dependency). I beacon (enter/loading/pass/
 * timeout + map_ready_gate_unblock_reason) restano SOLO per il monitoring e non
 * modificano mai ciò che viene renderizzato.
 *
 * Strategia: montaggio con react-test-renderer (React reale in Node) + fake
 * timers per controllare il timeout di monitoring. useAuth / useMapConfig / i
 * beacon sono mockati e configurabili per test. blockingWrapperRendered() è
 * l'asserzione anti-regressione forte: il gate non deve introdurre NESSUN nodo
 * nativo (View/ActivityIndicator), solo i children.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: contesti ───────────────────────────────────────────────────────────
const authState = vi.hoisted(() => ({ user: null as { id: string } | null }));
const mapState = vi.hoisted(() => ({ isLoading: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/lib/map-context", () => ({ useMapConfig: () => mapState }));
vi.mock("@/lib/theme-context", () => ({
  useTheme: () => ({ colors: { background: "#000", primary: "#E53935" } }),
}));

// ── mock: beacon + prefs ─────────────────────────────────────────────────────
const sendStartupBeacon = vi.hoisted(() => vi.fn());
const loadTelemetryAlwaysActive = vi.hoisted(() => vi.fn());
vi.mock("@/lib/startup-beacon", () => ({ sendStartupBeacon }));
vi.mock("@/lib/telemetry-prefs", () => ({ loadTelemetryAlwaysActive }));

// ── mock: react-native (View / ActivityIndicator / StyleSheet) ───────────────
vi.mock("react-native", () => ({
  View: "View",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

import { MapReadyGate, MAP_READY_GATE_TIMEOUT_MS } from "@/components/layout/MapReadyGate";

const CHILD_ID = "child-content";
function Child() {
  return React.createElement("Child", { testID: CHILD_ID });
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(MapReadyGate, null, React.createElement(Child))
    );
  });
}

function childRendered(): boolean {
  return renderer!.root.findAllByType(Child).length > 0;
}

function loaderRendered(): boolean {
  return (
    renderer!.root.findAllByType("ActivityIndicator" as unknown as React.ElementType)
      .length > 0
  );
}

// Asserzione anti-regressione FORTE: il gate pass-through non deve introdurre
// alcun nodo nativo (né ActivityIndicator né View). Un overlay bloccante
// reintrodotto come semplice View senza spinner verrebbe comunque catturato qui,
// mentre loaderRendered() (solo ActivityIndicator) lo lascerebbe passare.
function blockingWrapperRendered(): boolean {
  const views = renderer!.root.findAllByType("View" as unknown as React.ElementType);
  return views.length > 0 || loaderRendered();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  authState.user = null;
  mapState.isLoading = false;
  loadTelemetryAlwaysActive.mockResolvedValue(undefined);
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
  vi.useRealTimers();
});

describe("MapReadyGate — pass-through", () => {
  it("renderizza i children subito se non c'è utente", async () => {
    authState.user = null;
    mapState.isLoading = true; // ininfluente senza utente
    await mount();
    expect(childRendered()).toBe(true);
    // Anti-regressione forte: nessun wrapper bloccante (View/ActivityIndicator).
    expect(blockingWrapperRendered()).toBe(false);
  });

  it("renderizza i children se la config mappe non è in caricamento", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = false;
    await mount();
    expect(childRendered()).toBe(true);
    expect(blockingWrapperRendered()).toBe(false);
  });
});

describe("MapReadyGate — pass-through anche durante il loading (no overlay bloccante)", () => {
  it("renderizza i children (mai un wrapper bloccante) mentre la config mappe carica per un utente loggato", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = true;
    await mount();
    // Regressione: il gate NON deve mai bloccare i children con un overlay/loader.
    // blockingWrapperRendered() cattura anche un overlay View senza spinner.
    expect(childRendered()).toBe(true);
    expect(blockingWrapperRendered()).toBe(false);
  });

  it("emette il beacon di timeout per monitoring allo scadere del ritardo se la config resta lenta", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = true;
    await mount();
    // I children sono già montati: il timeout è solo monitoring, non sblocca nulla.
    expect(childRendered()).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAP_READY_GATE_TIMEOUT_MS + 50);
    });

    expect(childRendered()).toBe(true);
    expect(blockingWrapperRendered()).toBe(false);
    expect(sendStartupBeacon).toHaveBeenCalledWith("map_ready_gate_timeout");
  });

  it("non emette il beacon di timeout prima dello scadere del ritardo", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = true;
    await mount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAP_READY_GATE_TIMEOUT_MS - 100);
    });

    expect(childRendered()).toBe(true);
    expect(sendStartupBeacon).not.toHaveBeenCalledWith("map_ready_gate_timeout");
  });
});

describe("MapReadyGate — beacon map_ready_gate_unblock_reason (monitoring)", () => {
  it("registra reason 'no_user' quando non c'è utente loggato", async () => {
    authState.user = null;
    mapState.isLoading = true; // ininfluente senza utente
    await mount();
    expect(sendStartupBeacon).toHaveBeenCalledWith("map_ready_gate_unblock_reason", {
      reason: "no_user",
    });
  });

  it("registra reason 'queries_resolved' quando l'utente è loggato e la config è già pronta", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = false;
    await mount();
    expect(sendStartupBeacon).toHaveBeenCalledWith("map_ready_gate_unblock_reason", {
      reason: "queries_resolved",
    });
  });

  it("registra reason 'timeout' allo scadere del ritardo se la config resta lenta", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = true;
    await mount();
    // Prima dello scadere non c'è ancora alcuna reason di sblocco.
    expect(sendStartupBeacon).not.toHaveBeenCalledWith(
      "map_ready_gate_unblock_reason",
      expect.anything()
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAP_READY_GATE_TIMEOUT_MS + 50);
    });

    expect(sendStartupBeacon).toHaveBeenCalledWith("map_ready_gate_unblock_reason", {
      reason: "timeout",
    });
  });

  it("emette la reason di sblocco una sola volta (no duplicati su rerender/timeout)", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = false;
    await mount();

    // Avanza ben oltre la soglia: non deve aggiungersi una seconda reason.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAP_READY_GATE_TIMEOUT_MS * 2);
    });

    const unblockCalls = sendStartupBeacon.mock.calls.filter(
      (c: unknown[]) => c[0] === "map_ready_gate_unblock_reason"
    );
    expect(unblockCalls).toHaveLength(1);
    expect(unblockCalls[0][1]).toEqual({ reason: "queries_resolved" });
  });
});

/**
 * Test di robustezza cold start per MapReadyGate.
 *
 * MapReadyGate mostra un loader finché la config mappe è in caricamento per un
 * utente loggato. Anti-blocco: se la config tarda troppo, allo scadere di
 * MAP_READY_GATE_TIMEOUT_MS sblocca comunque la UI in stato degradato (map-context
 * ha default sicuri) invece di restare appeso sul loader al cold start — causa
 * potenziale della chiusura automatica sullo splash.
 *
 * Strategia: montaggio con react-test-renderer (React reale in Node) + fake
 * timers per controllare il timeout. useAuth / useMapConfig / useTheme e i beacon
 * sono mockati e configurabili per test.
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
    expect(loaderRendered()).toBe(false);
  });

  it("renderizza i children se la config mappe non è in caricamento", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = false;
    await mount();
    expect(childRendered()).toBe(true);
  });
});

describe("MapReadyGate — anti-blocco con timeout", () => {
  it("mostra il loader mentre la config mappe carica per un utente loggato", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = true;
    await mount();
    expect(loaderRendered()).toBe(true);
    expect(childRendered()).toBe(false);
  });

  it("sblocca i children allo scadere del timeout se la config resta lenta", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = true;
    await mount();
    expect(loaderRendered()).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAP_READY_GATE_TIMEOUT_MS + 50);
    });

    expect(childRendered()).toBe(true);
    expect(loaderRendered()).toBe(false);
    expect(sendStartupBeacon).toHaveBeenCalledWith("map_ready_gate_timeout");
  });

  it("non sblocca per timeout prima dello scadere del ritardo", async () => {
    authState.user = { id: "u1" };
    mapState.isLoading = true;
    await mount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAP_READY_GATE_TIMEOUT_MS - 100);
    });

    expect(loaderRendered()).toBe(true);
    expect(sendStartupBeacon).not.toHaveBeenCalledWith("map_ready_gate_timeout");
  });
});

/**
 * Test di rendering per components/giri/list/SavedLapsArchive.tsx
 *
 * Copre i tre scenari critici identificati nel triage:
 *  (a) Lista vuota — deve renderizzare l'empty-state senza crash.
 *  (b) Lista con almeno un elemento — deve renderizzare le card dei giri.
 *  (c) Risposta API con shape inattesa (json.laps non-array) — guard
 *      Array.isArray deve prevenire il "TypeError: undefined is not a function".
 *
 * Strategia: react-test-renderer dentro un QueryClientProvider reale con
 * apiRequest mockato. Pattern identico ad AiMonitorScreen.render.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── mock: react-native ────────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (s: Record<string, unknown>) => s },
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  TextInput: "TextInput",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    accent: "#e07b39",
    accentRed: "#e74c3c",
    text: "#111",
    textSecondary: "#888",
    surface: "#fff",
    background: "#f5f5f5",
    border: "#ddd",
  }),
}));

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query-client", () => ({ apiRequest: apiRequestMock }));

// ── import del componente DOPO i mock ────────────────────────────────────────
import { SavedLapsArchive } from "@/components/giri/list/SavedLapsArchive";

// Necessario affinché react-test-renderer propaghi gli aggiornamenti di stato
// asincroni (query result) che arrivano fuori da un act() sincrono.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── fixture ──────────────────────────────────────────────────────────────────
import type { IdealLap } from "@/components/profile/types";

function makeLap(overrides: Partial<IdealLap> = {}): IdealLap {
  return {
    sessionId: "sess-1",
    startedAt: new Date("2025-07-10T08:30:00Z").toISOString(),
    sampleCount: 120,
    maxSpeedKmh: 97.5,
    maxLeanDeg: 38.2,
    maxGforce: 1.12,
    lapNumber: 1,
    lapName: "Giro test",
    distanceKm: 4.56,
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return { json: async () => body };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function buildClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

async function flushPromises(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount(client: QueryClient) {
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(SavedLapsArchive),
      ),
    );
  });
  await flushPromises();
}

function allTexts(): string[] {
  return renderer!.root
    .findAll((n) => (n.type as unknown) === "Text")
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });
}

// ── setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

// ── test suite ───────────────────────────────────────────────────────────────
describe("SavedLapsArchive — render e guard Array.isArray", () => {
  it("(a) lista vuota — non crasha e mostra l'empty state", async () => {
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ laps: [] }));

    const client = buildClient();
    await mount(client);

    expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/telemetry/ideal-laps");
    const texts = allTexts();
    expect(texts.some((t) => t.includes("Nessun giro salvato"))).toBe(true);
  });

  it("(b) lista con un elemento — rende la card del giro senza crash", async () => {
    const lap = makeLap();
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ laps: [lap] }));

    const client = buildClient();
    await mount(client);

    const texts = allTexts();
    expect(texts.some((t) => t === "Giro test")).toBe(true);
    expect(texts.some((t) => t.includes("4.56") && t.includes("km"))).toBe(true);
  });

  it("(b2) lista con più elementi — rende tutte le card", async () => {
    const laps = [
      makeLap({ sessionId: "s1", lapName: "Giro A", lapNumber: 2 }),
      makeLap({ sessionId: "s2", lapName: "Giro B", lapNumber: 1 }),
    ];
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ laps }));

    const client = buildClient();
    await mount(client);

    const texts = allTexts();
    expect(texts.some((t) => t === "Giro A")).toBe(true);
    expect(texts.some((t) => t === "Giro B")).toBe(true);
  });

  it("(c) risposta API con json.laps non-array — non crasha, mostra empty state", async () => {
    // Simula una shape inattesa che causerebbe "TypeError: undefined is not a function"
    // se laps.map() venisse chiamato su un oggetto non-array truthy.
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ laps: { unexpected: true } }));

    const client = buildClient();
    // Non deve lanciare eccezioni:
    await expect(mount(client)).resolves.not.toThrow();

    const texts = allTexts();
    expect(texts.some((t) => t.includes("Nessun giro salvato"))).toBe(true);
  });

  it("(c2) risposta API senza campo laps — non crasha, mostra empty state", async () => {
    // json.laps è undefined → Array.isArray(undefined) = false → ritorna []
    apiRequestMock.mockResolvedValueOnce(jsonResponse({}));

    const client = buildClient();
    await expect(mount(client)).resolves.not.toThrow();

    const texts = allTexts();
    expect(texts.some((t) => t.includes("Nessun giro salvato"))).toBe(true);
  });

  it("(d) errore API — mostra il messaggio di errore senza crash", async () => {
    apiRequestMock.mockRejectedValueOnce(new Error("Network error"));

    const client = buildClient();
    await mount(client);

    const texts = allTexts();
    expect(texts.some((t) => t.includes("Impossibile caricare"))).toBe(true);
  });
});

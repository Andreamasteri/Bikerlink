/**
 * Regression guard — AdminStatsCards (ValhallaCard, PhotonCard, GraphHopperCard) payload shape resilience.
 *
 * AdminStatsCards.tsx esporta ValhallaCard e PhotonCard che consumano
 * /api/admin/thinkcentre-health via useQuery. Se il payload non include
 * `valhallaDetail.activeProfiles` o `detail.history` il componente lanciava
 * TypeError su `.length` — questa guard verifica che non si ripeta.
 * GraphHopperCard consuma /api/admin/graphhopper-status e viene testata
 * con payload parziale (mode mancante) per la stessa categoria di crash.
 *
 * Varianti testate per ValhallaCard:
 *   1. payload con dettaglio valido (online, activeProfiles populated)
 *   2. error state (useQuery.error) → banner senza TypeError
 *   3. malformed: valhallaDetail senza activeProfiles/history → nessun TypeError
 *
 * Stessa struttura per PhotonCard + 4 varianti per GraphHopperCard.
 *
 * Pattern da replicare per i componenti restanti in KNOWN_GAPS:
 *   1. Importa il componente DOPO aver configurato tutti i vi.mock().
 *   2. Controlla useQuery tramite useQueryMock (dispatch per queryKey[0]).
 *   3. Testa almeno: payload valido, errore/offline, payload malformed.
 *   4. Simula l'espansione della card (press header) per coprire il ramo
 *      {!collapsed && ...} dove avvengono le chiamate critiche ai dati.
 *   5. Usa react-test-renderer + IS_REACT_ACT_ENVIRONMENT (no Playwright).
 *
 * Strategia: react-test-renderer + IS_REACT_ACT_ENVIRONMENT.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── Necessario in Node/React per gli aggiornamenti di stato asincroni ─────
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock: react-native ────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View:              "View",
  Text:              "Text",
  TouchableOpacity:  "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet:        { create: (s: Record<string, unknown>) => s },
}));

// ── Mock: @expo/vector-icons ──────────────────────────────────────────────
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
  Ionicons:               "Ionicons",
}));

// ── Mock: @/constants/colors ──────────────────────────────────────────────
vi.mock("@/constants/colors", () => ({
  default: {
    surface:       "#1a1a1a",
    card:          "#222",
    border:        "#333",
    text:          "#fff",
    textSecondary: "#999",
    accent:        "#f59e0b",
  },
}));

// ── Mock: @/lib/query-client ──────────────────────────────────────────────
vi.mock("@/lib/query-client", () => ({
  getApiUrl:        () => "http://localhost",
  authFetchHeaders: async () => ({}),
}));

// ── Mock: ThinkCentreCardParts (ErrorHistory, ProbeLog) ───────────────────
vi.mock("@/components/admin/ThinkCentreCardParts", () => ({
  ErrorHistory: "ErrorHistory",
  ProbeLog:     "ProbeLog",
}));

// ── Mock: AdminStatsCards.styles ───────────────────────────────────────────
vi.mock("@/components/admin/AdminStatsCards.styles", () => ({
  styles: {
    card: {}, cardHeader: {}, cardTitle: {}, headerRight: {}, healthDot: {},
    body: {}, row: {}, stat: {}, statValue: {}, statLabel: {}, divider: {},
    chipsRow: {}, profileChip: {}, profileChipText: {}, metaText: {},
    errorText: {}, warningBanner: {}, warningText: {},
  },
}));

// ── Mock: AdminTelemetryCard (re-export, non testato qui) ─────────────────
vi.mock("@/components/admin/AdminTelemetryCard", () => ({
  TelemetryCard: "TelemetryCard",
}));

// ── Mock: ThinkCentreValhallaPhotonBlocks (tipi only, no runtime use) ─────
vi.mock("@/components/admin/ThinkCentreValhallaPhotonBlocks", () => ({}));

// ── Mock: @tanstack/react-query — controllato per test ────────────────────
const useQueryMock = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { GraphHopperCard, ValhallaCard, PhotonCard } from "@/components/admin/AdminStatsCards";

// ── Fixture payloads ──────────────────────────────────────────────────────

const validValhallaPayload = {
  valhallaDetail: {
    configured:     true,
    ok:             true,
    latencyMs:      42,
    activeProfiles: ["motorcycle", "auto"],
    tileVersion:    "2024-01",
    error:          null,
    history:        [],
    probeLog:       [],
  },
};

const validPhotonPayload = {
  photonDetail: {
    configured: true,
    ok:         true,
    latencyMs:  15,
    error:      null,
    history:    [],
    probeLog:   [],
  },
};

/**
 * Malformed Valhalla: activeProfiles e history assenti.
 * Prima del fix → TypeError su `detail.activeProfiles.length`.
 */
const malformedValhallaPayload = {
  valhallaDetail: {
    configured: true,
    ok:         true,
    latencyMs:  50,
    // activeProfiles assente → la guard `detail.activeProfiles?.length` deve assorbire
    // history assente → la guard `detail.history?.length` deve assorbire
  },
};

/**
 * Malformed Photon: history assente.
 */
const malformedPhotonPayload = {
  photonDetail: {
    configured: true,
    ok:         false,
    latencyMs:  null,
    error:      "timeout",
    // history assente → la guard `detail.history?.length` deve assorbire
  },
};

/** GraphHopper online self-hosted. */
const ghOnline = {
  mode:    "self-hosted" as const,
  profile: "motorcycle",
  healthy: true,
  url:     "http://tc:8989",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function buildReturn(data: unknown) {
  return { data, isLoading: false, error: null, refetch: vi.fn() };
}

function buildQuery(data: unknown, opts?: { error?: Error; isLoading?: boolean }) {
  return {
    data,
    isLoading: opts?.isLoading ?? false,
    error:     opts?.error ?? null,
  };
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mountComponent(Component: React.ComponentType) {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Component));
  });
}

function findByTestId(testId: string) {
  return renderer!.root.findAll((n) => n.props.testID === testId);
}

async function expandCard(testID: string) {
  const headers = findByTestId(testID);
  expect(headers).toHaveLength(1);
  await act(async () => {
    headers[0].props.onPress();
  });
}

function allTextContents(): string[] {
  return renderer!.root
    .findAll((n) => (n.type as unknown) === "Text")
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });
}

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

// ══════════════════════════════════════════════════════════════════════════
// GraphHopperCard
// ══════════════════════════════════════════════════════════════════════════

describe("GraphHopperCard — resilienza payload", () => {

  it("1. payload online self-hosted — card monta ed espande senza TypeError", async () => {
    useQueryMock.mockReturnValue(buildQuery(ghOnline));
    await mountComponent(GraphHopperCard);
    expect(findByTestId("graphhopper-card-header")).toHaveLength(1);

    await expandCard("graphhopper-card-header");

    const texts = allTextContents();
    expect(texts.some((t) => t.includes("Self-Hosted") || t.includes("self-hosted") || t.includes("Self"))).toBe(true);
  });

  it("2. errore HTTP — header reso, nessun crash al expand", async () => {
    useQueryMock.mockReturnValue(buildQuery(undefined, { error: new Error("HTTP 503") }));
    await mountComponent(GraphHopperCard);
    expect(findByTestId("graphhopper-card-header")).toHaveLength(1);
    await expandCard("graphhopper-card-header");
  });

  it("3. loading — header reso, nessun crash", async () => {
    useQueryMock.mockReturnValue(buildQuery(undefined, { isLoading: true }));
    await mountComponent(GraphHopperCard);
    expect(findByTestId("graphhopper-card-header")).toHaveLength(1);
  });

  it("4. payload malformed (mode mancante) — card espansa senza TypeError", async () => {
    // Risposta parziale: solo `healthy`, nessun `mode` o `profile`.
    useQueryMock.mockReturnValue(buildQuery({ healthy: true }));
    await expect(
      (async () => {
        await mountComponent(GraphHopperCard);
        await expandCard("graphhopper-card-header");
      })(),
    ).resolves.toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ValhallaCard
// ══════════════════════════════════════════════════════════════════════════

describe("ValhallaCard — resilienza alla shape del payload agente", () => {

  it("1. dettaglio Valhalla valido — card monta ed espande senza TypeError", async () => {
    useQueryMock.mockReturnValue(buildReturn(validValhallaPayload));

    await mountComponent(ValhallaCard);
    await expandCard("valhalla-card-header");

    const texts = allTextContents();
    // latenza resa
    expect(texts.some((t) => t.includes("42"))).toBe(true);
  });

  it("2. error state — banner senza TypeError", async () => {
    useQueryMock.mockReturnValue({
      data:      undefined,
      isLoading: false,
      error:     new Error("HTTP 503"),
      refetch:   vi.fn(),
    });

    await mountComponent(ValhallaCard);
    await expandCard("valhalla-card-header");

    const texts = allTextContents();
    expect(texts.some((t) => t.toLowerCase().includes("impossibile"))).toBe(true);
  });

  it("3. malformed (activeProfiles e history assenti) — nessun TypeError", async () => {
    useQueryMock.mockReturnValue(buildReturn(malformedValhallaPayload));

    await expect(
      (async () => {
        await mountComponent(ValhallaCard);
        await expandCard("valhalla-card-header");
      })(),
    ).resolves.toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PhotonCard
// ══════════════════════════════════════════════════════════════════════════

describe("PhotonCard — resilienza alla shape del payload agente", () => {

  it("1. dettaglio Photon valido — card monta ed espande senza TypeError", async () => {
    useQueryMock.mockReturnValue(buildReturn(validPhotonPayload));

    await mountComponent(PhotonCard);
    await expandCard("photon-card-header");

    const texts = allTextContents();
    expect(texts.some((t) => t.includes("15"))).toBe(true);
  });

  it("2. error state — banner senza TypeError", async () => {
    useQueryMock.mockReturnValue({
      data:      undefined,
      isLoading: false,
      error:     new Error("HTTP 503"),
      refetch:   vi.fn(),
    });

    await mountComponent(PhotonCard);
    await expandCard("photon-card-header");

    const texts = allTextContents();
    expect(texts.some((t) => t.toLowerCase().includes("impossibile"))).toBe(true);
  });

  it("3. malformed (history assente, ok:false) — nessun TypeError", async () => {
    useQueryMock.mockReturnValue(buildReturn(malformedPhotonPayload));

    await expect(
      (async () => {
        await mountComponent(PhotonCard);
        await expandCard("photon-card-header");
      })(),
    ).resolves.toBeUndefined();
  });
});

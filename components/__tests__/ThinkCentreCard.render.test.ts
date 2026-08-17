/**
 * Regression guard — ThinkCentreCard payload shape resilience.
 *
 * ThinkCentreCard fetches /api/admin/thinkcentre-health and
 * /api/admin/thinkcentre-events. If the TC agent changes shape
 * (e.g. `services` missing, `overall` unknown, optional blocks absent)
 * the component must not throw a TypeError.
 *
 * Three variants tested:
 *   1. flat online valida  → card monta ed espande senza eccezioni
 *   2. error state         → banner di errore senza eccezioni
 *   3. malformed payload   → campi opzionali assenti, overall sconosciuto → nessun TypeError
 *
 * Strategia: react-test-renderer + IS_REACT_ACT_ENVIRONMENT, con useQuery
 * e useMutation controllati via vi.mocked. Tutti i sotto-componenti sono
 * mockati come stringhe per isolare il render del componente ospite.
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
  Switch:            "Switch",
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
  getQueryFnWithTimeout: () => async () => ({}),
}));

// ── Mock: @tanstack/react-query — controllato per test ───────────────────
const useQueryMock    = vi.fn();
const useMutationMock = vi.fn();
const mockQueryClient = { invalidateQueries: vi.fn() };
vi.mock("@tanstack/react-query", () => ({
  useQuery:       (...args: unknown[]) => useQueryMock(...args),
  useMutation:    (...args: unknown[]) => useMutationMock(...args),
  useQueryClient: () => mockQueryClient,
}));

// ── Mock: sotto-componenti ────────────────────────────────────────────────
vi.mock("@/components/admin/ThinkCentreCardStyles", () => ({
  styles: {
    card: {}, cardHeader: {}, cardTitle: {}, headerRight: {},
    healthDot: {}, headerCount: {}, ufwBadge: {}, pushToggleRow: {},
    pushToggleLeft: {}, pushToggleLabel: {}, pushToggleSub: {},
    errorText: {}, list: {}, poweredOffBadge: {}, poweredOffBadgeText: {},
    maintenanceBadge: {}, maintenanceBadgeText: {}, maintenanceLabelActive: {},
    poweredOffLabelActive: {},
  },
}));
vi.mock("@/components/admin/ThinkCentreCardParts", () => ({
  GraphHopperBlock: "GraphHopperBlock",
}));
vi.mock("@/components/admin/ThinkCentreServiceBadge", () => ({
  ServiceBadgeStrip: "ServiceBadgeStrip",
}));
vi.mock("@/components/admin/ThinkCentreValhallaPhotonBlocks", () => ({
  ValhallaBlock:      "ValhallaBlock",
  PhotonBlock:        "PhotonBlock",
  UfwBlock:           "UfwBlock",
  AreaResolverBlock:  "AreaResolverBlock",
}));
vi.mock("@/components/admin/ThinkCentreInfraBlocks", () => ({
  OllamaBlock:     "OllamaBlock",
  WhisperBlock:    "WhisperBlock",
  DragonflyBlock:  "DragonflyBlock",
  NginxBlock:      "NginxBlock",
  UptimeKumaBlock: "UptimeKumaBlock",
  AiHubBlock:      "AiHubBlock",
}));
vi.mock("@/components/admin/ThinkCentreAresBlock", () => ({
  AresBlock: "AresBlock",
}));
vi.mock("@/components/admin/ThinkCentreRepoDriftBanner", () => ({
  RepoDriftBanner: "RepoDriftBanner",
}));
vi.mock("@/components/admin/ThinkCentreApkSection", () => ({
  ApkSection: "ApkSection",
}));
vi.mock("@/components/admin/ThinkCentreCard.part2", () => ({
  ThinkCentreFooter:  "ThinkCentreFooter",
  CollapseChevron:    "CollapseChevron",
  overallToStatus:    () => "ok",
  serviceToStatus:    () => "ok",
  ghToStatus:         () => "ok",
  ufwToStatus:        () => "ok",
}));

// ── Mock: useThinkCentreToggles ───────────────────────────────────────────
const mockToggles = {
  pushData:            { enabled: false },
  pushLoading:         false,
  pushMutation:        { mutate: vi.fn(), isPending: false },
  maintenanceLoading:  false,
  maintenanceMutation: { mutate: vi.fn(), isPending: false },
  maintenanceActive:   false,
  poweredOffLoading:   false,
  poweredOffMutation:  { mutate: vi.fn(), isPending: false },
  poweredOffActive:    false,
  ignoreTestsLoading:  false,
  ignoreTestsMutation: { mutate: vi.fn(), isPending: false },
  ignoreTestsActive:   false,
};
vi.mock("@/components/admin/ThinkCentreCardToggles", () => ({
  useThinkCentreToggles: () => mockToggles,
}));

import { ThinkCentreCard } from "@/components/admin/ThinkCentreCard";

// ── Fixture payloads ──────────────────────────────────────────────────────

const flatOnlinePayload = {
  overall:               "green" as const,
  onlineCount:           4,
  configuredCount:       5,
  services:              [] as unknown[],
  graphhopperConfigured: false,
  graphhopperUrl:        null,
  graphhopperAreas:      [],
  checkedAt:             Date.now(),
};

const malformedPayload = {
  // `overall` ha un valore non previsto → OVERALL_COLOR restituisce undefined (no crash)
  overall:               "unknown_value" as unknown,
  // onlineCount/configuredCount assenti
  services:              [] as unknown[],
  graphhopperConfigured: false,
  graphhopperAreas:      [],
  // tokenFingerprints, repoDrift, valhallaDetail etc. tutti assenti
  checkedAt:             Date.now(),
};

// ── Helpers ───────────────────────────────────────────────────────────────

function buildHealthReturn(data: unknown) {
  return { data, isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
}
function buildEventsReturn(data: unknown) {
  return { data, isLoading: false, error: null };
}
function buildMutationReturn() {
  return { mutate: vi.fn(), isPending: false };
}

/**
 * useQueryMock discrimina per queryKey[0] — robusto ai re-render multipli.
 *   queryKey[0] contiene "thinkcentre-health" → health response
 *   queryKey[0] contiene "thinkcentre-events" → events response
 */
function setupQueryMocks(healthData: unknown, eventsData: unknown = { events: [] }) {
  useQueryMock.mockImplementation((config: { queryKey: string[] }) => {
    const key = config?.queryKey?.[0] ?? "";
    if (String(key).includes("thinkcentre-events")) {
      return buildEventsReturn(eventsData);
    }
    return buildHealthReturn(healthData);
  });
  useMutationMock.mockReturnValue(buildMutationReturn());
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ThinkCentreCard));
  });
}

function findHeader() {
  return renderer!.root.findAll(
    (n) => n.props.testID === "thinkcentre-card-header",
  );
}

async function expandCard() {
  const headers = findHeader();
  expect(headers).toHaveLength(1);
  await act(async () => {
    headers[0].props.onPress();
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
// Test suite
// ══════════════════════════════════════════════════════════════════════════

describe("ThinkCentreCard — resilienza alla shape del payload agente", () => {

  it("1. flat online valida — card monta ed espande senza TypeError", async () => {
    setupQueryMocks(flatOnlinePayload);

    await mount();
    expect(findHeader()).toHaveLength(1);

    // L'header mostra il contatore onlineCount/configuredCount
    const allTexts = renderer!.root.findAll((n) => (n.type as unknown) === "Text");
    const textContents = allTexts.map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });
    expect(textContents.some((t) => t.includes("ThinkCentre"))).toBe(true);

    // Espandi — attiva i blocchi infra (tutti mockati) senza TypeError
    await expandCard();
  });

  it("2. error state — banner di errore senza TypeError", async () => {
    useQueryMock.mockImplementation((config: { queryKey: string[] }) => {
      const key = config?.queryKey?.[0] ?? "";
      if (String(key).includes("thinkcentre-events")) {
        return { data: undefined, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, isFetching: false, error: new Error("HTTP 503"), refetch: vi.fn() };
    });
    useMutationMock.mockReturnValue(buildMutationReturn());

    await mount();
    expect(findHeader()).toHaveLength(1);

    await expandCard();

    const allTexts = renderer!.root.findAll((n) => (n.type as unknown) === "Text");
    const textContents = allTexts.map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });
    // Messaggio di errore reso
    expect(textContents.some((t) => t.toLowerCase().includes("impossibile"))).toBe(true);
  });

  it("3. payload malformed (overall sconosciuto, campi opzionali assenti) — nessun TypeError", async () => {
    setupQueryMocks(malformedPayload);

    // Il fatto che il componente monti ed espanda senza eccezioni è il requisito.
    await expect(
      (async () => {
        await mount();
        await expandCard();
      })(),
    ).resolves.toBeUndefined();
  });

  it("5. graphhopperAreas assente (payload parziale) — nessun TypeError", async () => {
    // Simulates a TC partial response where graphhopperAreas is absent but
    // graphhopperConfigured is true — previously crashed in ghToStatus and as a prop.
    const partialPayload = {
      overall:               "green" as const,
      onlineCount:           2,
      configuredCount:       3,
      services:              [],
      graphhopperConfigured: true,
      graphhopperUrl:        null,
      // graphhopperAreas intentionally absent
      checkedAt:             Date.now(),
    };
    setupQueryMocks(partialPayload);

    await expect(
      (async () => {
        await mount();
        await expandCard();
      })(),
    ).resolves.toBeUndefined();
  });

  it("4. payload undefined (loading) — solo header, nessun crash", async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isFetching: false, error: null, refetch: vi.fn() });
    useMutationMock.mockReturnValue(buildMutationReturn());

    await mount();
    expect(findHeader()).toHaveLength(1);
  });
});

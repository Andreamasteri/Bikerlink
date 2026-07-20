/**
 * Regression guard — ServerEfficiencyCard payload shape resilience.
 *
 * Bug storico (Task #564): il componente crashava con TypeError quando
 * l'API restituiva una risposta parziale/cached con `cpu: undefined`.
 * La guard è ora inline nel componente:
 *
 *   const cpu = data?.cpu ?? null;
 *   const memory = data?.memory ?? null;
 *   const network = data?.network ?? null;
 *
 * Questo test verifica che un futuro cambiamento non ripristini il crash,
 * coprendo tre varianti di payload:
 *   1. payload completo e valido → card espansa senza eccezioni, valori reali
 *   2. null data (loading)       → solo header, nessun crash
 *   3. malformed (cpu: undefined) → nessun TypeError, "—" per tutte le metriche
 *
 * Strategia: react-test-renderer + IS_REACT_ACT_ENVIRONMENT, con useQuery
 * controllato per test (vi.mocked). Il componente usa useState(true) per
 * collapsed; simuliamo il press sull'header per espandere il contenuto
 * guardato e coprire le chiamate a .toFixed().
 *
 * Le dipendenze native/expo sono mockate solo per far caricare il modulo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── Necessario in Node/React per gli aggiornamenti di stato asincroni ─────
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock: react-native ────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

// ── Mock: @expo/vector-icons ──────────────────────────────────────────────
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
  Ionicons: "Ionicons",
}));

// ── Mock: @/constants/colors ──────────────────────────────────────────────
vi.mock("@/constants/colors", () => ({
  default: {
    surface: "#1a1a1a",
    border: "#333",
    text: "#fff",
    textSecondary: "#999",
    background: "#0d0d0d",
  },
}));

// ── Mock: @/lib/query-client ──────────────────────────────────────────────
vi.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://localhost",
  authFetchHeaders: async () => ({}),
}));

// ── Mock: @tanstack/react-query — controllato per test ────────────────────
// ServerEfficiencyCard chiama useQuery DUE volte (metriche + log).
// useQueryMock restituisce il valore corrispondente in base all'ordine di chiamata.
const useQueryMock = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { ServerEfficiencyCard } from "@/components/admin/ServerEfficiencyCard";

// ── Fixture payloads ──────────────────────────────────────────────────────

/** Payload completo e valido — shape attesa dall'API server-metrics */
const fullPayload = {
  cpu: {
    loadAvg1: 0.45,
    loadAvg5: 0.62,
    loadAvg15: 0.58,
    cores: 4,
    loadPerCore: 0.11,
    processCpuPercent: 3.2,
  },
  memory: {
    total: 8 * 1024 * 1024 * 1024,
    free: 2 * 1024 * 1024 * 1024,
    used: 6 * 1024 * 1024 * 1024,
    usedPercent: 75,
    processRss: 512 * 1024 * 1024,
    processHeapUsed: 256 * 1024 * 1024,
    processHeapTotal: 384 * 1024 * 1024,
  },
  network: {
    rxBytes: 1024 * 1024 * 50,
    txBytes: 1024 * 1024 * 10,
    rxRate: 1024 * 5,
    txRate: 1024 * 2,
  },
  uptimeSec: 3600 * 24 + 3600 * 3 + 60 * 15,
  serverNow: Date.now(),
};

/** Payload log */
const logsPayload = {
  lines: ["[INFO] server started", "[INFO] health ok"],
  count: 2,
};

/** Payload malformed: cpu: undefined (simula risposta parziale/cached) */
const malformedPayload = {
  // cpu assente intenzionalmente — simula il bug del Task #564
  memory: {
    total: 4 * 1024 * 1024 * 1024,
    free: 1 * 1024 * 1024 * 1024,
    used: 3 * 1024 * 1024 * 1024,
    usedPercent: 75,
    processRss: 200 * 1024 * 1024,
    processHeapUsed: 100 * 1024 * 1024,
    processHeapTotal: 150 * 1024 * 1024,
  },
  uptimeSec: 600,
  serverNow: Date.now(),
};

// ── Helpers ───────────────────────────────────────────────────────────────

function buildMetricsReturn(data: unknown, isLoading = false) {
  return { data, isLoading, error: null };
}

function buildLogsReturn(data: unknown = logsPayload) {
  return { data, isLoading: false, error: null };
}

/**
 * Imposta useQueryMock in modo che la chiamata con queryKey contenente
 * "server-metrics" restituisca `metricsReturn` e quella con "server-logs"
 * restituisca `logsReturn`. Funziona su tutti i re-render successivi.
 */
function mockBothQueries(
  metricsReturn: ReturnType<typeof buildMetricsReturn>,
  logsReturn = buildLogsReturn(),
) {
  useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0] ?? "";
    return key.includes("server-logs") ? logsReturn : metricsReturn;
  });
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ServerEfficiencyCard));
  });
}

function findHeader() {
  return renderer!.root.findAll(
    (n) => n.props.testID === "server-efficiency-card-header",
  );
}

async function expandCard() {
  const headers = findHeader();
  expect(headers).toHaveLength(1);
  await act(async () => {
    headers[0].props.onPress();
  });
}

function getTextContents(): string[] {
  const allTexts = renderer!.root.findAll((n) => (n.type as unknown) === "Text");
  return allTexts.map((n) => {
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
// Test suite
// ══════════════════════════════════════════════════════════════════════════

describe("ServerEfficiencyCard — resilienza alla shape del payload API", () => {

  it("1. payload completo — card monta ed espande senza TypeError, valori reali visibili", async () => {
    mockBothQueries(buildMetricsReturn(fullPayload));

    await mount();
    // Collapsed per default: l'header deve esserci senza crash.
    expect(findHeader()).toHaveLength(1);

    // Espandi — attiva le sezioni CPU/RAM/Rete che chiamano .toFixed()
    await expandCard();

    const texts = getTextContents();

    // loadAvg1 = 0.45 → "0.45"
    expect(texts.some((t) => t.includes("0.45"))).toBe(true);
    // loadPerCore = 0.11 → (0.11 * 100).toFixed(0) = "11%"
    expect(texts.some((t) => t.includes("11%"))).toBe(true);
    // memory.usedPercent = 75 → "75%"
    expect(texts.some((t) => t.includes("75%"))).toBe(true);
  });

  it("2. null data (loading) — solo header, nessun crash", async () => {
    mockBothQueries(buildMetricsReturn(undefined, true), buildLogsReturn(undefined));

    await mount();
    // Nessun crash; l'header è l'unica cosa resa.
    expect(findHeader()).toHaveLength(1);
  });

  it("3. payload malformed (cpu: undefined) — nessun TypeError, '—' per le metriche CPU", async () => {
    mockBothQueries(buildMetricsReturn(malformedPayload));

    // Il fatto stesso che il componente monti ed espanda senza eccezioni è il requisito.
    await expect(
      (async () => {
        await mount();
        await expandCard();
      })(),
    ).resolves.toBeUndefined();

    const texts = getTextContents();

    // La guard `data?.cpu ?? null` → cpu=null → tutti i campi CPU mostrano "—"
    // Verifichiamo che almeno un "—" appaia (Load 1m, Load 5m/15m, o carico).
    expect(texts.some((t) => t === "—")).toBe(true);

    // Nessun .toFixed() su undefined deve essere stato eseguito (crash sarebbe avvenuto sopra).
    // Verifichiamo anche che non appaia nessun valore numerico CPU (come il loadAvg1 del payload).
    expect(texts.some((t) => t.includes("0.45"))).toBe(false);
  });

  it("4. payload con cpu: {} (oggetto vuoto) — nessun TypeError, '—' per loadAvg1", async () => {
    // Questo è il crash storico di Task #900:
    //   "Cannot read property 'loadAvg1' of undefined"
    // Si verificava quando il server restituiva `cpu: {}` (oggetto vuoto) invece di
    // `cpu: undefined`. In quel caso `cpu` era truthy ma `cpu.loadAvg1` era undefined,
    // e il ramo `{cpu ? cpu.loadAvg1.toFixed(2) : "—"}` chiamava .toFixed() su undefined.
    //
    // Il fix usa optional chaining: `cpu?.loadAvg1 != null ? cpu.loadAvg1.toFixed(2) : "—"`.
    const emptyCpuPayload = {
      cpu: {}, // oggetto truthy ma senza i campi numerici
      memory: {
        total: 4 * 1024 * 1024 * 1024,
        free: 1 * 1024 * 1024 * 1024,
        used: 3 * 1024 * 1024 * 1024,
        usedPercent: 75,
        processRss: 200 * 1024 * 1024,
        processHeapUsed: 100 * 1024 * 1024,
        processHeapTotal: 150 * 1024 * 1024,
      },
      network: {
        rxBytes: 1024 * 1024 * 10,
        txBytes: 1024 * 1024 * 2,
        rxRate: 1024,
        txRate: 512,
      },
      uptimeSec: 600,
      serverNow: Date.now(),
    };

    mockBothQueries(buildMetricsReturn(emptyCpuPayload));

    // Nessun TypeError deve essere lanciato — né durante il mount né all'espansione.
    await expect(
      (async () => {
        await mount();
        await expandCard();
      })(),
    ).resolves.toBeUndefined();

    const texts = getTextContents();

    // loadAvg1 è undefined → il guard mostra "—" (non crasha con .toFixed on undefined)
    expect(texts.some((t) => t === "—")).toBe(true);

    // Nessun valore numerico da loadAvg1 deve apparire (sarebbe "NaN" o "undefined" se rotto)
    expect(texts.some((t) => t.includes("NaN"))).toBe(false);
    expect(texts.some((t) => t.includes("undefined"))).toBe(false);
  });

});

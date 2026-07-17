/**
 * Regression guard — ThinkCentreSystemMonitor payload shape resilience.
 *
 * ThinkCentreSystemMonitor fa polling diretto su /api/admin/thinkcentre-metrics
 * (non usa useQuery). Se l'API restituisce una shape inattesa (es. diskMounts
 * assente, ramTotalMb = 0/undefined) il componente non deve lanciare TypeError.
 *
 * Tre varianti testate:
 *   1. disabilitato (default) — stato off senza crash
 *   2. payload online valido — dopo enable, poll riceve shape corretta
 *   3. payload malformed — poll riceve shape incompleta, nessun TypeError
 *
 * Strategia: react-test-renderer + IS_REACT_ACT_ENVIRONMENT, fetch mockato
 * globalmente, AsyncStorage e ThinkCentreCharts mockati.
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
  ScrollView:        ({ children, ...rest }: Record<string, unknown>) =>
    React.createElement("ScrollView", rest, children as React.ReactNode),
  Switch:            "Switch",
  TouchableOpacity:  "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet:        { create: (s: Record<string, unknown>) => s },
}));

// ── Mock: @expo/vector-icons ──────────────────────────────────────────────
vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
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

// ── Mock: AsyncStorage ────────────────────────────────────────────────────
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Mock: ThinkCentreCharts (evita import di svg/canvas) ─────────────────
vi.mock("@/components/admin/ThinkCentreCharts", () => ({
  LineChart: "LineChart",
  DiskBar:   "DiskBar",
  VramBar:   "VramBar",
}));

// ── Fixture: payload fetch ────────────────────────────────────────────────

const onlinePayload = {
  online:       true,
  loadAvg1:     1.2,
  ramUsedMb:    4096,
  ramTotalMb:   16384,
  netRxKBs:     100,
  netTxKBs:     50,
  diskReadKBs:  200,
  diskWriteKBs: 100,
  diskMounts:   [{ path: "/", usedGb: 120, totalGb: 500, usedPct: 24 }],
  cpuTempC:     55,
  gpuTempC:     null,
  gpuUtilPct:   null,
  vramUsedMb:   null,
  vramTotalMb:  null,
  gpuName:      null,
};

const offlinePayload = {
  online: false,
  reason: "timeout",
};

/** Payload malformed: online:true ma diskMounts/ramTotalMb assenti */
const malformedPayload = {
  online: true,
  // diskMounts assente → la guard `data.diskMounts ?? []` deve assorbire
  // ramTotalMb = 0 → `ramTotalMb > 0` falso → ramPctVal = null, no crash
  loadAvg1:     0.5,
  ramUsedMb:    2048,
  ramTotalMb:   0,
  netRxKBs:     0,
  netTxKBs:     0,
  diskReadKBs:  0,
  diskWriteKBs: 0,
  cpuTempC:     null,
  gpuTempC:     null,
};

function makeFetchMock(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok:   true,
    json: () => Promise.resolve(body),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

import { ThinkCentreSystemMonitor } from "@/components/admin/ThinkCentreSystemMonitor";

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(ThinkCentreSystemMonitor),
    );
  });
}

/** Trova il componente Switch (il toggle principale del monitor). */
function findToggleSwitch() {
  return renderer!.root.findAll((n) => (n.type as unknown) === "Switch");
}

/** Abilita il monitor premendo il toggle Switch principale. */
async function enableMonitor() {
  const switches = findToggleSwitch();
  expect(switches.length).toBeGreaterThanOrEqual(1);
  await act(async () => {
    switches[0].props.onValueChange(true);
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

describe("ThinkCentreSystemMonitor — resilienza alla shape del payload agente", () => {

  it("1. stato disabilitato (default) — monta senza crash, nessun fetch", async () => {
    const fetchSpy = makeFetchMock(onlinePayload);
    vi.stubGlobal("fetch", fetchSpy);

    await mount();

    // Il toggle esiste ed è disabilitato
    const switches = findToggleSwitch();
    expect(switches.length).toBeGreaterThanOrEqual(1);
    expect(switches[0].props.value).toBe(false);

    // Nessuna chiamata fetch in stato disabilitato
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("2. payload online valido — abilita il monitor, poll risponde senza TypeError", async () => {
    vi.stubGlobal("fetch", makeFetchMock(onlinePayload));
    vi.stubGlobal("AbortSignal", {
      timeout: () => ({ aborted: false }),
      any:     (sigs: AbortSignal[]) => sigs[0],
    });

    await mount();

    await expect(
      (async () => {
        await enableMonitor();
        // Lascia che la Promise fetch si risolva
        await act(async () => { await Promise.resolve(); });
      })(),
    ).resolves.toBeUndefined();
  });

  it("3. payload offline — abilita il monitor, nessun TypeError", async () => {
    vi.stubGlobal("fetch", makeFetchMock(offlinePayload));

    await mount();

    await expect(
      (async () => {
        await enableMonitor();
        await act(async () => { await Promise.resolve(); });
      })(),
    ).resolves.toBeUndefined();
  });

  it("4. payload malformed (diskMounts assente, ramTotalMb=0) — nessun TypeError", async () => {
    vi.stubGlobal("fetch", makeFetchMock(malformedPayload));

    await mount();

    // Il fatto stesso che mount+enable non lanci eccezioni è il requisito.
    await expect(
      (async () => {
        await enableMonitor();
        await act(async () => { await Promise.resolve(); });
      })(),
    ).resolves.toBeUndefined();
  });
});

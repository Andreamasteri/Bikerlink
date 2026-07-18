/**
 * Task #571 — metricsToStatus resta "ok" quando il routing è abilitato ma idle
 * (zero richieste nella finestra di 5 minuti).
 *
 * Testa `metricsToStatus` (helper esportato da components/admin/RoutingCoordinationCard.tsx)
 * in isolamento, senza render del componente.
 *
 * Casi coperti:
 *   1. zero richieste + kill-switch abilitato   → "ok"    (idle ma attivo)
 *   2. zero richieste + kill-switch disabilitato → "offline" (esplicitamente spento)
 *   3. solo successi                             → "ok"    (traffico regolare)
 */
import { describe, it, expect, vi } from "vitest";

// ── mock: dipendenze necessarie solo per caricare il modulo ──────────────────
vi.mock("react-native", () => ({
  StyleSheet: { create: (s: unknown) => s },
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  Platform: { OS: "android" },
}));

vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn().mockReturnValue({}),
  useMutation: vi.fn().mockReturnValue({ isPending: false, isError: false, data: null }),
}));

vi.mock("@/constants/colors", () => ({ default: { textSecondary: "#999" } }));

vi.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://localhost:5000",
  authFetchHeaders: vi.fn().mockResolvedValue({}),
}));

vi.mock("../admin/RoutingCoordinationCard.parts", () => ({
  Section: "Section",
  CollapseChevron: "CollapseChevron",
}));

vi.mock("../admin/RoutingCoordinationCard.styles", () => ({
  styles: {},
}));

vi.mock("../admin/SystemHealthContainer", () => ({}));

// ── import della funzione sotto test ────────────────────────────────────────
import { metricsToStatus } from "../admin/RoutingCoordinationCard";

// ── fixture helpers ──────────────────────────────────────────────────────────

function makeMetrics(successes: number, fallbacks: number, failures: number) {
  return {
    windowMs: 300_000,
    successes,
    fallbacks,
    failures,
    byEngine: {},
  };
}

function makeKillSwitch(enabled: boolean) {
  return { enabled, envOverride: null as null, softEnabled: null as boolean | null };
}

// ── test cases ───────────────────────────────────────────────────────────────

describe("metricsToStatus", () => {
  it("zero richieste + kill-switch abilitato → ok (routing idle ma attivo)", () => {
    expect(metricsToStatus(makeMetrics(0, 0, 0), makeKillSwitch(true))).toBe("ok");
  });

  it("zero richieste + kill-switch disabilitato → offline (esplicitamente spento)", () => {
    expect(metricsToStatus(makeMetrics(0, 0, 0), makeKillSwitch(false))).toBe("offline");
  });

  it("solo successi → ok (traffico regolare senza fallback né errori)", () => {
    expect(metricsToStatus(makeMetrics(8, 0, 0), makeKillSwitch(true))).toBe("ok");
  });

  it("zero richieste + kill-switch undefined → unknown", () => {
    expect(metricsToStatus(makeMetrics(0, 0, 0), undefined)).toBe("unknown");
  });

  it("metrics undefined → unknown", () => {
    expect(metricsToStatus(undefined, makeKillSwitch(true))).toBe("unknown");
  });

  it("fallback presenti ma zero failure → degraded", () => {
    expect(metricsToStatus(makeMetrics(5, 3, 0), makeKillSwitch(true))).toBe("degraded");
  });

  it("failure presenti → offline (indipendentemente dai successi)", () => {
    expect(metricsToStatus(makeMetrics(10, 0, 1), makeKillSwitch(true))).toBe("offline");
  });
});

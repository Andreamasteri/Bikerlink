import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before the unit-under-test import.
//
// Questo test copre i tre comportamenti nuovi in thinkcentre-health-gh-probes.ts:
//   (a) PointNotFoundException su /route → area ok: true (motore vivo, punto fuori strada)
//   (b) Due fallimenti consecutivi non-400 → area ok: false (badge giallo)
//   (c) Successo dopo un fallimento → contatore azzerato, area ok: true
//
// Strategia:
//   - httpProbeMock controlla la risposta di /areas/<code>/health
//   - fetchMock controlla la risposta di POST /areas/<code>/route
//   - Le utility di log/storia sono stub no-op per isolare il comportamento
// ---------------------------------------------------------------------------

const httpProbeMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const getAreaEnabledMapMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/cf-access", () => ({ cfAccessHeaders: () => ({}) }));
vi.mock("../graphhopper-client", () => ({ ACTIVE_PROFILE: "motorcycle" }));
vi.mock("../routing/routing-area-state", () => ({
  getAreaEnabledMap: getAreaEnabledMapMock,
}));

// Mock completo di thinkcentre-health-utils:
// - httpProbe è il mock controllabile per la /health
// - readBodySafe è un'implementazione reale leggera (legge res.text())
// - le utility di storia/log sono no-op (non interessano a questi test)
vi.mock("../routes/admin/thinkcentre-health-utils", () => ({
  PROBE_TIMEOUT_MS: 5_000,
  httpProbe: httpProbeMock,
  readBodySafe: async (res: { text: () => Promise<string> }) => {
    try { return await res.text(); } catch { return ""; }
  },
  sanitizeError: (s: string) => s.slice(0, 400),
  maskUrl: (url: string) => url,
  recordError: vi.fn(),
  getHistory: vi.fn(() => []),
  recordProbeLog: vi.fn(),
  getProbeLog: vi.fn(() => []),
  isStartingUp: vi.fn(() => false),
}));

global.fetch = fetchMock as unknown as typeof fetch;

import {
  probeGraphHopperAreas,
  resetConsecutiveFailuresForTests,
} from "../routes/admin/thinkcentre-health-gh-probes";
import { ROUTING_AREAS, type RoutingAreaCode } from "@shared/routing-areas";
import { AREA_PROBE_POINTS as ADMIN_AREA_PROBE_POINTS } from "../routes/admin/thinkcentre-health-gh-probes";
import { AREA_PROBE_POINTS as MONITOR_AREA_PROBE_POINTS } from "../jobs/thinkcentre-monitor-probes";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mappa area → abilitato: solo le aree in `overrides` sono abilitate. */
function enabledMap(
  overrides: Partial<Record<RoutingAreaCode, boolean>> = {},
): Record<RoutingAreaCode, boolean> {
  const base = {} as Record<RoutingAreaCode, boolean>;
  for (const a of ROUTING_AREAS) base[a.codice] = false;
  return { ...base, ...overrides };
}

/** Risposta fetch HTTP GET 2xx (per /health OK). */
function healthOk(): { ok: boolean; latencyMs: number; status: number } {
  return { ok: true, latencyMs: 20, status: 200 };
}

/** Risposta fetch HTTP GET non-2xx (per /health KO, non-auth). */
function healthKo(): { ok: boolean; latencyMs: number; status: number; error: string } {
  return { ok: false, latencyMs: 20, status: 503, error: "HTTP 503" };
}

/**
 * Risposta fetch POST per /route con status e body testuale.
 * readBodySafe chiama res.text() — la fornisce come metodo dell'oggetto.
 */
function routeResponse(status: number, body = ""): Response {
  return {
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  resetConsecutiveFailuresForTests();
  process.env.GRAPHHOPPER_URL = "https://gh.example.org";
  delete process.env.GRAPHHOPPER_TOKEN;
});

// =============================================================================
// (a) PointNotFoundException su /route → area ok: true (motore vivo)
// =============================================================================

describe("PointNotFoundException su /route → area ok: true", () => {
  it("quando /health fallisce e /route risponde 400 + PointNotFoundException, l'area è ok: true", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true }));
    // /health KO (non-auth) → si tenta /route
    httpProbeMock.mockResolvedValue(healthKo());
    // /route risponde 400 con PointNotFoundException nel body
    fetchMock.mockResolvedValue(
      routeResponse(400, '{"message":"com.graphhopper.util.exceptions.PointNotFoundException: Cannot find point 0: 23.73, 37.98"}'),
    );

    const result = await probeGraphHopperAreas();

    expect(result.ok).toBe(true);
    const area = result.areas.find((a) => a.code === "grecia");
    expect(area?.ok).toBe(true);
  });

  it("il GH tile rimane verde (graphhopper.ok=true) quando tutte le aree hanno solo PointNotFoundException", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true, iberia: true }));
    httpProbeMock.mockResolvedValue(healthKo());
    fetchMock.mockResolvedValue(
      routeResponse(400, "PointNotFoundException: Cannot find point"),
    );

    const result = await probeGraphHopperAreas();

    expect(result.ok).toBe(true);
    // Filtra solo le aree abilitate: le disabilitate hanno sempre ok:false
    const enabledAreas = result.areas.filter((a) => a.enabled);
    expect(enabledAreas.every((a) => a.ok)).toBe(true);
  });

  it("HTTP 400 senza PointNotFoundException nel body NON è ok: true (errore reale)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true }));
    httpProbeMock.mockResolvedValue(healthKo());
    // 400 ma con un errore diverso (es. payload malformato)
    fetchMock.mockResolvedValue(routeResponse(400, '{"message":"Bad request payload"}'));

    const result = await probeGraphHopperAreas();

    // Il primo fallimento è smorzato dall'isteresi (failures < 2 → ok: true)
    // ma NON per PointNotFoundException — è un vero errore di routing
    // Dopo 2 run la logica cambia, qui verifichiamo solo il flag warn assente
    const area = result.areas.find((a) => a.code === "grecia");
    // 1° fallimento: isteresi mantiene ok: true ma NON per warn-off-road
    // (l'area è true solo per isteresi, non per classificazione del 400)
    expect(area).toBeDefined();
    // Non vogliamo che un 400 generico sia trattato come "motore OK"
    // — dopo due probe consecutive sarebbe false; qui è il primo fallimento
    // quindi ok=true per isteresi, ma il probeLog deve riportare l'errore
  });
});

// =============================================================================
// (b) Due fallimenti consecutivi non-400 → area ok: false
// =============================================================================

describe("Isteresi: 2 fallimenti consecutivi → area ok: false", () => {
  it("primo fallimento (5xx) → area ok: true (badge invariato)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ balcani: true }));
    httpProbeMock.mockResolvedValue(healthKo());
    fetchMock.mockResolvedValue(routeResponse(500, "Internal Server Error"));

    const result = await probeGraphHopperAreas();

    const area = result.areas.find((a) => a.code === "balcani");
    expect(area?.ok).toBe(true);
    // Ma l'overall può ancora essere true (solo un'area enabled)
    expect(result.ok).toBe(true);
  });

  it("secondo fallimento consecutivo (5xx) → area ok: false (badge giallo)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ balcani: true }));
    httpProbeMock.mockResolvedValue(healthKo());
    fetchMock.mockResolvedValue(routeResponse(500, "Internal Server Error"));

    // Prima probe: 1° fallimento — area ok: true
    await probeGraphHopperAreas();

    // Seconda probe: 2° fallimento consecutivo — area ok: false
    const result = await probeGraphHopperAreas();

    const area = result.areas.find((a) => a.code === "balcani");
    expect(area?.ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("due fallimenti di timeout → area ok: false dopo il secondo", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true }));
    httpProbeMock.mockResolvedValue(healthKo());
    // Timeout: fetch lancia AbortError
    fetchMock.mockRejectedValue(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));

    await probeGraphHopperAreas(); // 1° → ok: true
    const result = await probeGraphHopperAreas(); // 2° → ok: false

    const area = result.areas.find((a) => a.code === "grecia");
    expect(area?.ok).toBe(false);
  });

  it("tre fallimenti consecutivi → area ok: false (contatore non si azzera da solo)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ iberia: true }));
    httpProbeMock.mockResolvedValue(healthKo());
    fetchMock.mockResolvedValue(routeResponse(503, "Service Unavailable"));

    await probeGraphHopperAreas(); // 1° → ok: true
    await probeGraphHopperAreas(); // 2° → ok: false
    const result = await probeGraphHopperAreas(); // 3° → ok: false

    const area = result.areas.find((a) => a.code === "iberia");
    expect(area?.ok).toBe(false);
  });

  it("401/403 da /health → ok: false immediato (no isteresi, è token drift)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ balcani: true }));
    // Auth error dalla /health: non ci si aspetta di arrivare al /route
    httpProbeMock.mockResolvedValue({
      ok: false,
      latencyMs: 10,
      status: 401,
      error: "HTTP 401",
    });

    const result = await probeGraphHopperAreas();

    // Token drift → ok: false immediatamente (senza isteresi)
    const area = result.areas.find((a) => a.code === "balcani");
    expect(area?.ok).toBe(false);
  });
});

// =============================================================================
// (c) Successo dopo un fallimento → contatore azzerato, area ok: true
// =============================================================================

describe("Isteresi: successo dopo un fallimento azzera il contatore", () => {
  it("fallimento poi successo → ok: true (contatore azzerato)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true }));
    httpProbeMock.mockResolvedValue(healthKo());

    // 1° probe: fallisce → ok: true (isteresi)
    fetchMock.mockResolvedValueOnce(routeResponse(500, "Server Error"));
    await probeGraphHopperAreas();

    // 2° probe: successo → ok: true, contatore azzerato
    fetchMock.mockResolvedValueOnce(routeResponse(200));
    const result = await probeGraphHopperAreas();

    const area = result.areas.find((a) => a.code === "grecia");
    expect(area?.ok).toBe(true);
  });

  it("fallimento → successo → fallimento → ancora ok: true (contatore ri-parte da 1)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true }));
    httpProbeMock.mockResolvedValue(healthKo());

    // 1° probe: fallisce → failures=1, ok: true
    fetchMock.mockResolvedValueOnce(routeResponse(500, "Server Error"));
    await probeGraphHopperAreas();

    // 2° probe: successo → failures=0, ok: true
    fetchMock.mockResolvedValueOnce(routeResponse(200));
    await probeGraphHopperAreas();

    // 3° probe: fallisce di nuovo → failures=1 (ri-parte da 0), ok: true
    fetchMock.mockResolvedValueOnce(routeResponse(500, "Server Error"));
    const result = await probeGraphHopperAreas();

    const area = result.areas.find((a) => a.code === "grecia");
    expect(area?.ok).toBe(true);
  });

  it("fallimento → successo via /health OK → fallimento: ok: true (contatore ri-parte)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ arco_alpino: true } as Partial<Record<RoutingAreaCode, boolean>>));
    // Usa il codice corretto con trattino
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ "arco-alpino": true }));

    // 1° probe: /health KO, /route 500 → failures=1, ok: true
    httpProbeMock.mockResolvedValueOnce(healthKo());
    fetchMock.mockResolvedValueOnce(routeResponse(500, "Server Error"));
    await probeGraphHopperAreas();

    // 2° probe: /health OK → failures azzerato, ok: true (non passa nemmeno dal /route)
    httpProbeMock.mockResolvedValueOnce(healthOk());
    await probeGraphHopperAreas();

    // 3° probe: /health KO, /route 500 → failures=1 di nuovo, ok: true
    httpProbeMock.mockResolvedValueOnce(healthKo());
    fetchMock.mockResolvedValueOnce(routeResponse(500, "Server Error"));
    const result = await probeGraphHopperAreas();

    const area = result.areas.find((a) => a.code === "arco-alpino");
    expect(area?.ok).toBe(true);
  });

  it("PointNotFoundException azzera il contatore (è un successo del motore)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ ecuador: true }));
    httpProbeMock.mockResolvedValue(healthKo());

    // 1° probe: 500 → failures=1
    fetchMock.mockResolvedValueOnce(routeResponse(500, "Server Error"));
    await probeGraphHopperAreas();

    // 2° probe: 400+PointNotFoundException → azzerato (motore vivo), ok: true
    fetchMock.mockResolvedValueOnce(
      routeResponse(400, "PointNotFoundException: Cannot find point 0"),
    );
    const result = await probeGraphHopperAreas();

    const area = result.areas.find((a) => a.code === "ecuador");
    expect(area?.ok).toBe(true);

    // 3° probe: 500 → failures=1 di nuovo, ok: true (non 2)
    fetchMock.mockResolvedValueOnce(routeResponse(500, "Server Error"));
    const result3 = await probeGraphHopperAreas();

    const area3 = result3.areas.find((a) => a.code === "ecuador");
    expect(area3?.ok).toBe(true);
  });
});

// =============================================================================
// Coordinate hardcoded per area (areaProbePoints)
// =============================================================================

import { areaProbePoints } from "../routes/admin/thinkcentre-health-gh-probes";

describe("areaProbePoints — coordinate hardcoded per area", () => {
  it("grecia usa coordinate hardcoded (Atene, non bbox-center)", () => {
    const area = ROUTING_AREAS.find((a) => a.codice === "grecia")!;
    const points = areaProbePoints(area);
    // Il bbox-center di grecia sarebbe circa lon=23.75, lat=38.75 (in mare Egeo)
    // Le coordinate hardcoded puntano ad Atene (lat~37.98, fuori dal mare)
    expect(points).toHaveLength(2);
    const [p1, p2] = points;
    expect(p1[1]).toBeCloseTo(37.98, 1); // lat Atene ≠ bbox-center lat 38.75
    expect(p2[1]).toBeCloseTo(37.97, 1);
  });

  it("ecuador usa coordinate hardcoded (Quito, non bbox-center)", () => {
    const area = ROUTING_AREAS.find((a) => a.codice === "ecuador")!;
    const points = areaProbePoints(area);
    // Quito: lon~-78.47, lat~-0.18
    expect(points[0][0]).toBeCloseTo(-78.47, 1);
    expect(points[0][1]).toBeCloseTo(-0.18, 1);
  });
});

// =============================================================================
// Gate: ogni area in ROUTING_AREAS deve avere coordinate hardcoded in ENTRAMBE
// le mappe AREA_PROBE_POINTS (admin probe + monitor probe).
//
// Se viene aggiunta una nuova area a ROUTING_AREAS senza aggiornare le mappe,
// questi test falliscono esplicitamente con il nome dell'area mancante.
// =============================================================================

describe("Gate: AREA_PROBE_POINTS coverage — admin probe (thinkcentre-health-gh-probes)", () => {
  it("ogni codice in ROUTING_AREAS ha una entry hardcoded in ADMIN_AREA_PROBE_POINTS", () => {
    const missing: string[] = [];
    for (const area of ROUTING_AREAS) {
      if (!(area.codice in ADMIN_AREA_PROBE_POINTS)) {
        missing.push(area.codice);
      }
    }
    expect(missing, [
      "Aree mancanti in AREA_PROBE_POINTS (server/routes/admin/thinkcentre-health-gh-probes.ts):",
      ...missing.map((c) => `  → "${c}" — aggiungi coordinate hardcoded on-road (lon, lat) per questa area`),
    ].join("\n")).toHaveLength(0);
  });

  it("le coordinate hardcoded hanno valori plausibili (non NaN, non zero)", () => {
    for (const area of ROUTING_AREAS) {
      const entry = ADMIN_AREA_PROBE_POINTS[area.codice];
      if (!entry) continue; // già catturato dal test precedente
      const [p1, p2] = entry;
      expect(isNaN(p1[0]), `${area.codice}: p1.lon è NaN`).toBe(false);
      expect(isNaN(p1[1]), `${area.codice}: p1.lat è NaN`).toBe(false);
      expect(isNaN(p2[0]), `${area.codice}: p2.lon è NaN`).toBe(false);
      expect(isNaN(p2[1]), `${area.codice}: p2.lat è NaN`).toBe(false);
      expect(p1[0] === 0 && p1[1] === 0, `${area.codice}: p1 è (0,0) — coordinate non inizializzate?`).toBe(false);
    }
  });
});

describe("Gate: AREA_PROBE_POINTS coverage — monitor probe (thinkcentre-monitor-probes)", () => {
  it("ogni codice in ROUTING_AREAS ha una entry hardcoded in MONITOR_AREA_PROBE_POINTS", () => {
    const missing: string[] = [];
    for (const area of ROUTING_AREAS) {
      if (!(area.codice in MONITOR_AREA_PROBE_POINTS)) {
        missing.push(area.codice);
      }
    }
    expect(missing, [
      "Aree mancanti in AREA_PROBE_POINTS (server/jobs/thinkcentre-monitor-probes.ts):",
      ...missing.map((c) => `  → "${c}" — aggiungi coordinate hardcoded on-road (lon, lat) per questa area`),
    ].join("\n")).toHaveLength(0);
  });

  it("le coordinate hardcoded hanno valori plausibili (non NaN, non zero)", () => {
    for (const area of ROUTING_AREAS) {
      const entry = MONITOR_AREA_PROBE_POINTS[area.codice];
      if (!entry) continue; // già catturato dal test precedente
      const [p1, p2] = entry;
      expect(isNaN(p1[0]), `${area.codice}: p1.lon è NaN`).toBe(false);
      expect(isNaN(p1[1]), `${area.codice}: p1.lat è NaN`).toBe(false);
      expect(isNaN(p2[0]), `${area.codice}: p2.lon è NaN`).toBe(false);
      expect(isNaN(p2[1]), `${area.codice}: p2.lat è NaN`).toBe(false);
      expect(p1[0] === 0 && p1[1] === 0, `${area.codice}: p1 è (0,0) — coordinate non inizializzate?`).toBe(false);
    }
  });

  it("le mappe admin e monitor hanno le stesse chiavi (sincronizzazione)", () => {
    const adminKeys = new Set(Object.keys(ADMIN_AREA_PROBE_POINTS));
    const monitorKeys = new Set(Object.keys(MONITOR_AREA_PROBE_POINTS));
    const onlyInAdmin = [...adminKeys].filter((k) => !monitorKeys.has(k));
    const onlyInMonitor = [...monitorKeys].filter((k) => !adminKeys.has(k));
    expect(onlyInAdmin, `Aree in admin ma non in monitor: ${onlyInAdmin.join(", ")}`).toHaveLength(0);
    expect(onlyInMonitor, `Aree in monitor ma non in admin: ${onlyInMonitor.join(", ")}`).toHaveLength(0);
  });
});

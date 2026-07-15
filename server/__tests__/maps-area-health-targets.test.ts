import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before the unit-under-test import.
//
// `areaEngineTargets` legge `isSelfHosted` / `SELF_HOSTED_BASE_URL` (binding
// import dal graphhopper-client) e lo stato del routing ad aree
// (`getRoutingAreaMode` / `getAreaEnabledMap`). Tutti questi sono mockati: i
// getter su un oggetto hoisted permettono di variare il gate self-hosted tra
// un test e l'altro mantenendo le live-binding ES corrette.
// ---------------------------------------------------------------------------

const ghState = vi.hoisted(() => ({
  isSelfHosted: true,
  baseUrl: "https://gh.example.org",
}));

const stateMocks = vi.hoisted(() => ({
  getRoutingAreaMode: vi.fn(),
  getAreaEnabledMap: vi.fn(),
}));

vi.mock("../graphhopper-client", () => ({
  get isSelfHosted() {
    return ghState.isSelfHosted;
  },
  get SELF_HOSTED_BASE_URL() {
    return ghState.baseUrl;
  },
}));

vi.mock("../routing/routing-area-mode", () => ({
  getRoutingAreaMode: stateMocks.getRoutingAreaMode,
}));

vi.mock("../routing/routing-area-state", () => ({
  getAreaEnabledMap: stateMocks.getAreaEnabledMap,
}));

// cfAccessHeaders() reads real CF_ACCESS_CLIENT_ID/SECRET secrets from the
// environment; mocked to a deterministic empty object so these tests don't
// depend on (or ever print) real secret values.
vi.mock("../lib/cf-access", () => ({
  cfAccessHeaders: () => ({}),
}));

import { areaEngineTargets } from "../ai/watchdog/maps-health-checks";
import {
  ROUTING_AREAS,
  routingAreaUrl,
  type RoutingAreaCode,
} from "@shared/routing-areas";

function enabledMap(
  overrides: Partial<Record<RoutingAreaCode, boolean>> = {},
): Record<string, boolean> {
  const base: Record<string, boolean> = {};
  for (const a of ROUTING_AREAS) base[a.codice] = false;
  return { ...base, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  ghState.isSelfHosted = true;
  ghState.baseUrl = "https://gh.example.org";
  delete process.env.GRAPHHOPPER_TOKEN;
  stateMocks.getRoutingAreaMode.mockResolvedValue("enabled");
  stateMocks.getAreaEnabledMap.mockResolvedValue(enabledMap());
});

describe("areaEngineTargets — gate self-hosted / master toggle", () => {
  it("returns no targets when not self-hosted", async () => {
    ghState.isSelfHosted = false;
    const targets = await areaEngineTargets();
    expect(targets).toEqual([]);
    // gate corto-circuita prima di leggere mode/enabledMap
    expect(stateMocks.getRoutingAreaMode).not.toHaveBeenCalled();
    expect(stateMocks.getAreaEnabledMap).not.toHaveBeenCalled();
  });

  it("returns no targets when the self-hosted base URL is empty", async () => {
    ghState.baseUrl = "";
    const targets = await areaEngineTargets();
    expect(targets).toEqual([]);
    expect(stateMocks.getRoutingAreaMode).not.toHaveBeenCalled();
  });

  it("returns no targets when mode === 'disabled'", async () => {
    stateMocks.getRoutingAreaMode.mockResolvedValue("disabled");
    stateMocks.getAreaEnabledMap.mockResolvedValue(
      enabledMap({ grecia: true }),
    );
    const targets = await areaEngineTargets();
    expect(targets).toEqual([]);
    // il corto-circuito su "disabled" evita di leggere la mappa abilitati
    expect(stateMocks.getAreaEnabledMap).not.toHaveBeenCalled();
  });

  it("returns no targets when getRoutingAreaMode rejects", async () => {
    stateMocks.getRoutingAreaMode.mockRejectedValue(new Error("db down"));
    const targets = await areaEngineTargets();
    expect(targets).toEqual([]);
    expect(stateMocks.getAreaEnabledMap).not.toHaveBeenCalled();
  });

  it("returns no targets when getAreaEnabledMap rejects", async () => {
    stateMocks.getAreaEnabledMap.mockRejectedValue(new Error("db down"));
    const targets = await areaEngineTargets();
    expect(targets).toEqual([]);
  });
});

describe("areaEngineTargets — one target per enabled area", () => {
  it("emits a target only for enabled areas with id area-<codice> and /health URL", async () => {
    stateMocks.getAreaEnabledMap.mockResolvedValue(
      enabledMap({ grecia: true, iberia: true }),
    );
    const targets = await areaEngineTargets();

    expect(targets).toHaveLength(2);
    const grecia = ROUTING_AREAS.find((a) => a.codice === "grecia")!;
    const iberia = ROUTING_AREAS.find((a) => a.codice === "iberia")!;
    expect(targets).toEqual([
      {
        kind: "engine",
        id: "area-grecia",
        url: `${routingAreaUrl(grecia, ghState.baseUrl)}/health`,
        headers: {},
      },
      {
        kind: "engine",
        id: "area-iberia",
        url: `${routingAreaUrl(iberia, ghState.baseUrl)}/health`,
        headers: {},
      },
    ]);
    // l'URL deve risolversi a <base>/areas/<codice>/health
    expect(targets[0].url).toBe(
      "https://gh.example.org/areas/grecia/health",
    );
  });

  it("returns no targets when no area is enabled (mode active)", async () => {
    stateMocks.getAreaEnabledMap.mockResolvedValue(enabledMap());
    const targets = await areaEngineTargets();
    expect(targets).toEqual([]);
  });

  it("works under mode === 'tester' (not disabled)", async () => {
    stateMocks.getRoutingAreaMode.mockResolvedValue("tester");
    stateMocks.getAreaEnabledMap.mockResolvedValue(
      enabledMap({ balcani: true }),
    );
    const targets = await areaEngineTargets();
    expect(targets.map((t) => t.id)).toEqual(["area-balcani"]);
  });

  it("attaches the X-GH-Token header when GRAPHHOPPER_TOKEN is set", async () => {
    process.env.GRAPHHOPPER_TOKEN = "secret-token";
    stateMocks.getAreaEnabledMap.mockResolvedValue(
      enabledMap({ grecia: true }),
    );
    const targets = await areaEngineTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].headers).toEqual({ "X-GH-Token": "secret-token" });
  });
});

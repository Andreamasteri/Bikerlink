import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HealthCheckResult } from "../ai/watchdog/maps-health-checks";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before the unit-under-test import.
//
// `areaHealthSummary` consuma i risultati cache-ati di `runMapsHealthChecks`,
// filtra gli id `area-*` e li rimappa a { code, ok, latencyMs, error }. Mockiamo
// solo quella funzione; `storage`/`graphhopper-client` sono mockati per evitare
// side-effect d'import (pool DB) della catena del router admin.
// ---------------------------------------------------------------------------

const healthMocks = vi.hoisted(() => ({ runMapsHealthChecks: vi.fn() }));

vi.mock("../ai/watchdog/maps-health-checks", () => ({
  runMapsHealthChecks: healthMocks.runMapsHealthChecks,
}));

vi.mock("../storage", () => ({ storage: {} }));

vi.mock("../graphhopper-client", () => ({
  isSelfHosted: true,
  SELF_HOSTED_BASE_URL: "https://gh.example.org",
}));

import { areaHealthSummary } from "../routes/admin/routing-areas/index";

function result(over: Partial<HealthCheckResult>): HealthCheckResult {
  return {
    kind: "engine",
    id: "graphhopper",
    url: "https://gh.example.org/health",
    ok: true,
    latencyMs: 12,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("areaHealthSummary — mapping dei risultati area-*", () => {
  it("maps area-* results to { code, ok, latencyMs, error } and ignores non-area ids", async () => {
    healthMocks.runMapsHealthChecks.mockResolvedValue([
      result({ id: "carto-light", kind: "tile" }),
      result({ id: "graphhopper" }),
      result({ id: "area-grecia", ok: true, latencyMs: 42 }),
      result({
        id: "area-iberia",
        ok: false,
        latencyMs: null,
        error: "timeout",
      }),
    ]);

    const summary = await areaHealthSummary();

    expect(summary).toEqual([
      { code: "grecia", ok: true, latencyMs: 42, error: null },
      { code: "iberia", ok: false, latencyMs: null, error: "timeout" },
    ]);
  });

  it("normalises a missing error to null", async () => {
    healthMocks.runMapsHealthChecks.mockResolvedValue([
      result({ id: "area-balcani", ok: true, latencyMs: 7 }),
    ]);

    const summary = await areaHealthSummary();

    expect(summary).toEqual([
      { code: "balcani", ok: true, latencyMs: 7, error: null },
    ]);
  });

  it("returns an empty array when there are no area-* results", async () => {
    healthMocks.runMapsHealthChecks.mockResolvedValue([
      result({ id: "graphhopper" }),
      result({ id: "osm-standard", kind: "tile" }),
    ]);

    const summary = await areaHealthSummary();
    expect(summary).toEqual([]);
  });

  it("returns an empty array when runMapsHealthChecks rejects", async () => {
    healthMocks.runMapsHealthChecks.mockRejectedValue(new Error("boom"));
    const summary = await areaHealthSummary();
    expect(summary).toEqual([]);
  });
});

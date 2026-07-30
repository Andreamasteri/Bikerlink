/**
 * Task #159 — GH falso-offline (404) su ThinkCentre multi-area.
 *
 * Sul setup multi-area NON esiste /health o /info alla root: ogni istanza
 * risponde su /areas/<code>/info. Regressione: la sonda getServerInfo deve
 * ritornare ok quando almeno un'area risponde 200, anche se la root dà 404,
 * e riportare areasOnline/areasTotal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ROUTING_AREAS } from "@shared/routing-areas";

vi.mock("../routing/routing-kill-switch", () => ({
  isRoutingEnabled: async () => true,
}));

const ORIGINAL_ENV = { ...process.env };

describe("getServerInfo — sonda multi-area (Task #159)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GRAPHHOPPER_URL = "https://gh.test.local";
    process.env.GRAPHHOPPER_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("ritorna ok:true quando la root dà 404 ma /areas/grecia/info risponde 200", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/areas/grecia/info")) {
        return new Response(JSON.stringify({ version: "12.0", profiles: ["motorcycle"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // root /health, root /info e tutte le altre aree → 404 (setup multi-area)
      return new Response("<html>404 Not Found</html>", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getServerInfo } = await import("../graphhopper-client");
    const info = await getServerInfo();

    expect(info.status).toBe("ok");
    expect(info.graph_loaded).toBe(true);
    expect(info.areasOnline).toBe(1);
    expect(info.areasTotal).toBe(ROUTING_AREAS.length);
    // La sonda non deve MAI colpire /health o /info alla root.
    const rootProbes = fetchMock.mock.calls.filter(([u]) => {
      const url = String(u);
      return url === "https://gh.test.local/health" || url === "https://gh.test.local/info";
    });
    expect(rootProbes).toHaveLength(0);
  });


  it("seleziona l'istanza regionale per il map matching", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      paths: [{ details: { osm_way_id: [[0, 1, 123]] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { mapMatch } = await import("../graphhopper-client");
    await mapMatch([
      { lat: 45.44, lon: 12.33 },
      { lat: 45.45, lon: 12.34 },
    ]);

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://gh.test.local/areas/arco-alpino/match",
    );
  });

  it("ritorna status error e areasOnline:0 quando nessuna area risponde", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));

    const { getServerInfo } = await import("../graphhopper-client");
    const info = await getServerInfo();

    expect(info.status).toBe("error");
    expect(info.areasOnline).toBe(0);
    expect(info.areasTotal).toBe(ROUTING_AREAS.length);
  });

  it("conta tutte le aree online quando rispondono tutte", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/areas\/[a-z-]+\/info$/.test(url)) {
        return new Response(JSON.stringify({ version: "12.0" }), { status: 200 });
      }
      return new Response("404", { status: 404 });
    }));

    const { getServerInfo } = await import("../graphhopper-client");
    const info = await getServerInfo();

    expect(info.status).toBe("ok");
    expect(info.areasOnline).toBe(ROUTING_AREAS.length);
    expect(info.areasTotal).toBe(ROUTING_AREAS.length);
  });
});

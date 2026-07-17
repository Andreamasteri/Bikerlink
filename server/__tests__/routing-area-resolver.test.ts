// Task #413 — Test: candidateCodesPerPointJs (fallback puro-JS) e degradazione
// automatica da PostGIS al JS quando il DB lancia un errore SQLSTATE.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stable mock refs (hoisted prima di vi.mock, come richiesto da vitest)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  getAreaEnabledMap: vi.fn(),
}));

vi.mock("../db", () => ({
  db: { execute: mocks.dbExecute },
}));

// Mock dipendenze che resolveRoutingArea chiama ma non sono oggetto di test qui.
vi.mock("../routing/routing-area-state", () => ({
  getAreaEnabledMap: mocks.getAreaEnabledMap,
}));
vi.mock("../graphhopper-client", () => ({
  isSelfHosted: false,
  SELF_HOSTED_BASE_URL: null,
}));

import {
  candidateCodesPerPointJs,
  resolveRoutingArea,
} from "../routing/routing-area-resolver";

// ---------------------------------------------------------------------------
// Coordinate di test ben note rispetto ai bbox del registro ROUTING_AREAS
// ---------------------------------------------------------------------------
//
// arco-alpino: minLon: 5.9  maxLon: 18.6  minLat: 35.4  maxLat: 49.0
//   → Milano   lon=9.19  lat=45.46  ✓ dentro
//   → Roma     lon=12.49 lat=41.90  ✓ dentro
//
// grecia:      minLon: 19.2 maxLon: 28.3  minLat: 34.8  maxLat: 42.7
//   → Atene    lon=23.72 lat=37.97  ✓ dentro
//
// Oceano Atlantico (lon=-30 lat=30) → fuori da tutti i gruppi

const MILAN: [number, number] = [9.19, 45.4642];
const ATHENS: [number, number] = [23.72, 37.97];
const ATLANTIC: [number, number] = [-30.0, 30.0];

// Errore SQLSTATE che simula PostGIS non disponibile (42883 = function not found)
function makePostgisError(sqlState = "42883"): Error & { code: string; severity: string } {
  const err = new Error("function st_contains(geometry, geometry) does not exist") as Error & {
    code: string;
    severity: string;
  };
  err.code = sqlState;
  err.severity = "ERROR";
  return err;
}

// ---------------------------------------------------------------------------
// candidateCodesPerPointJs — check bbox puro-JS
// ---------------------------------------------------------------------------
describe("candidateCodesPerPointJs", () => {
  it("restituisce i codici corretti per un punto dentro arco-alpino", () => {
    const result = candidateCodesPerPointJs([MILAN]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("arco-alpino");
  });

  it("restituisce i codici corretti per un punto dentro grecia", () => {
    const result = candidateCodesPerPointJs([ATHENS]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("grecia");
    expect(result[0]).not.toContain("arco-alpino");
  });

  it("restituisce un array vuoto per un punto fuori da tutti i gruppi", () => {
    const result = candidateCodesPerPointJs([ATLANTIC]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(0);
  });

  it("gestisce più punti in parallelo correttamente", () => {
    const result = candidateCodesPerPointJs([MILAN, ATHENS, ATLANTIC]);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain("arco-alpino");
    expect(result[1]).toContain("grecia");
    expect(result[2]).toHaveLength(0);
  });

  it("restituisce i codici nello stesso ordine di ROUTING_AREAS (più stretto prima)", () => {
    // grecia è definita prima di balcani nel registro; un punto in grecia deve
    // avere "grecia" prima di eventuali aree sovrapposte.
    const result = candidateCodesPerPointJs([ATHENS]);
    const codes = result[0];
    expect(codes.length).toBeGreaterThan(0);
    expect(codes[0]).toBe("grecia");
  });
});

// ---------------------------------------------------------------------------
// resolveRoutingArea — fallback automatico PostGIS → JS
// ---------------------------------------------------------------------------
describe("resolveRoutingArea — fallback PostGIS → JS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Di default: tutte le aree disabilitate → resolveRoutingArea ritorna
    // area_not_enabled, ma confermiamo che il candidateCodesPerPoint ha usato il JS.
    mocks.getAreaEnabledMap.mockResolvedValue({});
  });

  it("usa il fallback JS e non lancia quando PostGIS non è disponibile (42883)", async () => {
    // Il DB lancia l'errore PostGIS "function not found"
    mocks.dbExecute.mockRejectedValue(makePostgisError("42883"));

    // Non deve lanciare: il fallback JS prende il controllo
    await expect(resolveRoutingArea([MILAN])).resolves.toBeDefined();
    // Il DB è stato chiamato una sola volta (tentativo PostGIS)
    expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
  });

  it("usa il fallback JS per errore 42846 (cannot cast type record)", async () => {
    mocks.dbExecute.mockRejectedValue(makePostgisError("42846"));
    await expect(resolveRoutingArea([MILAN])).resolves.toBeDefined();
  });

  it("usa il fallback JS per qualsiasi errore con severity ERROR dal driver pg", async () => {
    const err = Object.assign(new Error("PostGIS type geometry not found"), {
      code: "42704",
      severity: "ERROR",
    });
    mocks.dbExecute.mockRejectedValue(err);
    await expect(resolveRoutingArea([MILAN])).resolves.toBeDefined();
  });

  it("NON usa il fallback JS e propaga un errore non-SQL (es. connessione persa)", async () => {
    // Un errore senza proprietà .code SQLSTATE non è un errore DB driver
    const netErr = new Error("connect ECONNREFUSED");
    mocks.dbExecute.mockRejectedValue(netErr);
    await expect(resolveRoutingArea([MILAN])).rejects.toThrow("connect ECONNREFUSED");
  });

  it("con fallback JS + punto fuori da tutti i gruppi → area_not_enabled null", async () => {
    mocks.dbExecute.mockRejectedValue(makePostgisError("42883"));
    const result = await resolveRoutingArea([ATLANTIC]);
    expect(result.kind).toBe("area_not_enabled");
    expect((result as { kind: string; area: unknown }).area).toBeNull();
  });

  it("con fallback JS + PostGIS OK → usa risultato PostGIS (nessun fallback)", async () => {
    // Il DB risponde correttamente (Milano → arco-alpino, punto_index=1)
    mocks.dbExecute.mockResolvedValue({
      rows: [{ point_index: 1, code: "arco-alpino" }],
    });
    const result = await resolveRoutingArea([MILAN]);
    // isSelfHosted=false → area_not_enabled, ma il candidateCodesPerPoint ha funzionato
    expect(result.kind).toBe("area_not_enabled");
    expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
  });
});

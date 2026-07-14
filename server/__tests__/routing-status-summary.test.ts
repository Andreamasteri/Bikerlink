import { describe, it, expect } from "vitest";
import { formatRoutingStatusSummary } from "../ai/watchdog/routing-status-summary";
import type { CorrectnessProbeResult } from "../ai/watchdog/routing-correctness-probes";
import type { Problem } from "../ai/watchdog/types";

// ---------------------------------------------------------------------------
// Task #25 — Alla domanda admin "come sta andando il routing?", Horus riceve un
// riepilogo LIVE dei 3 motori (GraphHopper, Valhalla, Photon) + pipeline + i
// problemi routing attivi. Verifichiamo che il formatter produca una risposta
// basata sui DATI (stato per motore + problemi), non generica.
// ---------------------------------------------------------------------------

function probe(p: Partial<CorrectnessProbeResult> & Pick<CorrectnessProbeResult, "engine">): CorrectnessProbeResult {
  return {
    configured: true, reachable: true, plausible: true, ok: true, skipped: false,
    latencyMs: null, distanceKm: null, durationMin: null, reason: null, severity: "info",
    ...p,
  };
}

describe("routing status summary (Task #25)", () => {
  it("mostra lo stato per ciascun motore con i dati reali", () => {
    const probes: CorrectnessProbeResult[] = [
      probe({ engine: "graphhopper", ok: true, latencyMs: 120, distanceKm: 480, durationMin: 300 }),
      probe({ engine: "valhalla", ok: false, plausible: false, latencyMs: 90, reason: "implausible_short", severity: "critical" }),
      probe({ engine: "photon", configured: false }),
      probe({ engine: "pipeline", ok: true }),
    ];
    const summary = formatRoutingStatusSummary(probes, []);

    expect(summary).toContain("GraphHopper");
    expect(summary).toContain("OK");
    expect(summary).toContain("480km");
    expect(summary).toContain("Valhalla");
    expect(summary).toContain("KO");
    expect(summary).toContain("implausible_short");
    // Non configurato riportato esplicitamente (mai inventato).
    expect(summary).toContain("Photon");
    expect(summary).toContain("non configurato");
  });

  it("elenca i problemi routing/geocoding attivi dallo snapshot", () => {
    const problems: Problem[] = [
      { id: "horus.routing.valhalla.correct", severity: "critical", source: "horus", title: "Routing valhalla: correttezza KO" },
      { id: "db.ping", severity: "high", source: "db", title: "DB ping lento" },
    ];
    const summary = formatRoutingStatusSummary([], problems);
    expect(summary).toContain("Problemi routing/geocoding attivi (1)");
    expect(summary).toContain("Routing valhalla: correttezza KO");
    // I problemi non-routing non vengono mescolati.
    expect(summary).not.toContain("DB ping");
  });

  it("dice esplicitamente quando non ci sono problemi routing", () => {
    const summary = formatRoutingStatusSummary(
      [probe({ engine: "graphhopper" }), probe({ engine: "valhalla" })],
      [{ id: "db.ping", severity: "high", source: "db", title: "DB ping lento" }],
    );
    expect(summary).toContain("Nessun problema di routing/geocoding attivo");
  });
});

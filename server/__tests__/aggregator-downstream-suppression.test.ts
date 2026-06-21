/**
 * Aggregator — confini della soppressione allarmi a valle (ThinkCentre spento).
 *
 * suppressDownstreamWhenPoweredOff() retrocede a "warn" SOLO i problemi che sono
 * conseguenza diretta del ThinkCentre offline (Redis self-hosted, backlog
 * map-matching, routing engine self-hosted, pressione del pool, instabilità di
 * rete gonfiata dai self-hosted giù, DB ping lento per job map-matching a vuoto),
 * lasciandoli comunque visibili in dashboard. Gli allarmi indipendenti (engine
 * cloud, tile CDN, DB realmente giù) NON devono essere toccati, così restano
 * azionabili anche mentre il ThinkCentre è spento.
 *
 * Verifica anche che, una volta declassato a "warn", un problema downstream non
 * scateni più il path di push dedicato in alerts.ts (gate sulla severity).
 */
import { describe, it, expect } from "vitest";
import { suppressDownstreamWhenPoweredOff } from "../ai/watchdog/aggregator";
import type { Problem, Severity, SignalSource } from "../ai/watchdog/types";

function prob(
  id: string,
  severity: Severity,
  source: SignalSource = "maps",
): Problem {
  return { id, severity, source, title: `problema ${id}` };
}

describe("suppressDownstreamWhenPoweredOff — problemi a valle", () => {
  it("retrocede a warn i problemi downstream critical/high del ThinkCentre", () => {
    const input: Problem[] = [
      prob("redis.redis.unreachable", "critical", "redis"),
      prob("maps.matching.pending", "high", "maps"),
      prob("maps.routing.engine_down.graphhopper", "critical", "maps"),
      prob("maps.routing.engine_down.valhalla", "high", "maps"),
      prob("db.db.pool.waiting", "critical", "db"),
      prob("db.db.ping_saturated", "high", "db"),
      prob("db.db.bg_limiter.queued", "high", "db"),
      // Aggiunti: conseguenza del TC spento (self-hosted giù → contatore rete alto;
      // job map-matching a vuoto → pool saturo → ping lento).
      prob("maps.health.network_instability", "high", "maps"),
      prob("db.db.ping_ms", "high", "db"),
    ];

    const out = suppressDownstreamWhenPoweredOff(input);

    expect(out.every((p) => p.severity === "warn")).toBe(true);
    // Restano VISIBILI (stesso numero di problemi, nessuno rimosso).
    expect(out).toHaveLength(input.length);
    // Il titolo segnala la soppressione per trasparenza in dashboard.
    expect(out.every((p) => p.title.includes("soppresso"))).toBe(true);
  });

  it("NON tocca gli allarmi indipendenti dal ThinkCentre", () => {
    const independent: Problem[] = [
      // Engine cloud: un loro down è indipendente dal ThinkCentre.
      prob("maps.routing.engine_down.mapbox", "critical", "maps"),
      prob("maps.routing.engine_down.tomtom", "high", "maps"),
      prob("maps.health.engine.mapbox", "high", "maps"),
      // Tile CDN pubblici.
      prob("maps.health.tile.osm-standard", "high", "maps"),
      // DB realmente giù — sempre azionabile indipendentemente dal TC.
      prob("db.db.circuit_breaker", "critical", "db"),
    ];

    const out = suppressDownstreamWhenPoweredOff(independent);

    // Severity invariate, titoli invariati.
    expect(out.map((p) => p.severity)).toEqual(independent.map((p) => p.severity));
    expect(out.every((p) => !p.title.includes("soppresso"))).toBe(true);
  });

  it("non declassa i problemi downstream con severity warn/info (già non escalati)", () => {
    const input: Problem[] = [
      prob("maps.matching.pending", "warn", "maps"),
      prob("db.db.pool.waiting", "info", "db"),
    ];

    const out = suppressDownstreamWhenPoweredOff(input);

    expect(out.map((p) => p.severity)).toEqual(["warn", "info"]);
    expect(out.every((p) => !p.title.includes("soppresso"))).toBe(true);
  });

  it("un problema downstream soppresso scende sotto la soglia di push dedicata", () => {
    // alerts.ts emette il push dedicato network_instability solo se high/critical.
    // Ora network_instability È downstream (soppresso con TC spento), quindi il
    // gate severity in alerts.ts lo blocca automaticamente. Qui lo verifichiamo
    // con graphhopper (stessa logica di declassamento).
    const downstream = prob("maps.routing.engine_down.graphhopper", "critical", "maps");
    const [suppressed] = suppressDownstreamWhenPoweredOff([downstream]);

    const wouldPush =
      suppressed.severity === "high" || suppressed.severity === "critical";
    expect(wouldPush).toBe(false);
  });
});

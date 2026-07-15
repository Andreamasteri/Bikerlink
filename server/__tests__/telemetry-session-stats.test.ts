import { describe, it, expect, vi } from "vitest";

// Il modulo importa `../db` a livello di modulo: mockiamo per evitare una
// connessione reale (qui testiamo solo il nucleo PURO del calcolo).
vi.mock("../db", () => ({
  db: { execute: vi.fn() },
  pool: {},
  withDbRetry: (fn: () => unknown) => fn(),
}));

import { computeSessionStatsDelta } from "../lib/telemetry-session-stats";
import type { InsertRideTelemetry } from "@shared/db";

function sample(ts: number, lat: number | null, lon: number | null, speedKmh: number | null): InsertRideTelemetry {
  return { userId: "u", sessionId: "s", sessionType: "ride", ts, lat, lon, speedKmh };
}

// Percorso deterministico: piccoli passi in latitudine (segmenti validi),
// con un campione sensor-only, un salto GPS (> 0.5°, da escludere) e velocità
// sotto/sopra la soglia dei 20 km/h.
function buildPath(): InsertRideTelemetry[] {
  return [
    sample(1000, 45.00, 9.0, 50),   // primo campione: nessun segmento
    sample(2000, 45.02, 9.0, 50),   // +0.02° lat, speed>=20 → all + filtered
    sample(3000, 45.04, 9.0, 10),   // +0.02° lat, speed<20  → solo all
    sample(4000, null, null, null), // sensor-only: rompe la catena, anchor→null
    sample(5000, 45.06, 9.0, 80),   // anchor era null → nessun segmento
    sample(6000, 45.08, 9.0, null), // +0.02° lat, speed null → all + filtered
    sample(7000, 46.00, 9.0, 90),   // salto +0.92° lat (>0.5) → escluso da tutto
    sample(8000, 46.02, 9.0, 90),   // +0.02° lat da 46.00 → all + filtered
  ];
}

describe("computeSessionStatsDelta — incremental telemetry distance core", () => {
  it("sanity: distanza Haversine di 0.1° di latitudine ≈ 11.12 km", () => {
    const d = computeSessionStatsDelta(null, null, [
      sample(1, 45.0, 9.0, 100),
      sample(2, 45.1, 9.0, 100),
    ]);
    expect(d.deltaAll).toBeCloseTo(11.1195, 2);
    expect(d.deltaSpeedFiltered).toBeCloseTo(11.1195, 2);
  });

  it("applica il filtro velocità (>=20 o null) e scarta i salti GPS (|Δ| >= 0.5)", () => {
    const d = computeSessionStatsDelta(null, null, buildPath());
    // Segmenti validi in `all`: 45.00→45.02, 45.02→45.04, 45.06→45.08, 46.00→46.02
    // = 4 × ~0.02° ≈ 4 × 2.2239 km. Il segmento 45.04→(null) e (null)→45.06 e il
    // salto 45.08→46.00 sono esclusi.
    const seg = 2.2239; // 0.02° lat
    expect(d.deltaAll).toBeCloseTo(seg * 4, 2);
    // In `filtered` il segmento 45.02→45.04 (speed 10 <20) è escluso → 3 segmenti.
    expect(d.deltaSpeedFiltered).toBeCloseTo(seg * 3, 2);
    expect(d.sensorOnly).toBe(1);
    expect(d.sampleCount).toBe(8);
    expect(d.lastLat).toBe(46.02);
    expect(d.lastTs).toBe(8000);
  });

  it("incrementale == ricalcolo completo: split in due batch con anchor riportato", () => {
    const all = buildPath();
    const full = computeSessionStatsDelta(null, null, all);

    for (const k of [1, 2, 3, 4, 5, 6, 7]) {
      const b1 = all.slice(0, k);
      const b2 = all.slice(k);
      const d1 = computeSessionStatsDelta(null, null, b1);
      const d2 = computeSessionStatsDelta(d1.lastLat, d1.lastLon, b2);

      expect(d1.deltaAll + d2.deltaAll).toBeCloseTo(full.deltaAll, 9);
      expect(d1.deltaSpeedFiltered + d2.deltaSpeedFiltered).toBeCloseTo(full.deltaSpeedFiltered, 9);
      expect(d1.sensorOnly + d2.sensorOnly).toBe(full.sensorOnly);
      expect(d1.sampleCount + d2.sampleCount).toBe(full.sampleCount);
      expect(d2.lastLat).toBe(full.lastLat);
      expect(d2.lastTs).toBe(full.lastTs);
    }
  });

  it("ordina per ts anche se il batch arriva fuori ordine", () => {
    const ordered = computeSessionStatsDelta(null, null, [
      sample(1000, 45.0, 9.0, 100),
      sample(2000, 45.1, 9.0, 100),
    ]);
    const shuffled = computeSessionStatsDelta(null, null, [
      sample(2000, 45.1, 9.0, 100),
      sample(1000, 45.0, 9.0, 100),
    ]);
    expect(shuffled.deltaAll).toBeCloseTo(ordered.deltaAll, 9);
    expect(shuffled.lastTs).toBe(2000);
    expect(shuffled.lastLat).toBe(45.1);
  });
});

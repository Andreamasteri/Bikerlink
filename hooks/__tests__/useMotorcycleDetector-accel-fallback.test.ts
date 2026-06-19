/**
 * Test del fallback accelerometro in useMotorcycleDetector.
 *
 * Comportamenti blindati:
 * (a) computeAccelSpread — calcolo MAD corretto
 * (b) accelFallbackTick: spread > soglia sostenuto ≥ FALLBACK_START_DURATION_MS → isRiding=true
 * (c) accelFallbackTick: stillness sostenuta > FALLBACK_STOP_DURATION_MS → isRiding=false
 * (d) stillness interrotta prima del timeout → belowStopAt resettato, stop annullato
 * (e) motion interrotta prima del timeout → aboveStartAt resettato, start annullato
 * (f) window < 2 campioni → spread = 0, isRiding resta false
 *
 * Strategia: si importano le FUNZIONI PURE DI PRODUZIONE esportate da
 * useMotorcycleDetector (`computeAccelSpread`, `accelFallbackTick`, costanti).
 * La produzione chiama `accelFallbackTick` dentro setInterval; questi test
 * la chiamano direttamente con window e clock controllati — nessuna replica
 * locale della logica.
 */

import { describe, it, expect, vi } from "vitest";

// ── mock: dipendenze native necessarie per caricare il modulo ─────────────────
vi.mock("expo-location", () => ({
  watchPositionAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(async () => ({ status: "denied" })),
  Accuracy: { Balanced: 3 },
}));
vi.mock("expo-sensors", () => ({
  Accelerometer: { addListener: vi.fn(() => ({ remove: vi.fn() })), setUpdateInterval: vi.fn() },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock("@/components/MountCalibWizard", () => ({
  loadMountCalibration: vi.fn(async () => null),
}));

// ── import delle funzioni PURE DI PRODUZIONE ─────────────────────────────────
import {
  computeAccelSpread,
  accelFallbackTick,
  type AccelFallbackState,
  ACCEL_VARIANCE_THRESHOLD,
  ACCEL_FALLBACK_WINDOW_SIZE,
  ACCEL_FALLBACK_START_MS,
  ACCEL_FALLBACK_STOP_MS,
  ACCEL_FALLBACK_INTERVAL_MS,
} from "@/hooks/useMotorcycleDetector";

// ─── Helper: simula N tick con la stessa magnitudo ────────────────────────────
// Usa accelFallbackTick (produzione) per propagare lo stato tick per tick.
// Il magWindow è aggiornato esattamente come fa startAccelFallback in produzione.
function runProductionTicks(
  mags: number[],
  startMs: number,
): boolean[] {
  const magWindow: number[] = [];
  let state: AccelFallbackState = { isRiding: false, aboveStartAt: null, belowStopAt: null };
  const results: boolean[] = [];

  for (let i = 0; i < mags.length; i++) {
    magWindow.push(mags[i]);
    if (magWindow.length > ACCEL_FALLBACK_WINDOW_SIZE) magWindow.shift();
    const now = startMs + i * ACCEL_FALLBACK_INTERVAL_MS;
    state = accelFallbackTick(state, magWindow, now);
    results.push(state.isRiding);
  }

  return results;
}

// Genera array di N mag alternando HIGH_MAG_A e HIGH_MAG_B (spread ≈ 0.5 > 0.3)
const HIGH_MAG_A = 0.5;
const HIGH_MAG_B = 1.5;
function motionMags(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? HIGH_MAG_A : HIGH_MAG_B));
}
// Genera array di N mag costante (no variance → fermo)
function stillMags(n: number, mag = 1.0): number[] {
  return Array.from({ length: n }, () => mag);
}

// ─── (a) computeAccelSpread — MAD corretto ────────────────────────────────────

describe("computeAccelSpread — (a) calcolo MAD corretto", () => {
  it("window vuota → 0", () => {
    expect(computeAccelSpread([])).toBe(0);
  });

  it("window con 1 elemento → 0 (non abbastanza dati)", () => {
    expect(computeAccelSpread([1.0])).toBe(0);
  });

  it("valori identici → spread = 0 (fermo su 1 g)", () => {
    expect(computeAccelSpread([1, 1, 1, 1, 1, 1])).toBe(0);
  });

  it("0.5/1.5 alternati: spread = 0.5 > ACCEL_VARIANCE_THRESHOLD", () => {
    const spread = computeAccelSpread([0.5, 1.5, 0.5, 1.5, 0.5, 1.5]);
    expect(spread).toBeGreaterThan(ACCEL_VARIANCE_THRESHOLD);
  });

  it("jitter minimo → spread < ACCEL_VARIANCE_THRESHOLD", () => {
    const spread = computeAccelSpread([0.99, 1.00, 0.99, 1.01, 1.00, 0.99]);
    expect(spread).toBeLessThan(ACCEL_VARIANCE_THRESHOLD);
  });
});

// ── contratti valore costanti ─────────────────────────────────────────────────

describe("costanti del fallback — contratto valore", () => {
  it("ACCEL_VARIANCE_THRESHOLD vale 0.3 g", () => expect(ACCEL_VARIANCE_THRESHOLD).toBe(0.3));
  it("ACCEL_FALLBACK_WINDOW_SIZE vale 6",   () => expect(ACCEL_FALLBACK_WINDOW_SIZE).toBe(6));
  it("ACCEL_FALLBACK_START_MS vale 3000",   () => expect(ACCEL_FALLBACK_START_MS).toBe(3000));
  it("ACCEL_FALLBACK_STOP_MS vale 60000",   () => expect(ACCEL_FALLBACK_STOP_MS).toBe(60_000));
  it("ACCEL_FALLBACK_INTERVAL_MS vale 500", () => expect(ACCEL_FALLBACK_INTERVAL_MS).toBe(500));
});

// ─── accelFallbackTick — comportamento del singolo tick ───────────────────────

describe("accelFallbackTick — transizioni elementari", () => {
  const idle: AccelFallbackState = { isRiding: false, aboveStartAt: null, belowStopAt: null };

  it("primo tick con window=[0.5]: spread=0 (< 2 elementi) → stato invariato", () => {
    const next = accelFallbackTick(idle, [0.5], 1000);
    expect(next.isRiding).toBe(false);
    expect(next.aboveStartAt).toBeNull();
  });

  it("moving = true: imposta aboveStartAt se era null", () => {
    const window = [0.5, 1.5, 0.5, 1.5, 0.5, 1.5]; // spread > 0.3
    const next = accelFallbackTick(idle, window, 2000);
    expect(next.isRiding).toBe(false);
    expect(next.aboveStartAt).toBe(2000);
  });

  it("moving = false mentre fermo: azzera aboveStartAt", () => {
    const prev: AccelFallbackState = { isRiding: false, aboveStartAt: 1000, belowStopAt: null };
    const next = accelFallbackTick(prev, [1.0, 1.0, 1.0, 1.0], 1500);
    expect(next.aboveStartAt).toBeNull();
  });

  it("moving = false mentre riding: imposta belowStopAt se era null", () => {
    const riding: AccelFallbackState = { isRiding: true, aboveStartAt: null, belowStopAt: null };
    const next = accelFallbackTick(riding, [1.0, 1.0, 1.0, 1.0], 5000);
    expect(next.isRiding).toBe(true);   // non ancora fermato
    expect(next.belowStopAt).toBe(5000);
  });

  it("non muta l'input (pura)", () => {
    const before = { ...idle };
    accelFallbackTick(idle, [0.5, 1.5, 0.5], 1000);
    expect(idle).toEqual(before);
  });
});

// ─── (b) motion sostenuta ≥ START_DURATION → isRiding = true ─────────────────

describe("state machine (produzione) — (b) motion sostenuta → isRiding=true", () => {
  it("motion per ≥ 3s (10 tick × 500ms = 5s) → isRiding alla fine", () => {
    const results = runProductionTicks(motionMags(10), 1000);
    expect(results[results.length - 1]).toBe(true);
  });

  it("isRiding rimane false con solo 2 s di motion (4 tick × 500ms)", () => {
    const results = runProductionTicks(motionMags(4), 1000);
    expect(results.every((r) => r === false)).toBe(true);
  });

  it("transizione fermo → motion sostenuta → isRiding=true", () => {
    const mags = [...stillMags(4), ...motionMags(10)];
    const results = runProductionTicks(mags, 1000);
    expect(results.slice(0, 4).every((r) => r === false)).toBe(true);
    expect(results[results.length - 1]).toBe(true);
  });
});

// ─── (c) stillness sostenuta > STOP_DURATION → isRiding = false ───────────────

describe("state machine (produzione) — (c) stillness sostenuta → isRiding=false", () => {
  it("dopo isRiding=true, stillness > 60s → isRiding=false", () => {
    // 10 tick di motion per raggiungere isRiding=true, poi 126 tick (63 s) di stillness
    const mags = [...motionMags(10), ...stillMags(126)];
    const results = runProductionTicks(mags, 1000);
    expect(results[9]).toBe(true);                      // riding dopo motion
    expect(results[results.length - 1]).toBe(false);    // fermo dopo 63 s
  });

  it("stillness esattamente STOP_DURATION (60000 ms) → isRiding resta true (strettamente >)", () => {
    // 120 tick × 500 ms = 60000 ms: belowStopAt fissato al primo tick fermo,
    // last tick arriva a belowStopAt+59500 < 60000 → NON supera la soglia
    const mags = [...motionMags(10), ...stillMags(120)];
    const results = runProductionTicks(mags, 1000);
    expect(results[results.length - 1]).toBe(true);
  });
});

// ─── (d) stillness interrotta prima del timeout → stop annullato ──────────────

describe("state machine (produzione) — (d) stillness interrotta → belowStopAt resettato", () => {
  it("stillness 30s poi motion: isRiding resta true", () => {
    // motion → riding, poi 60 tick (30 s) di stillness, poi motion di nuovo
    const mags = [...motionMags(10), ...stillMags(60), ...motionMags(4)];
    const results = runProductionTicks(mags, 1000);
    expect(results[results.length - 1]).toBe(true);
  });
});

// ─── (e) motion interrotta prima di START_DURATION → start annullato ─────────

describe("state machine (produzione) — (e) motion interrotta → aboveStartAt resettato", () => {
  it("2s motion poi stillness: isRiding resta false", () => {
    const mags = [...motionMags(4), ...stillMags(4)];
    const results = runProductionTicks(mags, 1000);
    expect(results.every((r) => r === false)).toBe(true);
  });

  it("motion alternata a stillness ogni 1.5s: isRiding non scatta mai", () => {
    const mags: number[] = [];
    for (let i = 0; i < 4; i++) {
      mags.push(...motionMags(3)); // 1.5 s di motion
      mags.push(...stillMags(3)); // 1.5 s di stillness → azzera aboveStartAt
    }
    const results = runProductionTicks(mags, 1000);
    expect(results.every((r) => r === false)).toBe(true);
  });
});

// ─── (f) window < 2 campioni → spread = 0, nessun movimento ──────────────────

describe("state machine (produzione) — (f) window < 2 campioni → isRiding=false", () => {
  it("primo tick (window=[mag]): spread=0 → isRiding=false", () => {
    const results = runProductionTicks([0.5], 1000);
    expect(results[0]).toBe(false);
  });
});

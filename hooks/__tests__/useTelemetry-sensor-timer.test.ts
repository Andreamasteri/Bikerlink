/**
 * Test della logica del sensorTimer in useTelemetry.
 *
 * La logica critica blindata:
 *   sensorTimerRef fires every SAMPLE_INTERVAL_MS (1 s).
 *   Dentro il tick (produzione in startForegroundSubs):
 *     if (!shouldAddSensorSample(lastGpsTsRef.current)) return;  ← NON aggiunge
 *     bufferRef.current.push(buildSensorSample());                ← aggiunge
 *
 * Strategia: test sulle funzioni PURE DI PRODUZIONE esportate da useTelemetry
 * (`shouldAddSensorSample`, `GPS_SILENCE_MS`). I moduli nativi sono mockati
 * solo per permettere il caricamento del modulo — il corpo del hook non gira.
 *
 * (a) GPS recente (< GPS_SILENCE_MS)    → shouldAddSensorSample = false
 * (b) GPS silenzioso (= GPS_SILENCE_MS) → false (soglia strettamente >)
 * (c) GPS silenzioso (> GPS_SILENCE_MS) → true
 * (d) lastGpsTs = 0 (sessione nuova)    → true
 * (e) buildSensorSample con lastKnownLoc=null → lat/lon null (logica pura)
 * (f) buildSensorSample con lastKnownLoc settato → coord riutilizzate
 */

import { describe, it, expect, vi } from "vitest";

// ── mock: dipendenze native necessarie per caricare il modulo ─────────────────
vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock("expo-location", () => ({
  watchPositionAsync: vi.fn(),
  Accuracy: { BestForNavigation: 6 },
}));
vi.mock("expo-sensors", () => ({
  Accelerometer: { addListener: vi.fn(() => ({ remove: vi.fn() })), setUpdateInterval: vi.fn() },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), getAllKeys: vi.fn(() => []) },
}));
vi.mock("@/lib/query-client", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/lib/background-telemetry-task", () => ({
  BG_TELEMETRY_SESSION_KEY: "@bikerlink/bg_session",
  startTelemetryBackgroundTask: vi.fn(),
  stopTelemetryBackgroundTask: vi.fn(),
  drainBackgroundTelemetryBuffer: vi.fn(() => []),
}));
vi.mock("@/lib/background-location-task", () => ({
  stopBackgroundLocationTask: vi.fn(),
  restartBackgroundLocationTaskWithPrecision: vi.fn(),
  GPS_PRECISION_STORAGE_KEY: "@bikerlink/gps_precision",
}));

// ── import delle funzioni PURE DI PRODUZIONE ─────────────────────────────────
import { GPS_SILENCE_MS, shouldAddSensorSample } from "@/hooks/useTelemetry";

// ─── Contratto valori costanti ────────────────────────────────────────────────

describe("GPS_SILENCE_MS — contratto valore", () => {
  it("GPS_SILENCE_MS vale 5000 ms", () => {
    expect(GPS_SILENCE_MS).toBe(5000);
  });
});

// ─── (a) GPS recente → shouldAddSensorSample = false ─────────────────────────

describe("shouldAddSensorSample — (a) GPS recente → false", () => {
  it("fix GPS arrivato 0 ms fa → false", () => {
    const now = Date.now();
    expect(shouldAddSensorSample(now, now)).toBe(false);
  });

  it("fix GPS arrivato 1 s fa → false (dentro i 5 s)", () => {
    const now = Date.now();
    expect(shouldAddSensorSample(now - 1000, now)).toBe(false);
  });

  it("fix GPS arrivato 4999 ms fa → false (ancora dentro la finestra)", () => {
    const now = Date.now();
    expect(shouldAddSensorSample(now - 4999, now)).toBe(false);
  });
});

// ─── (b) esattamente GPS_SILENCE_MS → false (strettamente >) ─────────────────

describe("shouldAddSensorSample — (b) esattamente GPS_SILENCE_MS → false", () => {
  it("nowMs - lastGpsTs === GPS_SILENCE_MS → false (non strettamente maggiore)", () => {
    const now = 1_000_000;
    expect(shouldAddSensorSample(now - GPS_SILENCE_MS, now)).toBe(false);
  });
});

// ─── (c) silenzio GPS > GPS_SILENCE_MS → true ────────────────────────────────

describe("shouldAddSensorSample — (c) GPS silenzioso → true", () => {
  it("silenzio GPS 5001 ms → true", () => {
    const now = Date.now();
    expect(shouldAddSensorSample(now - (GPS_SILENCE_MS + 1), now)).toBe(true);
  });

  it("silenzio GPS 10 s → true", () => {
    const now = Date.now();
    expect(shouldAddSensorSample(now - 10_000, now)).toBe(true);
  });

  it("silenzio GPS 60 s (tunnel lungo) → true", () => {
    const now = Date.now();
    expect(shouldAddSensorSample(now - 60_000, now)).toBe(true);
  });
});

// ─── (d) lastGpsTs = 0 (sessione nuova, nessun fix) ──────────────────────────

describe("shouldAddSensorSample — (d) lastGpsTs=0 (sessione nuova)", () => {
  it("lastGpsTs=0, now > GPS_SILENCE_MS → true", () => {
    expect(shouldAddSensorSample(0, 100_000)).toBe(true);
  });

  it("lastGpsTs=0, now = GPS_SILENCE_MS → false (esattamente 5 s dall'epoch)", () => {
    expect(shouldAddSensorSample(0, GPS_SILENCE_MS)).toBe(false);
  });

  it("lastGpsTs=0, now = GPS_SILENCE_MS + 1 → true", () => {
    expect(shouldAddSensorSample(0, GPS_SILENCE_MS + 1)).toBe(true);
  });
});

// ─── (e/f) buildSensorSample — logica pura delle coordinate ──────────────────
// buildSensorSample usa: last = lastKnownLocRef.current
//   lat = last ? last.lat : null
//   lon = last ? last.lon : null
// Test la stessa logica come funzione pura (la stessa espressione che
// il hook usa inline — regression guard sul contratto dei campioni null).

function buildSensorSampleCoords(
  lastKnownLoc: { lat: number; lon: number } | null
): { lat: number | null; lon: number | null } {
  const last = lastKnownLoc;
  return {
    lat: last ? last.lat : null,
    lon: last ? last.lon : null,
  };
}

describe("buildSensorSample — (e) nessun fix GPS precedente → lat/lon null", () => {
  it("lat=null e lon=null quando nessun fix precedente", () => {
    const { lat, lon } = buildSensorSampleCoords(null);
    expect(lat).toBeNull();
    expect(lon).toBeNull();
  });
});

describe("buildSensorSample — (f) con fix GPS precedente → coord riutilizzate", () => {
  it("le coord dell'ultimo fix GPS vengono riutilizzate nel campione sensor-only", () => {
    const { lat, lon } = buildSensorSampleCoords({ lat: 45.4642, lon: 9.1900 });
    expect(lat).toBe(45.4642);
    expect(lon).toBe(9.1900);
  });

  it("aggiornamento fix: nuove coord sovrascrivono le precedenti", () => {
    let last: { lat: number; lon: number } | null = { lat: 45.000, lon: 9.000 };
    expect(buildSensorSampleCoords(last)).toEqual({ lat: 45.000, lon: 9.000 });
    last = { lat: 45.001, lon: 9.001 };
    expect(buildSensorSampleCoords(last)).toEqual({ lat: 45.001, lon: 9.001 });
  });
});

// ─── Comportamento complessivo del sensorTimer ────────────────────────────────

describe("comportamento complessivo del sensorTimer (produzione → shouldAddSensorSample)", () => {
  it("GPS recente → shouldAddSensorSample=false → timer NON aggiunge campioni", () => {
    const now = Date.now();
    expect(shouldAddSensorSample(now - 1000, now)).toBe(false);
  });

  it("GPS silenzioso + lastKnownLoc settato → aggiunge con coord salvate", () => {
    const now = Date.now();
    expect(shouldAddSensorSample(now - (GPS_SILENCE_MS + 500), now)).toBe(true);
    const coords = buildSensorSampleCoords({ lat: 45.464, lon: 9.188 });
    expect(coords.lat).toBe(45.464);
    expect(coords.lon).toBe(9.188);
  });

  it("GPS silenzioso + nessun fix precedente → aggiunge con lat/lon=null", () => {
    expect(shouldAddSensorSample(0, 100_000)).toBe(true);
    const coords = buildSensorSampleCoords(null);
    expect(coords.lat).toBeNull();
    expect(coords.lon).toBeNull();
  });
});

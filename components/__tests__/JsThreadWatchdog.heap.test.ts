/**
 * Test della logica heap-pressure in useJsThreadWatchdog.
 *
 * Funzione sotto test: hooks/useJsThreadWatchdog.ts → checkHeapPressure()
 *
 * `checkHeapPressure(heapWarned)` è la funzione pura estratta dal loop interno
 * del watchdog. Legge `globalThis.performance.memory` e calcola la transizione
 * di stato per un singolo tick, senza effetti collaterali (non chiama
 * markAsyncError, non muta ref React). Il hook consuma il risultato e aggiorna
 * heapWarnedRef.
 *
 * Costanti di soglia del modulo:
 *   HEAP_PRESSURE_RATIO = 0.80  (allarme se ratio > 0.80)
 *   HEAP_REARM_RATIO    = 0.72  (riarmo se ratio < 0.72)
 *
 * Comportamenti verificati (regression guard diretto):
 *   (a) Soglia di allarme: action="warn" quando ratio > 0.80 e heapWarned=false.
 *   (b) One-shot: con heapWarned=true action="none" anche se ratio è >0.80.
 *   (c) Isteresi di riarmo:
 *       - nella fascia [0.72, 0.80] → action="none" (NON riarma)
 *       - sotto 0.72 → action="rearm"
 *       - il riarmo a <0.72 + successivo >0.80 con heapWarned=false → "warn".
 *   (d) Dati payload warn: ratioPercent, usedMb, limitMb corretti.
 *   (e) Assenza di performance.memory → action="none" (probe difensiva).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ── mock: react-native (richiesto dall'import transitivo del hook) ─────────────
// checkHeapPressure non usa Platform né AppState, ma importare il modulo
// useJsThreadWatchdog carica i top-level import — mock minimo sufficiente.
import { vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppState: {
    addEventListener: (_e: string, _cb: () => void) => ({ remove: vi.fn() }),
  },
}));

vi.mock("@/lib/crash-logger", () => ({ markAsyncError: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/startup-beacon", () => ({ sendStartupBeacon: vi.fn() }));

// ── import funzioni pure esportate ───────────────────────────────────────────
import {
  checkHeapPressure,
  HEAP_PRESSURE_RATIO,
  HEAP_REARM_RATIO,
} from "@/hooks/useJsThreadWatchdog";

// ── helper: imposta / rimuove globalThis.performance.memory ──────────────────
function setHeap(usedJSHeapSize: number, jsHeapSizeLimit: number) {
  (globalThis as { performance?: unknown }).performance = {
    memory: { usedJSHeapSize, jsHeapSizeLimit },
  };
}

function clearHeap() {
  delete (globalThis as { performance?: unknown }).performance;
}

beforeEach(clearHeap);
afterEach(clearHeap);

// ── contratti sulle costanti ──────────────────────────────────────────────────
describe("costanti soglia (contratto col hook)", () => {
  it("HEAP_PRESSURE_RATIO è 0.80", () => {
    expect(HEAP_PRESSURE_RATIO).toBeCloseTo(0.8);
  });

  it("HEAP_REARM_RATIO è 0.80 * 0.90 = 0.72", () => {
    expect(HEAP_REARM_RATIO).toBeCloseTo(0.72);
  });
});

// ── (a) Soglia di allarme ─────────────────────────────────────────────────────
describe("checkHeapPressure — (a) soglia: action='warn' quando ratio > 0.80", () => {
  it("ratio 0.85 con heapWarned=false → action='warn'", () => {
    setHeap(85, 100);
    expect(checkHeapPressure(false).action).toBe("warn");
  });

  it("ratio 0.81 (appena sopra) con heapWarned=false → action='warn'", () => {
    setHeap(81, 100);
    expect(checkHeapPressure(false).action).toBe("warn");
  });

  it("ratio 0.80 esatto NON supera la soglia (condizione: strettamente >) → action='none'", () => {
    setHeap(80, 100);
    expect(checkHeapPressure(false).action).toBe("none");
  });

  it("ratio 0.79 sotto soglia → action='none'", () => {
    setHeap(79, 100);
    expect(checkHeapPressure(false).action).toBe("none");
  });
});

// ── (b) One-shot: heapWarned=true blocca il log ───────────────────────────────
describe("checkHeapPressure — (b) one-shot: heapWarned=true → action='none' anche a >80%", () => {
  it("ratio 0.90 con heapWarned=true → action='none' (già loggato)", () => {
    setHeap(90, 100);
    expect(checkHeapPressure(true).action).toBe("none");
  });

  it("ratio 0.99 estremo con heapWarned=true → action='none'", () => {
    setHeap(99, 100);
    expect(checkHeapPressure(true).action).toBe("none");
  });
});

// ── (c) Isteresi di riarmo ────────────────────────────────────────────────────
describe("checkHeapPressure — (c) isteresi: riarmo SOLO sotto 0.72", () => {
  it("ratio 0.75 (nella fascia 0.72-0.80) con heapWarned=true → action='none' (NON riarma)", () => {
    setHeap(75, 100);
    expect(checkHeapPressure(true).action).toBe("none");
  });

  it("ratio 0.73 (nella fascia 0.72-0.80) NON riarma → action='none'", () => {
    // 0.73 > HEAP_REARM_RATIO (≈0.7200000000000001 per float): nessun riarmo
    setHeap(73, 100);
    expect(checkHeapPressure(true).action).toBe("none");
  });

  it("ratio 0.72/100=0.72 riarma: 72/100 < 0.8*0.9 (0.7200000000000001) per float → action='rearm'", () => {
    // In JS: 0.8 * 0.9 = 0.7200000000000001; 72/100 = 0.72 < 0.7200000000000001 → rearm
    setHeap(72, 100);
    expect(checkHeapPressure(true).action).toBe("rearm");
  });

  it("ratio 0.71 (chiaramente sotto) → action='rearm'", () => {
    setHeap(71, 100);
    expect(checkHeapPressure(true).action).toBe("rearm");
  });

  it("ratio 0.50 (ben sotto 0.72) → action='rearm'", () => {
    setHeap(50, 100);
    expect(checkHeapPressure(true).action).toBe("rearm");
  });

  it("ciclo completo: warn → rearm → warn (simula isteresi a livello di sequenza)", () => {
    // Passo 1: heapWarned=false, ratio >0.80 → warn
    setHeap(85, 100);
    const r1 = checkHeapPressure(false);
    expect(r1.action).toBe("warn");

    // Passo 2: heapWarned=true (come aggiornato dal hook), ratio nella fascia → none
    setHeap(75, 100);
    const r2 = checkHeapPressure(true);
    expect(r2.action).toBe("none");

    // Passo 3: ratio scende sotto 0.72 → rearm
    setHeap(70, 100);
    const r3 = checkHeapPressure(true);
    expect(r3.action).toBe("rearm");

    // Passo 4: heapWarned=false (riarmato), ratio >0.80 → warn di nuovo
    setHeap(90, 100);
    const r4 = checkHeapPressure(false);
    expect(r4.action).toBe("warn");
  });
});

// ── (d) Payload dati del warn ─────────────────────────────────────────────────
describe("checkHeapPressure — (d) payload warn: ratioPercent, usedMb, limitMb corretti", () => {
  it("1024MB / 1024MB = 100% → payload corretto", () => {
    const MB = 1024 * 1024;
    setHeap(900 * MB, 1024 * MB); // 87.89%
    const r = checkHeapPressure(false);
    expect(r.action).toBe("warn");
    if (r.action !== "warn") return;
    expect(r.ratioPercent).toBe(Math.round((900 / 1024) * 100)); // 87
    expect(r.usedMb).toBe(900);
    expect(r.limitMb).toBe(1024);
  });

  it("85 bytes su 100 bytes → ratioPercent=85", () => {
    setHeap(85, 100);
    const r = checkHeapPressure(false);
    expect(r.action).toBe("warn");
    if (r.action !== "warn") return;
    expect(r.ratioPercent).toBe(85);
  });
});

// ── (e) Assenza di performance.memory → nessun allarme ───────────────────────
describe("checkHeapPressure — (e) probe difensiva: action='none' senza dati memory", () => {
  it("performance non definita → action='none'", () => {
    clearHeap();
    expect(checkHeapPressure(false).action).toBe("none");
  });

  it("performance.memory assente (solo l'oggetto performance) → action='none'", () => {
    (globalThis as { performance?: unknown }).performance = {};
    expect(checkHeapPressure(false).action).toBe("none");
  });

  it("jsHeapSizeLimit=0 (divisione per zero evitata) → action='none'", () => {
    setHeap(0, 0);
    expect(checkHeapPressure(false).action).toBe("none");
  });

  it("jsHeapSizeLimit negativo → action='none'", () => {
    setHeap(100, -1);
    expect(checkHeapPressure(false).action).toBe("none");
  });
});

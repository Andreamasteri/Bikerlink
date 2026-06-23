/**
 * Test di regressione — Anti crash-loop (server/lib/crash-backoff.ts).
 *
 * Le tre protezioni anti crash-loop introdotte per la resilienza dell'avvio sono
 * state verificate manualmente. Questo file blinda il backoff esponenziale così
 * un refactor futuro non può ridurlo a un restart immediato (la firma del
 * crash-loop osservato: DB managed lento → exit → restart ravvicinato → ricrash).
 *
 * Verifica:
 *  - progressione esponenziale del backoff (2s→4s→8s→16s→cap a 30s);
 *  - resetCrashBackoff() azzera il conteggio (un run sano "perdona");
 *  - finestra scorrevole: i crash più vecchi di CRASH_WINDOW_MS non contano.
 *
 * Usa un file temporaneo dedicato (CRASH_BACKOFF_FILE settato PRIMA dell'import,
 * perché il modulo legge l'env a livello di modulo) così non tocca /tmp reale.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";

const TMP_FILE = vi.hoisted(() => {
  const os = require("os");
  const path = require("path");
  const file = path.join(os.tmpdir(), `crash-backoff-test-${process.pid}-${Date.now()}.json`);
  process.env.CRASH_BACKOFF_FILE = file;
  return file;
});

import { recordCrashAndBackoff, resetCrashBackoff, sleepSync } from "../lib/crash-backoff";

function cleanup(): void {
  try {
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
  } catch {
    /* ignore */
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetCrashBackoff();
  cleanup();
});

afterAll(() => {
  cleanup();
});

describe("recordCrashAndBackoff — progressione esponenziale", () => {
  it("cresce 2s→4s→8s→16s→cap(30s) su crash ravvicinati nella stessa finestra", () => {
    // Tempo congelato: tutti i crash cadono nella stessa finestra → contano tutti.
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    expect(recordCrashAndBackoff()).toBe(2_000); // n=1 → base
    expect(recordCrashAndBackoff()).toBe(4_000); // n=2 → base*2
    expect(recordCrashAndBackoff()).toBe(8_000); // n=3 → base*4
    expect(recordCrashAndBackoff()).toBe(16_000); // n=4 → base*8
    // n=5 → base*16 = 32_000 ma viene cappato a CRASH_MAX_DELAY_MS (30_000)
    expect(recordCrashAndBackoff()).toBe(30_000);
    // ulteriori crash restano al cap, non oltre
    expect(recordCrashAndBackoff()).toBe(30_000);
  });

  it("persiste i timestamp su file tra chiamate (lo stato non vive solo in memoria)", () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    recordCrashAndBackoff();
    recordCrashAndBackoff();
    const persisted = JSON.parse(fs.readFileSync(TMP_FILE, "utf8"));
    expect(Array.isArray(persisted)).toBe(true);
    expect(persisted).toHaveLength(2);
  });
});

describe("resetCrashBackoff — perdono di un run sano", () => {
  it("dopo il reset il prossimo crash riparte dal delay base", () => {
    vi.spyOn(Date, "now").mockReturnValue(3_000_000);
    recordCrashAndBackoff(); // 2_000
    recordCrashAndBackoff(); // 4_000
    expect(recordCrashAndBackoff()).toBe(8_000); // raffica in corso

    resetCrashBackoff();

    // Un crash isolato dopo un periodo sano non eredita il conteggio della raffica.
    expect(recordCrashAndBackoff()).toBe(2_000);
  });

  it("è sicuro chiamarlo anche senza alcun file di stato", () => {
    cleanup();
    expect(() => resetCrashBackoff()).not.toThrow();
  });
});

describe("finestra scorrevole — i crash vecchi non contano", () => {
  it("scarta i timestamp più vecchi di CRASH_WINDOW_MS (5 min) e riparte dal base", () => {
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(0);
    expect(recordCrashAndBackoff()).toBe(2_000); // n=1

    now.mockReturnValue(10_000);
    expect(recordCrashAndBackoff()).toBe(4_000); // n=2 (entrambi nella finestra)

    // Avanza oltre la finestra (5 min = 300_000ms) rispetto ai crash precedenti:
    // entrambi escono dalla finestra scorrevole → conteggio riparte da 1.
    now.mockReturnValue(400_000);
    expect(recordCrashAndBackoff()).toBe(2_000); // n=1 di nuovo
  });

  it("mantiene nel conteggio i crash ancora dentro la finestra", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(0);
    recordCrashAndBackoff(); // t=0
    now.mockReturnValue(100_000);
    recordCrashAndBackoff(); // t=100s, dentro finestra
    // t=200s: i due precedenti (0 e 100_000) sono ancora < 300_000ms di distanza
    now.mockReturnValue(200_000);
    expect(recordCrashAndBackoff()).toBe(8_000); // n=3
  });
});

describe("sleepSync", () => {
  it("è un no-op immediato per delay <= 0", () => {
    const start = Date.now();
    sleepSync(0);
    sleepSync(-100);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("blocca in modo sincrono per il delay richiesto", () => {
    const start = Date.now();
    sleepSync(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
});

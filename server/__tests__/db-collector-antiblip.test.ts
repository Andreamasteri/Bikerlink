import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Signal } from "../ai/watchdog/types";

// db.execute pilotabile per simulare ping veloci/lenti/falliti.
const executeMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({
  db: { execute: executeMock },
  pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
}));

// Circuit breaker neutralizzato: non deve interferire con l'anti-blip del collector.
vi.mock("../db-circuit-breaker", () => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  getCircuitStatus: vi.fn(() => ({ state: "CLOSED", consecutiveFailures: 0, openedAt: null })),
}));

// Date.now mock: ogni collectDb success fa 2 chiamate (started, dopo-ping) →
// l'indice pari restituisce 0 e quello dispari `pingMs`, così pingMs è
// deterministico e configurabile per test.
let pingMs = 0;
let nowIdx = 0;
let dateSpy: ReturnType<typeof vi.spyOn>;

const ping = (s: Signal[]) => s.find((x) => x.metric === "db.ping_ms");
const collectorErr = (s: Signal[]) => s.find((x) => x.metric === "collector.error");

async function loadCollector() {
  const mod = await import("../ai/watchdog/collectors/db-collector");
  return mod.collectDb;
}

describe("db-collector anti-blip gating", () => {
  beforeEach(() => {
    vi.resetModules(); // azzera lo stato modulo (consecutiveSlow/Fail)
    nowIdx = 0;
    pingMs = 0;
    executeMock.mockReset();
    dateSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      const isStart = nowIdx % 2 === 0;
      nowIdx++;
      return isStart ? 0 : pingMs;
    });
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it("un singolo ping lento resta 'warn', escala a 'high' solo dopo 3 consecutivi", async () => {
    pingMs = 600; // > SLOW_PING_THRESHOLD_MS (500)
    executeMock.mockResolvedValue({ rows: [] });
    const collectDb = await loadCollector();

    expect(ping(await collectDb())?.severity).toBe("warn"); // 1
    expect(ping(await collectDb())?.severity).toBe("warn"); // 2
    expect(ping(await collectDb())?.severity).toBe("high"); // 3 → escala
  });

  it("un ping veloce resetta il contatore dei lenti consecutivi", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    const collectDb = await loadCollector();

    pingMs = 600;
    await collectDb(); // slow #1
    await collectDb(); // slow #2

    pingMs = 100; // veloce → reset
    expect(ping(await collectDb())?.severity).toBe("info");

    pingMs = 600; // riparte da 1 → warn (NON high)
    expect(ping(await collectDb())?.severity).toBe("warn");
  });

  it("latenza intermedia (>150ms, <=500ms) è 'warn' senza escalation", async () => {
    pingMs = 200;
    executeMock.mockResolvedValue({ rows: [] });
    const collectDb = await loadCollector();

    for (let i = 0; i < 5; i++) {
      expect(ping(await collectDb())?.severity).toBe("warn");
    }
  });

  it("un singolo ping fallito resta 'warn', escala a 'critical' solo dopo 3 consecutivi", async () => {
    executeMock.mockRejectedValue(
      Object.assign(new Error("connection terminated unexpectedly"), { code: "08006" }),
    );
    const collectDb = await loadCollector();

    expect(collectorErr(await collectDb())?.severity).toBe("warn"); // 1
    expect(collectorErr(await collectDb())?.severity).toBe("warn"); // 2
    const s3 = await collectDb(); // 3 → critical
    expect(collectorErr(s3)?.severity).toBe("critical");
    expect((collectorErr(s3)?.details as { consecutiveFailures: number }).consecutiveFailures).toBe(3);
  });

  it("un ping riuscito resetta il contatore dei fallimenti consecutivi", async () => {
    const collectDb = await loadCollector();

    executeMock.mockRejectedValue(new Error("boom"));
    await collectDb(); // fail #1
    await collectDb(); // fail #2

    executeMock.mockReset();
    executeMock.mockResolvedValue({ rows: [] });
    pingMs = 100;
    await collectDb(); // success → reset

    executeMock.mockReset();
    executeMock.mockRejectedValue(new Error("boom"));
    expect(collectorErr(await collectDb())?.severity).toBe("warn"); // riparte da 1
  });
});

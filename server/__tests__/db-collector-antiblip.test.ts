import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Signal } from "../ai/watchdog/types";

// db.execute pilotabile per simulare ping veloci/lenti/falliti.
const executeMock = vi.hoisted(() => vi.fn());
// isPoolHealthy pilotabile: distingue "pool saturo" da "DB irraggiungibile".
const isPoolHealthyMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("../db", () => ({
  db: { execute: executeMock },
  pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
  isPoolHealthy: isPoolHealthyMock,
}));

// Circuit breaker: spy hoisted così possiamo asserire che la saturazione NON lo arma.
const recordSuccessMock = vi.hoisted(() => vi.fn());
const recordFailureMock = vi.hoisted(() => vi.fn());
vi.mock("../db-circuit-breaker", () => ({
  recordSuccess: recordSuccessMock,
  recordFailure: recordFailureMock,
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
    isPoolHealthyMock.mockReset();
    isPoolHealthyMock.mockReturnValue(true); // default: pool sano (un fallimento = DB down)
    recordSuccessMock.mockReset();
    recordFailureMock.mockReset();
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

  // ── Distinzione pool-saturo vs DB-irraggiungibile (incidente 20 giu) ──────────
  const saturated = (s: Signal[]) => s.find((x) => x.metric === "db.ping_saturated");

  it("ping fallito con pool SATURO non apre il breaker e resta 'warn' (saturazione, non escala)", async () => {
    isPoolHealthyMock.mockReturnValue(false); // pool saturo: il SELECT 1 non ha ottenuto una connessione
    executeMock.mockRejectedValue(new Error("timeout exceeded when trying to connect"));
    const collectDb = await loadCollector();

    // Anche dopo molti tick consecutivi la saturazione NON diventa mai 'critical'
    // e NON viene contata come collector.error né come fallimento del breaker.
    for (let i = 0; i < 4; i++) {
      const s = await collectDb();
      expect(saturated(s)?.severity).toBe("warn");
      expect(collectorErr(s)).toBeUndefined();
    }
    expect(recordFailureMock).not.toHaveBeenCalled();
  });

  it("ping fallito con pool SANO conta come fallimento del breaker (DB irraggiungibile)", async () => {
    isPoolHealthyMock.mockReturnValue(true); // pool con capacità libera → guasto reale
    executeMock.mockRejectedValue(
      Object.assign(new Error("connection terminated unexpectedly"), { code: "08006" }),
    );
    const collectDb = await loadCollector();

    const s = await collectDb();
    expect(collectorErr(s)?.severity).toBe("warn");
    expect(saturated(s)).toBeUndefined();
    expect(recordFailureMock).toHaveBeenCalledTimes(1);
  });

  it("la saturazione NON inquina il contatore: un guasto DB successivo riparte da 1 (warn)", async () => {
    const collectDb = await loadCollector();

    // 2 tick saturi (non contano)
    isPoolHealthyMock.mockReturnValue(false);
    executeMock.mockRejectedValue(new Error("connect timeout"));
    await collectDb();
    await collectDb();

    // pool torna sano ma il DB è giù → riparte da 1 (warn, non critical)
    isPoolHealthyMock.mockReturnValue(true);
    expect(collectorErr(await collectDb())?.severity).toBe("warn");
  });
});

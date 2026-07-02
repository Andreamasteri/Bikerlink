import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Signal } from "../ai/watchdog/types";

// client.query pilotabile per simulare ping veloci/lenti/falliti. Il collector
// ora acquisisce UNA sola connessione via pool.connect() ed esegue tutte le
// query su quel client (Task #4679).
const queryMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(async () => ({ query: queryMock, release: releaseMock })),
);
// isPoolHealthy pilotabile: distingue "pool saturo" da "DB irraggiungibile".
const isPoolHealthyMock = vi.hoisted(() => vi.fn(() => true));

// snapshotBlockedQueries: logging best-effort di pg_stat_activity quando il
// pool è saturo/lento. Risolve a [] di default così il collector non tenta
// mai una query DB reale per questo path diagnostico.
const snapshotBlockedQueriesMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock("../db", () => ({
  pool: { totalCount: 0, idleCount: 0, waitingCount: 0, connect: connectMock },
  isPoolHealthy: isPoolHealthyMock,
  snapshotBlockedQueries: snapshotBlockedQueriesMock,
}));

// readJobAttempt: il ramo "vacuum.last_attempt" del collector chiama
// readJobAttempt() (che a sua volta tocca storage.getAppSetting → DB reale
// non coperto da questo mock). Mockiamo direttamente il modulo
// scheduler-retry così quel ramo resta un no-op deterministico e non sfasa i
// Date.now() mockati su cui i test di severity si basano.
const readJobAttemptMock = vi.hoisted(() => vi.fn(async () => null));
vi.mock("../lib/scheduler-retry", () => ({
  readJobAttempt: readJobAttemptMock,
}));

// Circuit breaker: spy hoisted così possiamo asserire che la saturazione NON lo arma.
const recordSuccessMock = vi.hoisted(() => vi.fn());
const recordFailureMock = vi.hoisted(() => vi.fn());
vi.mock("../db-circuit-breaker", () => ({
  recordSuccess: recordSuccessMock,
  recordFailure: recordFailureMock,
  getCircuitStatus: vi.fn(() => ({ state: "CLOSED", consecutiveFailures: 0, openedAt: null })),
}));

// Date.now mock: invece di contare le chiamate (fragile — moduli terzi come
// Bottleneck in bg-db-limiter chiamano Date.now() al bootstrap del modulo via
// vi.resetModules(), sfasando qualunque conteggio a indice pari/dispari),
// usiamo un orologio controllabile con avanzamento esplicito. `currentTime`
// parte da 0 ad ogni test; l'avanzamento di `pingMs` avviene SOLO quando il
// mock di `client.query` intercetta la query "SELECT 1" (il ping reale nel
// collector), quindi è ancorato al punto esatto di esecuzione e non al
// numero di chiamate a Date.now() fatte da codice estraneo (import di
// moduli, logger, HNSW throttle, ecc.).
let pingMs = 0;
let currentTime = 0;
let dateSpy: ReturnType<typeof vi.spyOn>;

function mockQueryWithPing(
  impl?: (sql: string) => Promise<{ rows: unknown[] }> | { rows: unknown[] },
) {
  queryMock.mockImplementation(async (sql: string) => {
    if (typeof sql === "string" && sql.includes("SELECT 1")) {
      currentTime += pingMs;
    }
    if (impl) return impl(sql);
    return { rows: [] };
  });
}

const ping = (s: Signal[]) => s.find((x) => x.metric === "db.ping_ms");
const collectorErr = (s: Signal[]) => s.find((x) => x.metric === "collector.error");

async function loadCollector() {
  const mod = await import("../ai/watchdog/collectors/db-collector");
  return mod.collectDb;
}

describe("db-collector anti-blip gating", () => {
  beforeEach(() => {
    vi.resetModules(); // azzera lo stato modulo (consecutiveSlow/Fail)
    currentTime = 0;
    pingMs = 0;
    queryMock.mockReset();
    isPoolHealthyMock.mockReset();
    isPoolHealthyMock.mockReturnValue(true); // default: pool sano (un fallimento = DB down)
    recordSuccessMock.mockReset();
    recordFailureMock.mockReset();
    dateSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it("un singolo ping lento resta 'warn', escala a 'high' solo dopo 3 consecutivi", async () => {
    pingMs = 600; // > SLOW_PING_THRESHOLD_MS (500)
    mockQueryWithPing();
    const collectDb = await loadCollector();

    expect(ping(await collectDb())?.severity).toBe("warn"); // 1
    expect(ping(await collectDb())?.severity).toBe("warn"); // 2
    expect(ping(await collectDb())?.severity).toBe("high"); // 3 → escala
  });

  it("un ping veloce resetta il contatore dei lenti consecutivi", async () => {
    mockQueryWithPing();
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
    mockQueryWithPing();
    const collectDb = await loadCollector();

    for (let i = 0; i < 5; i++) {
      expect(ping(await collectDb())?.severity).toBe("warn");
    }
  });

  it("un singolo ping fallito resta 'warn', escala a 'high' solo dopo 3 consecutivi (non 'critical' — doppia penalità)", async () => {
    // Errore non-transitorio (ECONNREFUSED non matcha /connection terminated/)
    queryMock.mockRejectedValue(
      Object.assign(new Error("ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
    );
    const collectDb = await loadCollector();

    expect(collectorErr(await collectDb())?.severity).toBe("warn"); // 1
    expect(collectorErr(await collectDb())?.severity).toBe("warn"); // 2
    const s3 = await collectDb(); // 3 → high (mai critical: circuit breaker è già "critical")
    expect(collectorErr(s3)?.severity).toBe("high");
    expect((collectorErr(s3)?.details as { consecutiveFailures: number }).consecutiveFailures).toBe(3);
  });

  it("un ping riuscito resetta il contatore dei fallimenti consecutivi", async () => {
    const collectDb = await loadCollector();

    queryMock.mockRejectedValue(new Error("boom"));
    await collectDb(); // fail #1
    await collectDb(); // fail #2

    queryMock.mockReset();
    mockQueryWithPing();
    pingMs = 100;
    await collectDb(); // success → reset

    queryMock.mockReset();
    queryMock.mockRejectedValue(new Error("boom"));
    expect(collectorErr(await collectDb())?.severity).toBe("warn"); // riparte da 1
  });

  // ── Distinzione pool-saturo vs DB-irraggiungibile (incidente 20 giu) ──────────
  const saturated = (s: Signal[]) => s.find((x) => x.metric === "db.ping_saturated");

  it("ping fallito con pool SATURO non apre il breaker e resta 'warn' (saturazione, non escala)", async () => {
    isPoolHealthyMock.mockReturnValue(false); // pool saturo: il SELECT 1 non ha ottenuto una connessione
    queryMock.mockRejectedValue(new Error("timeout exceeded when trying to connect"));
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

  it("ping fallito con pool SANO e errore non-transitorio conta come fallimento del breaker (DB irraggiungibile)", async () => {
    isPoolHealthyMock.mockReturnValue(true); // pool con capacità libera → guasto reale
    // Errore non-transitorio: non matcha /connection terminated/ né /connection timeout/
    queryMock.mockRejectedValue(
      Object.assign(new Error("ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
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
    queryMock.mockRejectedValue(new Error("connect timeout"));
    await collectDb();
    await collectDb();

    // pool torna sano ma il DB è giù → riparte da 1 (warn, non critical)
    isPoolHealthyMock.mockReturnValue(true);
    expect(collectorErr(await collectDb())?.severity).toBe("warn");
  });

  // ── Errori di connessione transitoria (Task #4675) ────────────────────────

  it("'Connection terminated due to connection timeout' con pool sano → ping_saturated warn, NON collector.error", async () => {
    isPoolHealthyMock.mockReturnValue(true); // pool sano, ma errore transitorio
    queryMock.mockRejectedValue(new Error("Connection terminated due to connection timeout"));
    const collectDb = await loadCollector();

    const s = await collectDb();
    expect(saturated(s)?.severity).toBe("warn");
    expect((saturated(s)?.details as { reason?: string })?.reason).toBe("transitory_connection_error");
    expect(collectorErr(s)).toBeUndefined();
    expect(recordFailureMock).not.toHaveBeenCalled();
  });

  it("'Connection terminated unexpectedly' con pool sano → ping_saturated warn, NON collector.error", async () => {
    isPoolHealthyMock.mockReturnValue(true);
    queryMock.mockRejectedValue(new Error("Connection terminated unexpectedly"));
    const collectDb = await loadCollector();

    const s = await collectDb();
    expect(saturated(s)?.severity).toBe("warn");
    expect(collectorErr(s)).toBeUndefined();
    expect(recordFailureMock).not.toHaveBeenCalled();
  });

  it("collector.error non supera mai severity 'critical' indipendentemente da consecutivePingFailures", async () => {
    isPoolHealthyMock.mockReturnValue(true);
    queryMock.mockRejectedValue(new Error("ECONNREFUSED — host definitivamente giù"));
    const collectDb = await loadCollector();

    // Eseguiamo 10 cicli consecutivi: collector.error deve restare ≤ "high"
    for (let i = 0; i < 10; i++) {
      const s = await collectDb();
      const ce = collectorErr(s);
      expect(ce).toBeDefined();
      expect(ce?.severity).not.toBe("critical");
      // Dopo CONSECUTIVE_FAIL_FOR_CRITICAL (3) dev'essere "high"
      if (i >= 2) {
        expect(ce?.severity).toBe("high");
      }
    }
  });
});

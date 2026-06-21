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
 *
 * Contiene inoltre un test E2E che esercita l'intero ciclo runAggregatorCycle()
 * con ThinkCentre powered-off e verifica che db.db.ping_ms e
 * maps.health.network_instability non superino mai severity "warn" nello snapshot
 * finale — anche quando i collector li emettono a "high".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { suppressDownstreamWhenPoweredOff } from "../ai/watchdog/aggregator";
import type { Problem, Severity, SignalSource, Signal } from "../ai/watchdog/types";

// ── Mocks per il blocco E2E ───────────────────────────────────────────────────
// Usano vi.hoisted perché vi.mock() viene eseguito prima delle import.
// I test unitari su suppressDownstreamWhenPoweredOff NON ne sono influenzati
// perché quella funzione è pura e non dipende da nessuno di questi moduli.

const collectDbMock = vi.hoisted(() => vi.fn<[], Promise<Signal[]>>());
const collectBullMqMock = vi.hoisted(() => vi.fn<[], Promise<Signal[]>>());
const collectSchedulerMock = vi.hoisted(() => vi.fn<[], Promise<Signal[]>>());
const collectRedisMock = vi.hoisted(() => vi.fn<[], Promise<Signal[]>>());
const collectLatencyMock = vi.hoisted(() => vi.fn<[], Promise<Signal[]>>());
const collectErrorsMock = vi.hoisted(() => vi.fn<[], Promise<Signal[]>>());
const collectMapsMock = vi.hoisted(() => vi.fn<[], Promise<Signal[]>>());
const collectRestartsMock = vi.hoisted(() => vi.fn<[], Promise<Signal[]>>());
const collectPoolMock = vi.hoisted(() => vi.fn<[], Signal[]>());
const isThinkCentrePoweredOffMock = vi.hoisted(() => vi.fn<[], Promise<boolean>>());
const recordSignalsMock = vi.hoisted(() => vi.fn<[Signal[]], Promise<void>>());

vi.mock("../ai/watchdog/collectors/bullmq-collector", () => ({ collectBullMq: collectBullMqMock }));
vi.mock("../ai/watchdog/collectors/scheduler-collector", () => ({ collectScheduler: collectSchedulerMock }));
vi.mock("../ai/watchdog/collectors/db-collector", () => ({ collectDb: collectDbMock }));
vi.mock("../ai/watchdog/collectors/redis-collector", () => ({ collectRedis: collectRedisMock }));
vi.mock("../ai/watchdog/collectors/latency-collector", () => ({ collectLatency: collectLatencyMock }));
vi.mock("../ai/watchdog/collectors/error-collector", () => ({ collectErrors: collectErrorsMock }));
vi.mock("../ai/watchdog/collectors/maps-collector", () => ({ collectMaps: collectMapsMock }));
vi.mock("../ai/watchdog/collectors/restart-collector", () => ({ collectRestarts: collectRestartsMock }));
vi.mock("../ai/watchdog/collectors/pool-collector", () => ({ collectPool: collectPoolMock }));
vi.mock("../ai/watchdog/signals", () => ({ recordSignals: recordSignalsMock }));
vi.mock("../lib/thinkcentre-powered-off", () => ({ isThinkCentrePoweredOff: isThinkCentrePoweredOffMock }));
vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: vi.fn((fn: () => unknown) => (typeof fn === "function" ? fn() : Promise.resolve([]))),
}));
vi.mock("../db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) }),
    }),
  },
}));
vi.mock("../ai/db-integrity/collector", () => ({
  collectDbIntegrity: vi.fn().mockResolvedValue({ hasRun: false }),
}));
vi.mock("../storage", () => ({
  storage: { getAppSetting: vi.fn().mockResolvedValue(null) },
}));

// ── Helper factory ──────────────────────────────────────────────────────────

function prob(
  id: string,
  severity: Severity,
  source: SignalSource = "maps",
): Problem {
  return { id, severity, source, title: `problema ${id}` };
}

// ── Unit tests — suppressDownstreamWhenPoweredOff (funzione pura) ───────────

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

// ── E2E — runAggregatorCycle() con ThinkCentre spento ────────────────────────
//
// Esercita l'intero ciclo di aggregazione: i collector emettono segnali reali
// (ping_ms HIGH, network_instability HIGH), il ciclo applica la soppressione
// quando isThinkCentrePoweredOff()=true, e lo snapshot finale NON deve
// contenere nessun problema con id db.db.ping_ms o maps.health.network_instability
// con severity > "warn".

describe("runAggregatorCycle — E2E soppressione ThinkCentre spento", () => {
  beforeEach(() => {
    // Reset mock state tra i test.
    vi.clearAllMocks();

    // Default: tutti i collector restituiscono array vuoti.
    collectBullMqMock.mockResolvedValue([]);
    collectSchedulerMock.mockResolvedValue([]);
    collectRedisMock.mockResolvedValue([]);
    collectLatencyMock.mockResolvedValue([]);
    collectErrorsMock.mockResolvedValue([]);
    collectRestartsMock.mockResolvedValue([]);
    collectPoolMock.mockReturnValue([]);
    recordSignalsMock.mockResolvedValue(undefined);
  });

  it("db.db.ping_ms e maps.health.network_instability non superano 'warn' nello snapshot quando TC è spento", async () => {
    // Simula: ping DB lento (emesso dal db-collector come HIGH) e
    // instabilità di rete (emessa dal maps-collector come HIGH).
    collectDbMock.mockResolvedValue([
      {
        source: "db",
        metric: "db.ping_ms",
        severity: "high",
        value: 1200,
        details: { consecutiveSlow: 3 },
      } satisfies Signal,
    ]);
    collectMapsMock.mockResolvedValue([
      {
        source: "maps",
        metric: "health.network_instability",
        severity: "high",
        value: 3,
        details: { engines: ["graphhopper", "valhalla", "nominatim"] },
      } satisfies Signal,
    ]);

    // ThinkCentre è spento: la soppressione deve attivarsi.
    isThinkCentrePoweredOffMock.mockResolvedValue(true);

    const { runAggregatorCycle } = await import("../ai/watchdog/aggregator");
    const snap = await runAggregatorCycle();

    const pingProblem = snap.problems.find((p) => p.id === "db.db.ping_ms");
    const netProblem = snap.problems.find((p) => p.id === "maps.health.network_instability");

    // Devono essere presenti (visibili in dashboard) ma declassati a "warn".
    expect(pingProblem).toBeDefined();
    expect(pingProblem?.severity).toBe("warn");
    expect(pingProblem?.title).toContain("soppresso");

    expect(netProblem).toBeDefined();
    expect(netProblem?.severity).toBe("warn");
    expect(netProblem?.title).toContain("soppresso");

    // Nessun problema nel snapshot supera severity "warn" per questi due ID.
    const overWarn = snap.problems
      .filter((p) => p.id === "db.db.ping_ms" || p.id === "maps.health.network_instability")
      .filter((p) => p.severity === "high" || p.severity === "critical");
    expect(overWarn).toHaveLength(0);
  });

  it("ping_saturated non supera 'warn' nello snapshot quando TC è spento", async () => {
    collectDbMock.mockResolvedValue([
      {
        source: "db",
        metric: "db.ping_saturated",
        severity: "high",
        value: 1,
        details: { reason: "pool_saturated" },
      } satisfies Signal,
    ]);
    collectMapsMock.mockResolvedValue([]);
    isThinkCentrePoweredOffMock.mockResolvedValue(true);

    const { runAggregatorCycle } = await import("../ai/watchdog/aggregator");
    const snap = await runAggregatorCycle();

    const saturated = snap.problems.find((p) => p.id === "db.db.ping_saturated");
    expect(saturated).toBeDefined();
    expect(saturated?.severity).toBe("warn");

    const overWarn = snap.problems
      .filter((p) => p.id === "db.db.ping_saturated")
      .filter((p) => p.severity === "high" || p.severity === "critical");
    expect(overWarn).toHaveLength(0);
  });

  it("senza soppressione (TC acceso), ping_ms e network_instability HIGH rimangono HIGH nello snapshot", async () => {
    collectDbMock.mockResolvedValue([
      {
        source: "db",
        metric: "db.ping_ms",
        severity: "high",
        value: 1200,
      } satisfies Signal,
    ]);
    collectMapsMock.mockResolvedValue([
      {
        source: "maps",
        metric: "health.network_instability",
        severity: "high",
        value: 2,
      } satisfies Signal,
    ]);

    // ThinkCentre acceso: nessuna soppressione.
    isThinkCentrePoweredOffMock.mockResolvedValue(false);

    const { runAggregatorCycle } = await import("../ai/watchdog/aggregator");
    const snap = await runAggregatorCycle();

    const pingProblem = snap.problems.find((p) => p.id === "db.db.ping_ms");
    const netProblem = snap.problems.find((p) => p.id === "maps.health.network_instability");

    expect(pingProblem?.severity).toBe("high");
    expect(netProblem?.severity).toBe("high");
    // Titolo NON contiene "soppresso" quando TC è acceso.
    expect(pingProblem?.title).not.toContain("soppresso");
    expect(netProblem?.title).not.toContain("soppresso");
  });

  it("isThinkCentrePoweredOff che solleva errore non interrompe il ciclo (fail-safe a false)", async () => {
    collectDbMock.mockResolvedValue([
      {
        source: "db",
        metric: "db.ping_ms",
        severity: "high",
        value: 800,
      } satisfies Signal,
    ]);
    collectMapsMock.mockResolvedValue([]);

    // Errore di rete nel leggere il flag: il ciclo deve continuare.
    isThinkCentrePoweredOffMock.mockRejectedValue(new Error("DB timeout"));

    const { runAggregatorCycle } = await import("../ai/watchdog/aggregator");
    const snap = await runAggregatorCycle();

    // Snapshot valido nonostante l'errore.
    expect(snap).toBeDefined();
    expect(snap.problems).toBeDefined();
    // Senza soppressione (fail-safe), il problema rimane con la severity originale.
    const pingProblem = snap.problems.find((p) => p.id === "db.db.ping_ms");
    expect(pingProblem?.severity).toBe("high");
  });
});

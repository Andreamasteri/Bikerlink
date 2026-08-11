/**
 * Map Matching Job — verifica della logica di re-match della telemetria (Task #4606)
 *
 * Copre la macchina a stati pending/retry/matched/unmatchable di
 * runMapMatchingJob() + requeueUnmatchable() con DB e GraphHopper mockati:
 *   - Classificazione: <2 punti → unmatchable; errore GH → retry (+1 tentativo);
 *     match con segmenti → matched + upsert; match senza segmenti → unmatchable.
 *   - Idempotenza: la discovery esclude i campioni 'matched' (no doppio conteggio);
 *     batch vuoto → nessuna aggregazione.
 *   - Cap tentativi + backoff: la discovery filtra match_attempts < cap con backoff
 *     esponenziale; requeueUnmatchable() riporta unmatchable + retry-oltre-cap a 'pending'.
 *
 * mapMatch() e il DB sono mockati: nessuna dipendenza da GraphHopper reale.
 *
 * NOTA: i test su drainStuckRetryBacklog, le guardie d'ingresso, il retry della
 * discovery/tracciamento "ultimo tentativo" e l'unit test di scheduler-retry
 * sono nel file gemello map-matching-job-retry.test.ts (split per il limite di
 * 600 righe per file, Task #5249).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

type Sample = {
  id: number;
  lat: number | null;
  lon: number | null;
  leanAngle: number | null;
  gforceX: number | null;
  gforceY: number | null;
  gforceZ: number | null;
};

// Stato condiviso pilotato dai test ──────────────────────────────────────────
const updateSetCalls: Array<Record<string, unknown>> = [];
let sampleQueue: Sample[][] = [];
let sampleIdx = 0;

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => sampleQueue[sampleIdx++] ?? []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: Record<string, unknown>) => {
        updateSetCalls.push(payload);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  },
  withDbRetry: vi.fn(async (fn: () => unknown) => fn()),
  // scheduler-retry importa isTransientDbError da "../db": di default NON transitorio
  // (i test che vogliono la classificazione "ritentabile" usano gli errori del
  // bg-db-limiter, riconosciuti per nome/istanza).
  isTransientDbError: vi.fn(() => false),
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// scheduler-retry fa `err instanceof BgDbSlowKillSwitchError`: le classi DEVONO
// esistere nel mock o l'instanceof lancia. Definite DENTRO la factory (la factory
// è hoisted: non può riferire variabili esterne non-`mock*`). Sono normali Error
// con `name` settato, riconosciute anche dal controllo per-nome.
vi.mock("../lib/bg-db-limiter", () => {
  class BgDbSlowKillSwitchError extends Error {
    constructor(msg?: string) { super(msg); this.name = "BgDbSlowKillSwitchError"; }
  }
  class BgDbQueueOverflowError extends Error {
    constructor(msg?: string) { super(msg); this.name = "BgDbQueueOverflowError"; }
  }
  class BgDbQueueTimeoutError extends Error {
    constructor(msg?: string) { super(msg); this.name = "BgDbQueueTimeoutError"; }
  }
  return {
    withBgDbSlot: vi.fn(async (fn: () => unknown) => fn()),
    BgDbSlowKillSwitchError,
    BgDbQueueOverflowError,
    BgDbQueueTimeoutError,
  };
});

vi.mock("../graphhopper-client", () => ({
  mapMatch: vi.fn(),
  isSelfHosted: true,
}));

vi.mock("../routing/routing-kill-switch", () => ({
  isRoutingEnabled: vi.fn(async () => true),
}));

vi.mock("../lib/thinkcentre-powered-off", () => ({
  isThinkCentrePoweredOff: vi.fn(async () => false),
}));

vi.mock("../storage", () => ({
  storage: {
    upsertAppSetting: vi.fn(async () => undefined),
    getAppSetting: vi.fn(async () => ({ value: null })),
  },
}));

import { db } from "../db";
import { mapMatch } from "../graphhopper-client";
import { isRoutingEnabled } from "../routing/routing-kill-switch";
import { runMapMatchingJob, requeueUnmatchable } from "../map-matching-job";
import { isThinkCentrePoweredOff } from "../lib/thinkcentre-powered-off";

const dbExecute = vi.mocked(db.execute);
const mapMatchMock = vi.mocked(mapMatch);
const isRoutingEnabledMock = vi.mocked(isRoutingEnabled);
const isPoweredOffMock = vi.mocked(isThinkCentrePoweredOff);
const dialect = new PgDialect();

type Row = { session_id: string; sample_count: string; attempts?: number };

/** Imposta il risultato della query di discovery (primo db.execute del job). */
function setDiscovery(rows: Row[]): void {
  dbExecute.mockResolvedValueOnce({ rows } as unknown as Awaited<ReturnType<typeof db.execute>>);
}

/** Imposta i campioni restituiti dal db.select per le sessioni, in ordine. */
function setSamples(...sessions: Sample[][]): void {
  sampleQueue = sessions;
  sampleIdx = 0;
}

function sample(id: number, leanAngle: number | null = 25): Sample {
  return { id, lat: 45 + id * 0.001, lon: 9 + id * 0.001, leanAngle, gforceX: 0.1, gforceY: 0.2, gforceZ: 1 };
}

/** Renderizza un oggetto SQL drizzle in `{ sql, params }` per le asserzioni. */
function render(sqlObj: unknown): { sql: string; params: unknown[] } {
  return dialect.sqlToQuery(sqlObj as Parameters<PgDialect["sqlToQuery"]>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  updateSetCalls.length = 0;
  sampleQueue = [];
  sampleIdx = 0;
  dbExecute.mockReset();
  // Default: la discovery (e ogni execute non sovrascritto) non restituisce righe.
  dbExecute.mockResolvedValue({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);
  mapMatchMock.mockReset();
  isRoutingEnabledMock.mockResolvedValue(true);
  isPoweredOffMock.mockReset();
  isPoweredOffMock.mockResolvedValue(false);
  process.env.MAP_MATCHING_MAX_ATTEMPTS = "5";
  process.env.MAP_MATCHING_RETRY_BASE_MIN = "60";
  process.env.MAP_MATCHING_BATCH_RIDE = "50";
  delete process.env.DISABLE_MAP_MATCHING;
  // Backoff scheduler quasi-istantaneo nei test (no attese reali).
  process.env.SCHEDULER_RETRY_MAX_ATTEMPTS = "3";
  process.env.SCHEDULER_RETRY_BASE_MS = "1";
  process.env.SCHEDULER_RETRY_MAX_MS = "2";
});

// ─── Classificazione ────────────────────────────────────────────────────────
describe("runMapMatchingJob — classificazione esito", () => {
  it("sessione con <2 punti GPS → unmatchable (mapMatch non viene chiamato)", async () => {
    setDiscovery([{ session_id: "s1", sample_count: "1" }]);
    setSamples([sample(1)]);

    const res = await runMapMatchingJob();

    expect(mapMatchMock).not.toHaveBeenCalled();
    expect(res.unmatchable).toBe(1);
    expect(res.processed).toBe(0);
    expect(res.retry).toBe(0);
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toMatchObject({ matchStatus: "unmatchable", matched: false });
  });

  it("errore GraphHopper → retry con match_attempts incrementato", async () => {
    setDiscovery([{ session_id: "s2", sample_count: "2" }]);
    setSamples([sample(1), sample(2)]);
    mapMatchMock.mockRejectedValue(new Error("GraphHopper 503 unavailable"));

    const res = await runMapMatchingJob();

    expect(mapMatchMock).toHaveBeenCalledTimes(1);
    expect(res.retry).toBe(1);
    expect(res.processed).toBe(0);
    expect(res.unmatchable).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("s2");

    expect(updateSetCalls).toHaveLength(1);
    const payload = updateSetCalls[0];
    expect(payload.matchStatus).toBe("retry");
    expect(payload.matched).toBe(false);
    // match_attempts = match_attempts + 1 → espressione SQL drizzle
    expect(render(payload.matchAttempts).sql).toContain("+ 1");
  });

  it("errore GraphHopper al cap tentativi → stato terminale 'exhausted'", async () => {
    // attempts=4 con cap=5: il prossimo errore porta a 4+1=5 ≥ cap → 'exhausted'
    // (esce dal backlog pending+retry, non viene più ritentato in automatico).
    setDiscovery([{ session_id: "s-cap", sample_count: "2", attempts: 4 }]);
    setSamples([sample(1), sample(2)]);
    mapMatchMock.mockRejectedValue(new Error("GraphHopper 503 unavailable"));

    const res = await runMapMatchingJob();

    expect(mapMatchMock).toHaveBeenCalledTimes(1);
    expect(res.processed).toBe(0);
    // Lo stato PERSISTITO è terminale 'exhausted' (esce dal backlog pending+retry):
    // è questa la differenza chiave dal caso retry, non il contatore di esito.
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toMatchObject({ matchStatus: "exhausted", matched: false });
  });

  it("errore GraphHopper sotto al cap → resta 'retry' (non esaurito)", async () => {
    // attempts=3 con cap=5: 3+1=4 < cap → ancora 'retry'.
    setDiscovery([{ session_id: "s-sub", sample_count: "2", attempts: 3 }]);
    setSamples([sample(1), sample(2)]);
    mapMatchMock.mockRejectedValue(new Error("GraphHopper 503 unavailable"));

    const res = await runMapMatchingJob();

    expect(res.retry).toBe(1);
    expect(updateSetCalls[0]).toMatchObject({ matchStatus: "retry", matched: false });
  });

  it("match con segmenti OSM → matched + upsert in segment_telemetry", async () => {
    setDiscovery([{ session_id: "s3", sample_count: "2" }]);
    setSamples([sample(1, 20), sample(2, 30)]);
    mapMatchMock.mockResolvedValue({
      paths: [{ details: { osm_way_id: [[0, 2, 12345]] } }],
    } as unknown as Awaited<ReturnType<typeof mapMatch>>);

    const res = await runMapMatchingJob();

    expect(mapMatchMock).toHaveBeenCalledTimes(1);
    expect(res.processed).toBe(1);
    expect(res.segments).toBe(1);
    expect(res.unmatchable).toBe(0);
    expect(res.retry).toBe(0);

    // 2 execute: [0] discovery, [1] upsert segment_telemetry
    const upsertCall = dbExecute.mock.calls[1]?.[0];
    expect(render(upsertCall).sql.toLowerCase()).toContain("insert into segment_telemetry");

    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toMatchObject({ matchStatus: "matched", matched: true });
  });

  it("match senza segmenti OSM → unmatchable (nessun upsert)", async () => {
    setDiscovery([{ session_id: "s4", sample_count: "2" }]);
    setSamples([sample(1), sample(2)]);
    mapMatchMock.mockResolvedValue({
      paths: [{ details: { osm_way_id: [] } }],
    } as unknown as Awaited<ReturnType<typeof mapMatch>>);

    const res = await runMapMatchingJob();

    expect(res.unmatchable).toBe(1);
    expect(res.processed).toBe(0);
    expect(res.segments).toBe(0);
    // Nessun upsert: l'unico execute è la discovery
    expect(dbExecute).toHaveBeenCalledTimes(1);
    expect(updateSetCalls[0]).toMatchObject({ matchStatus: "unmatchable", matched: false });
  });
});

// ─── Idempotenza (no doppio conteggio) ──────────────────────────────────────
describe("runMapMatchingJob — idempotenza", () => {
  it("la discovery seleziona SOLO i campioni pending/retry (esclude matched/unmatchable)", async () => {
    setDiscovery([]);

    await runMapMatchingJob();

    const discoverySql = render(dbExecute.mock.calls[0]?.[0]).sql.toLowerCase();
    expect(discoverySql).toContain("from ride_telemetry");
    expect(discoverySql).toContain("match_status in ('pending', 'retry')");
    // Task #4706: la discovery riporta anche il MAX(match_attempts) per decidere
    // se al prossimo errore la sessione va 'retry' o terminale 'exhausted'.
    expect(discoverySql).toContain("max(match_attempts)");
  });

  it("batch vuoto (tutte le sessioni già matched) → nessuna aggregazione né update", async () => {
    setDiscovery([]); // nessuna sessione pending/retry

    const res = await runMapMatchingJob();

    expect(res.processed).toBe(0);
    expect(res.segments).toBe(0);
    expect(mapMatchMock).not.toHaveBeenCalled();
    // Solo la discovery, nessun upsert
    expect(dbExecute).toHaveBeenCalledTimes(1);
    expect(updateSetCalls).toHaveLength(0);
  });

  it("due run sulla stessa sessione: la 2ª non ri-aggrega (no doppio upsert)", async () => {
    const matchResult = {
      paths: [{ details: { osm_way_id: [[0, 2, 12345]] } }],
    } as unknown as Awaited<ReturnType<typeof mapMatch>>;

    // Run 1: la sessione è pending → match + 1 upsert in segment_telemetry.
    setDiscovery([{ session_id: "s6", sample_count: "2" }]);
    setSamples([sample(1, 20), sample(2, 30)]);
    mapMatchMock.mockResolvedValue(matchResult);
    const run1 = await runMapMatchingJob();
    expect(run1.processed).toBe(1);
    expect(run1.segments).toBe(1);

    // Run 2: la sessione è ora 'matched' → esclusa dalla discovery (batch vuoto).
    // Il default di db.execute restituisce {rows: []}, quindi nessuna ride.
    setSamples();
    const run2 = await runMapMatchingJob();
    expect(run2.processed).toBe(0);
    expect(run2.segments).toBe(0);

    // Conteggio upsert su entrambe le run: deve restare 1 (no doppio conteggio).
    const upserts = dbExecute.mock.calls.filter((c) =>
      render(c[0]).sql.toLowerCase().includes("insert into segment_telemetry"),
    );
    expect(upserts).toHaveLength(1);
    expect(mapMatchMock).toHaveBeenCalledTimes(1);
  });

  it("la lettura dei campioni filtra per stato pending/retry (no re-read dei matched)", async () => {
    // Sessione presente ma con 0 campioni pending/retry → trattata come unmatchable,
    // mai inviata a GraphHopper, dimostrando che i 'matched' non vengono ri-letti.
    setDiscovery([{ session_id: "s5", sample_count: "0" }]);
    setSamples([]);

    const res = await runMapMatchingJob();

    expect(mapMatchMock).not.toHaveBeenCalled();
    expect(res.unmatchable).toBe(1);
  });
});

// ─── Cap tentativi + backoff ────────────────────────────────────────────────
describe("runMapMatchingJob — cap tentativi e backoff", () => {
  it("la discovery filtra per cap tentativi e backoff esponenziale", async () => {
    process.env.MAP_MATCHING_MAX_ATTEMPTS = "3";
    process.env.MAP_MATCHING_RETRY_BASE_MIN = "45";
    setDiscovery([]);

    await runMapMatchingJob();

    const { sql, params } = render(dbExecute.mock.calls[0]?.[0]);
    const lower = sql.toLowerCase();
    expect(lower).toContain("match_attempts <");
    // Backoff esponenziale: NOW() - intervallo * 2^(tentativi-1)
    expect(lower).toContain("power(2, greatest(match_attempts - 1, 0))");
    expect(lower).toContain("last_match_attempt_at is null");
    // I parametri riflettono il cap e la base di backoff configurati
    expect(params).toContain(3);
    expect(params).toContain(45);
  });

  it("requeueUnmatchable() riporta a 'pending' unmatchable + retry oltre il cap", async () => {
    process.env.MAP_MATCHING_MAX_ATTEMPTS = "5";
    dbExecute.mockReset();
    dbExecute.mockResolvedValueOnce({
      rows: [
        { user_id: "u1", session_id: "a" },
        { user_id: "u2", session_id: "a" },
        { user_id: "u1", session_id: "a" },
        { user_id: "u1", session_id: "b" },
      ],
    } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await requeueUnmatchable();

    expect(res.requeuedSamples).toBe(3);
    expect(res.requeuedSessions).toBe(3);

    const { sql, params } = render(dbExecute.mock.calls[0]?.[0]);
    const lower = sql.toLowerCase();
    expect(lower).toContain("update ride_telemetry");
    expect(lower).toContain("returning user_id, session_id");
    expect(lower).toContain("match_status = 'pending'");
    expect(lower).toContain("match_attempts = 0");
    expect(lower).toContain("matched = false");
    expect(lower).toContain("last_match_attempt_at = null");
    expect(lower).toContain("match_status = 'unmatchable'");
    expect(lower).toContain("match_attempts >=");
    // Il cap usato nella clausola retry è quello configurato
    expect(params).toContain(5);
  });

  it("requeueUnmatchable() senza sessioni bloccate → 0 requeue", async () => {
    dbExecute.mockReset();
    dbExecute.mockResolvedValueOnce({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await requeueUnmatchable();

    expect(res.requeuedSamples).toBe(0);
    expect(res.requeuedSessions).toBe(0);
  });

  it("requeueUnmatchable() include anche lo stato 'exhausted'", async () => {
    process.env.MAP_MATCHING_MAX_ATTEMPTS = "5";
    dbExecute.mockReset();
    dbExecute.mockResolvedValueOnce({ rows: [{ session_id: "x" }] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    await requeueUnmatchable();

    const lower = render(dbExecute.mock.calls[0]?.[0]).sql.toLowerCase();
    expect(lower).toContain("match_status = 'exhausted'");
    expect(lower).toContain("match_status = 'unmatchable'");
  });

  it("requeueUnmatchable() saltato quando il ThinkCentre è spento (no query)", async () => {
    isPoweredOffMock.mockResolvedValue(true);
    dbExecute.mockReset();

    const res = await requeueUnmatchable();

    expect(res).toMatchObject({ requeuedSamples: 0, requeuedSessions: 0, skipped: true, reason: "engine_offline" });
    // Guardia: nessuna scrittura sul DB quando l'engine è offline (eviterebbe solo
    // di ricreare il backlog).
    expect(dbExecute).not.toHaveBeenCalled();
  });
});

/**
 * Map Matching Job — guardie, drain backlog e retry/scheduler (Task #5249)
 *
 * Parte 2 dello split di map-matching-job.test.ts (limite 600 righe/file).
 * Vedi quel file per la classificazione esito, l'idempotenza e il cap
 * tentativi/backoff di runMapMatchingJob()/requeueUnmatchable().
 *
 * Copre:
 *   - drainStuckRetryBacklog(): porta a 'exhausted' le sessioni 'retry' oltre il cap.
 *   - Guardie d'ingresso: kill-switch del routing.
 *   - Retry della discovery (withSchedulerRetry) + tracciamento "ultimo tentativo"
 *     via storage.upsertAppSetting (MAP_MATCHING_LAST_ATTEMPT_KEY).
 *   - Unit test dell'helper scheduler-retry (isRetryableSchedulerError,
 *     withSchedulerRetry).
 *
 * mapMatch() e il DB sono mockati: nessuna dipendenza da GraphHopper reale.
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
import {
  runMapMatchingJob,
  drainStuckRetryBacklog,
  MAP_MATCHING_LAST_ATTEMPT_KEY,
} from "../map-matching-job";
import { isThinkCentrePoweredOff } from "../lib/thinkcentre-powered-off";
import { storage } from "../storage";
import {
  isRetryableSchedulerError,
  withSchedulerRetry,
  type JobAttempt,
} from "../lib/scheduler-retry";
import { BgDbSlowKillSwitchError, BgDbQueueOverflowError } from "../lib/bg-db-limiter";

const dbExecute = vi.mocked(db.execute);
const upsertAppSettingMock = vi.mocked(storage.upsertAppSetting);

/** Estrae l'ultimo JobAttempt scritto su `key` da storage.upsertAppSetting. */
function lastRecordedAttempt(key: string): JobAttempt | null {
  for (let i = upsertAppSettingMock.mock.calls.length - 1; i >= 0; i--) {
    const call = upsertAppSettingMock.mock.calls[i];
    if (call?.[0] === key && typeof call[1] === "string") {
      return JSON.parse(call[1] as string) as JobAttempt;
    }
  }
  return null;
}
const mapMatchMock = vi.mocked(mapMatch);
const isRoutingEnabledMock = vi.mocked(isRoutingEnabled);
const isPoweredOffMock = vi.mocked(isThinkCentrePoweredOff);
const dialect = new PgDialect();

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

// ─── Drain backlog "fantasma" (Task #4706) ──────────────────────────────────
describe("drainStuckRetryBacklog", () => {
  it("porta a 'exhausted' le sessioni 'retry' oltre il cap (RETURNING user_id, session_id)", async () => {
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

    const res = await drainStuckRetryBacklog();

    expect(res.drainedSamples).toBe(3);
    expect(res.drainedSessions).toBe(3);

    const { sql, params } = render(dbExecute.mock.calls[0]?.[0]);
    const lower = sql.toLowerCase();
    expect(lower).toContain("update ride_telemetry");
    expect(lower).toContain("returning user_id, session_id");
    expect(lower).toContain("match_status = 'exhausted'");
    expect(lower).toContain("match_status = 'retry'");
    expect(lower).toContain("match_attempts >=");
    // Idempotente: usa il cap configurato.
    expect(params).toContain(5);
  });

  it("nessuna sessione bloccata → 0 drained", async () => {
    dbExecute.mockReset();
    dbExecute.mockResolvedValueOnce({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await drainStuckRetryBacklog();

    expect(res.drainedSamples).toBe(0);
    expect(res.drainedSessions).toBe(0);
  });
});

// ─── Guardie d'ingresso ─────────────────────────────────────────────────────
describe("runMapMatchingJob — guardie", () => {
  it("routing kill-switch attivo → job saltato, nessuna query", async () => {
    isRoutingEnabledMock.mockResolvedValue(false);

    const res = await runMapMatchingJob();

    expect(res.errors).toContain("Routing kill-switch active");
    expect(dbExecute).not.toHaveBeenCalled();
    expect(mapMatchMock).not.toHaveBeenCalled();
  });
});

// ─── Retry sulla discovery + tracciamento "ultimo tentativo" (Task #5249) ────
describe("runMapMatchingJob — retry discovery & last-attempt", () => {
  it("rigetto transitorio sulla discovery → retry e poi successo (no lavoro duplicato)", async () => {
    // 1° execute (discovery) fallisce con un errore ritentabile del bg-db-limiter,
    // il 2° (retry) restituisce un batch VUOTO → il giro completa con successo.
    dbExecute.mockReset();
    dbExecute
      .mockRejectedValueOnce(new BgDbSlowKillSwitchError("DB lento: kill-switch bg"))
      .mockResolvedValue({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await runMapMatchingJob();

    // La discovery è stata ritentata una volta (2 chiamate execute totali).
    expect(dbExecute).toHaveBeenCalledTimes(2);
    // Nessun errore propagato nel risultato: il retry ha avuto successo.
    expect(res.errors).toHaveLength(0);
    // Idempotenza: batch vuoto → nessun lavoro di matching duplicato.
    expect(mapMatchMock).not.toHaveBeenCalled();
    expect(res.processed).toBe(0);

    // L'ultimo tentativo è registrato come ok con retries=1.
    const attempt = lastRecordedAttempt(MAP_MATCHING_LAST_ATTEMPT_KEY);
    expect(attempt).not.toBeNull();
    expect(attempt?.ok).toBe(true);
    expect(attempt?.retries).toBe(1);
    expect(attempt?.error).toBeNull();
  });

  it("discovery fallisce tutti i tentativi → catch esterno registra ok:false con errore", async () => {
    dbExecute.mockReset();
    dbExecute.mockRejectedValue(new BgDbQueueOverflowError("coda bg piena"));

    const res = await runMapMatchingJob();

    // maxAttempts=3 → 2 retry prima del throw finale: 3 chiamate execute.
    expect(dbExecute).toHaveBeenCalledTimes(3);
    // Il fallimento fatale è riflesso nel risultato.
    expect(res.errors.some((e) => e.startsWith("Fatal:"))).toBe(true);

    // L'ultimo tentativo è SEMPRE registrato, anche su fallimento (ok:false).
    const attempt = lastRecordedAttempt(MAP_MATCHING_LAST_ATTEMPT_KEY);
    expect(attempt).not.toBeNull();
    expect(attempt?.ok).toBe(false);
    expect(attempt?.retries).toBe(2);
    expect(attempt?.error).toContain("coda bg piena");
  });

  it("errore NON ritentabile sulla discovery → nessun retry, fallimento immediato", async () => {
    dbExecute.mockReset();
    dbExecute.mockRejectedValue(new Error("errore applicativo non transitorio"));

    const res = await runMapMatchingJob();

    // Nessun retry: una sola chiamata, poi propagazione al catch esterno.
    expect(dbExecute).toHaveBeenCalledTimes(1);
    expect(res.errors.some((e) => e.startsWith("Fatal:"))).toBe(true);

    const attempt = lastRecordedAttempt(MAP_MATCHING_LAST_ATTEMPT_KEY);
    expect(attempt?.ok).toBe(false);
    expect(attempt?.retries).toBe(0);
  });
});

// ─── Unit: scheduler-retry helper (Task #5249) ──────────────────────────────
describe("scheduler-retry helper", () => {
  it("isRetryableSchedulerError: ritentabile per i rigetti del bg-db-limiter", () => {
    expect(isRetryableSchedulerError(new BgDbSlowKillSwitchError("x"))).toBe(true);
    expect(isRetryableSchedulerError(new BgDbQueueOverflowError("y"))).toBe(true);
    // Riconosciuto anche per nome (errori serializzati/cross-realm).
    const byName = Object.assign(new Error("z"), { name: "BgDbQueueTimeoutError" });
    expect(isRetryableSchedulerError(byName)).toBe(true);
  });

  it("isRetryableSchedulerError: NON ritentabile per errori applicativi generici", () => {
    expect(isRetryableSchedulerError(new Error("boom"))).toBe(false);
    expect(isRetryableSchedulerError("stringa")).toBe(false);
    expect(isRetryableSchedulerError(null)).toBe(false);
  });

  it("withSchedulerRetry: ritenta gli errori transitori finché ha successo", async () => {
    let calls = 0;
    const onRetry = vi.fn();
    const result = await withSchedulerRetry(
      async () => {
        calls++;
        if (calls < 3) throw new BgDbSlowKillSwitchError("ancora lento");
        return "ok";
      },
      { baseDelayMs: 1, maxDelayMs: 2, maxAttempts: 5, onRetry },
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("withSchedulerRetry: propaga subito gli errori non ritentabili (1 sola esecuzione)", async () => {
    let calls = 0;
    await expect(
      withSchedulerRetry(
        async () => {
          calls++;
          throw new Error("bug applicativo");
        },
        { baseDelayMs: 1, maxAttempts: 5 },
      ),
    ).rejects.toThrow("bug applicativo");
    expect(calls).toBe(1);
  });

  it("withSchedulerRetry: si arrende dopo maxAttempts e rilancia l'ultimo errore", async () => {
    let calls = 0;
    await expect(
      withSchedulerRetry(
        async () => {
          calls++;
          throw new BgDbSlowKillSwitchError("sempre lento");
        },
        { baseDelayMs: 1, maxDelayMs: 2, maxAttempts: 3 },
      ),
    ).rejects.toThrow("sempre lento");
    expect(calls).toBe(3);
  });
});

/**
 * Vacuum smart — verifica retry sull'acquisizione connessione + tracciamento
 * "ultimo tentativo" (Task #5249).
 *
 * Copre runVacuumSmart() con bg-db-limiter e storage mockati:
 *   - FASE 1 (acquisizione connessione) RITENTABILE: un rigetto transitorio del
 *     bg-db-limiter viene ritentato con backoff e poi riesce; il loop per-tabella
 *     gira UNA sola volta (no replay delle tabelle già vacuumate).
 *   - Su successo: scrive last-run + last-attempt ok:true.
 *   - Acquisizione che fallisce TUTTI i tentativi → catch esterno registra
 *     ok:false con errore, e il loop per-tabella NON parte mai.
 *
 * withBgDbConnection e storage sono mockati: nessuna dipendenza dal DB reale.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Stato condiviso pilotato dai test ──────────────────────────────────────────
let connectionCalls = 0;
const queries: string[] = [];

vi.mock("../db", () => ({
  db: { execute: vi.fn() },
  withDbRetry: vi.fn(async (fn: () => unknown) => fn()),
  isTransientDbError: vi.fn(() => false),
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// withBgDbConnection: simula l'acquisizione di una connessione bg. Le classi
// d'errore DEVONO esistere (scheduler-retry fa `err instanceof ...`); definite
// dentro la factory (hoisted).
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
  const fakeClient = {
    query: vi.fn(async (text: string) => {
      // size probe / bloat probe / SELECT 1 / VACUUM ...
      if (/pg_total_relation_size/i.test(text)) return { rows: [{ size: "1000" }] };
      if (/pg_stat_user_tables/i.test(text)) return { rows: [{ dead: "0", live: "100" }] };
      return { rows: [] };
    }),
  };
  return {
    withBgDbConnection: vi.fn(async (fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    BgDbSlowKillSwitchError,
    BgDbQueueOverflowError,
    BgDbQueueTimeoutError,
  };
});

vi.mock("../storage", () => ({
  storage: {
    upsertAppSetting: vi.fn(async () => undefined),
    getAppSetting: vi.fn(async () => ({ value: null })),
  },
}));

import { runVacuumSmart, VACUUM_LAST_RUN_SETTING_KEY, VACUUM_LAST_ATTEMPT_SETTING_KEY, VACUUM_TABLES } from "../vacuum-service";
import { storage } from "../storage";
import { withBgDbConnection, BgDbSlowKillSwitchError, BgDbQueueOverflowError } from "../lib/bg-db-limiter";

const withBgDbConnectionMock = vi.mocked(withBgDbConnection);
const upsertAppSettingMock = vi.mocked(storage.upsertAppSetting);

interface JobAttempt {
  ts: string;
  ok: boolean;
  retries: number;
  error: string | null;
}

/** Estrae l'ultimo JobAttempt scritto su `key`. */
function lastRecordedAttempt(key: string): JobAttempt | null {
  for (let i = upsertAppSettingMock.mock.calls.length - 1; i >= 0; i--) {
    const call = upsertAppSettingMock.mock.calls[i];
    if (call?.[0] === key && typeof call[1] === "string") {
      return JSON.parse(call[1] as string) as JobAttempt;
    }
  }
  return null;
}

function settingWritten(key: string): boolean {
  return upsertAppSettingMock.mock.calls.some((c) => c[0] === key);
}

beforeEach(() => {
  vi.clearAllMocks();
  connectionCalls = 0;
  queries.length = 0;
  // Default: withBgDbConnection esegue la callback con il client finto.
  const fakeClient = {
    query: vi.fn(async (text: string) => {
      queries.push(text);
      if (/pg_total_relation_size/i.test(text)) return { rows: [{ size: "1000" }] };
      if (/pg_stat_user_tables/i.test(text)) return { rows: [{ dead: "0", live: "100" }] };
      return { rows: [] };
    }),
  };
  withBgDbConnectionMock.mockImplementation(async (fn: (c: typeof fakeClient) => unknown) => {
    connectionCalls++;
    return fn(fakeClient) as never;
  });
  process.env.SCHEDULER_RETRY_MAX_ATTEMPTS = "3";
  process.env.SCHEDULER_RETRY_BASE_MS = "1";
  process.env.SCHEDULER_RETRY_MAX_MS = "2";
});

describe("runVacuumSmart — retry acquisizione & last-attempt", () => {
  it("giro normale → vacuum di tutte le tabelle + last-run e last-attempt ok", async () => {
    const res = await runVacuumSmart();

    expect(res).toBe("executed");
    // Una probe-connection (fase 1) + una connection per il loop (fase 2).
    expect(connectionCalls).toBe(2);
    // Ogni tabella ha ricevuto un VACUUM (ANALYZE di default, bloat=0).
    const vacuumQueries = queries.filter((q) => /^VACUUM/i.test(q.trim()));
    expect(vacuumQueries).toHaveLength(VACUUM_TABLES.length);

    // Last-run (ultimo successo) e last-attempt ok:true scritti.
    expect(settingWritten(VACUUM_LAST_RUN_SETTING_KEY)).toBe(true);
    const attempt = lastRecordedAttempt(VACUUM_LAST_ATTEMPT_SETTING_KEY);
    expect(attempt?.ok).toBe(true);
    expect(attempt?.retries).toBe(0);
    expect(attempt?.error).toBeNull();
  });

  it("rigetto transitorio sull'acquisizione → retry e poi successo (loop UNA sola volta)", async () => {
    const fakeClient = {
      query: vi.fn(async (text: string) => {
        queries.push(text);
        if (/pg_total_relation_size/i.test(text)) return { rows: [{ size: "1000" }] };
        if (/pg_stat_user_tables/i.test(text)) return { rows: [{ dead: "0", live: "100" }] };
        return { rows: [] };
      }),
    };
    // 1ª acquisizione (probe) rigettata, dalle successive in poi esegue la callback.
    withBgDbConnectionMock
      .mockRejectedValueOnce(new BgDbSlowKillSwitchError("kill-switch DB lento"))
      .mockImplementation(async (fn: (c: typeof fakeClient) => unknown) => {
        connectionCalls++;
        return fn(fakeClient) as never;
      });

    const res = await runVacuumSmart();

    expect(res).toBe("executed");
    // Probe ritentata: 1 reject + 1 probe ok + 1 loop = 2 esecuzioni effettive callback.
    expect(connectionCalls).toBe(2);
    // Il loop per-tabella gira UNA sola volta nonostante il retry sull'acquisizione.
    const vacuumQueries = queries.filter((q) => /^VACUUM/i.test(q.trim()));
    expect(vacuumQueries).toHaveLength(VACUUM_TABLES.length);

    const attempt = lastRecordedAttempt(VACUUM_LAST_ATTEMPT_SETTING_KEY);
    expect(attempt?.ok).toBe(true);
    expect(attempt?.retries).toBe(1);
  });

  it("acquisizione fallisce tutti i tentativi → ok:false e nessun VACUUM eseguito", async () => {
    withBgDbConnectionMock.mockRejectedValue(new BgDbQueueOverflowError("coda bg piena"));

    await expect(runVacuumSmart()).rejects.toThrow("coda bg piena");

    // Nessun VACUUM: la fase 2 non parte mai.
    const vacuumQueries = queries.filter((q) => /^VACUUM/i.test(q.trim()));
    expect(vacuumQueries).toHaveLength(0);
    // Last-run NON aggiornato (nessun successo), ma last-attempt registrato ok:false.
    expect(settingWritten(VACUUM_LAST_RUN_SETTING_KEY)).toBe(false);
    const attempt = lastRecordedAttempt(VACUUM_LAST_ATTEMPT_SETTING_KEY);
    expect(attempt?.ok).toBe(false);
    expect(attempt?.retries).toBe(2);
    expect(attempt?.error).toContain("coda bg piena");
  });

  it("errore NON ritentabile sull'acquisizione → nessun retry, fallimento immediato", async () => {
    withBgDbConnectionMock.mockRejectedValue(new Error("errore applicativo"));

    await expect(runVacuumSmart()).rejects.toThrow("errore applicativo");

    const attempt = lastRecordedAttempt(VACUUM_LAST_ATTEMPT_SETTING_KEY);
    expect(attempt?.ok).toBe(false);
    expect(attempt?.retries).toBe(0);
  });
});

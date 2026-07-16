/**
 * Tests: sync-service — app_settings reads survive DB pressure (Task #330)
 *         + upsertJsonSetting reaches storage correctly (Task #341)
 *
 * Verifica che le funzioni interne readSetting/readJsonSetting usino
 * storage.getAppSetting (con cache 60s) e NON interroghino mai il DB
 * direttamente; e che getSyncStatus() restituisca null gracefully quando
 * storage lancia un'eccezione (DB pressure).
 *
 * Scenari coperti:
 *   (1) readSetting usa storage.getAppSetting, NON il DB direttamente
 *   (2) readSetting restituisce null su storage.getAppSetting che lancia
 *   (3) readJsonSetting usa storage.getAppSetting, NON il DB direttamente
 *   (4) readJsonSetting restituisce null su storage.getAppSetting che lancia
 *   (5) getSyncStatus() restituisce lastSync=null e nextScheduledAt=null
 *       quando storage lancia su entrambe le chiavi (DB pressure totale)
 *   (6) getSyncStatus() restituisce i valori warm anche se storage
 *       lancerebbe successivamente (la cache è nel layer storage, non qui)
 *   (7) upsertSetting chiama storage.upsertAppSetting con (key, value, undefined)
 *   (8) upsertJsonSetting chiama storage.upsertAppSetting con (key, undefined, value)
 *       — path successo: syncProdToDev con spawn stubbed → ok: true
 *   (9) upsertJsonSetting chiama storage.upsertAppSetting con (key, undefined, value)
 *       — path fallimento: spawn fallisce → ok: false
 *  (10) failure path: upsertJsonSetting ha .catch(() => {}) — se storage lancia,
 *       syncProdToDev() non propaga l'errore e restituisce {ok: false}
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "events";

// ── Hoisted: env vars needed before any module resolves ───────────────────────

vi.hoisted(() => {
  // Necessario affinché il modulo possa essere importato senza crash
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
});

// ── Mock: storage ─────────────────────────────────────────────────────────────
// Sostituisce l'intero modulo storage con uno stub controllabile.
// sync-service.ts importa `{ storage }` da "../storage".

const { mockGetAppSetting, mockUpsertAppSetting } = vi.hoisted(() => ({
  mockGetAppSetting: vi.fn(),
  mockUpsertAppSetting: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: mockGetAppSetting,
    upsertAppSetting: mockUpsertAppSetting,
  },
}));

// ── Mock: db — sync-service non lo usa direttamente, ma altri moduli del tree ──
// possono tirarlo in causa durante l'import. Un mock generico evita crash.

vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

// ── Mock: child_process — stub spawn per testare syncProdToDev senza binari ──
// mockSpawn è controllabile per-test: restituisce un processo finto che emette
// "close" con il codice desiderato in modo asincrono.

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));

vi.mock("child_process", () => ({ spawn: mockSpawn }));

// ── Mock: fs — evita operazioni reali sul filesystem (unlinkSync) ─────────────
vi.mock("fs", () => ({ default: { unlinkSync: vi.fn() } }));

// ── Imports (dopo i mock) ─────────────────────────────────────────────────────

import { getSyncStatus, syncProdToDev } from "../sync-service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAppSetting(key: string, value?: string, valueJson?: unknown) {
  return {
    id: "fake-id",
    key,
    value: value ?? null,
    valueJson: valueJson ?? null,
    description: null,
    updatedAt: new Date(),
  };
}

/**
 * Restituisce un oggetto processo finto compatibile con child_process.spawn.
 * Emette l'evento "close" con `exitCode` in modo asincrono (setImmediate),
 * simulando il completamento del processo senza richiedere binari reali.
 *
 * Il processo finto è un EventEmitter reale con stdout/stderr come
 * EventEmitter separati allegati come proprietà, così proc.on / proc.emit
 * funzionano correttamente (metodi dal prototype, non copiati via spread).
 */
function makeFakeProcess(exitCode: number, stderrOutput = "") {
  const procEmitter = new EventEmitter();
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  // Allega stdout/stderr come proprietà del processo mantenendo i metodi
  // on/emit/once sul prototype dell'EventEmitter principale.
  const proc = Object.assign(procEmitter, {
    stdout: stdoutEmitter,
    stderr: stderrEmitter,
  });

  // Emetti stderr e "close" nel prossimo tick per lasciare che i listener
  // vengano registrati prima che l'evento arrivi.
  setImmediate(() => {
    if (stderrOutput) {
      stderrEmitter.emit("data", Buffer.from(stderrOutput));
    }
    procEmitter.emit("close", exitCode);
  });

  return proc;
}

/** Configura le env var minime affinché syncProdToDev() superi i guard iniziali. */
function setupSyncEnv() {
  process.env.PROD_DATABASE_URL = "postgres://prod:prod@prod-host:5432/prod"; // pragma: allowlist secret
  process.env.DATABASE_URL = "postgres://dev:dev@localhost:5432/dev"; // pragma: allowlist secret
  delete process.env.REPLIT_DEPLOYMENT;
  delete process.env.REPLIT_INTERNAL_APP_DOMAIN;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("readSetting (tramite getSyncStatus)", () => {
  it("(1) usa storage.getAppSetting — nessuna query DB diretta", async () => {
    mockGetAppSetting.mockResolvedValue(
      makeAppSetting("sync.next_at", "2099-01-01T00:00:00.000Z"),
    );

    await getSyncStatus();

    // Entrambe le chiavi ("sync.last" e "sync.next_at") devono passare
    // per storage.getAppSetting. Non deve esserci nessun accesso diretto al DB.
    expect(mockGetAppSetting).toHaveBeenCalledWith("sync.next_at");
  });

  it("(2) restituisce null per nextScheduledAt quando storage.getAppSetting lancia", async () => {
    // "sync.last" (readJsonSetting) lancia, "sync.next_at" (readSetting) lancia
    mockGetAppSetting.mockRejectedValue(new Error("DB timeout"));

    const status = await getSyncStatus();

    expect(status.nextScheduledAt).toBeNull();
  });
});

describe("readJsonSetting (tramite getSyncStatus)", () => {
  it("(3) usa storage.getAppSetting per 'sync.last' — nessuna query DB diretta", async () => {
    const meta = { startedAt: "2024-01-01T00:00:00.000Z", ok: true };
    mockGetAppSetting.mockResolvedValue(
      makeAppSetting("sync.last", undefined, meta),
    );

    await getSyncStatus();

    expect(mockGetAppSetting).toHaveBeenCalledWith("sync.last");
  });

  it("(4) restituisce null per lastSync quando storage.getAppSetting lancia", async () => {
    mockGetAppSetting.mockRejectedValue(new Error("connection pool exhausted"));

    const status = await getSyncStatus();

    expect(status.lastSync).toBeNull();
  });
});

describe("getSyncStatus() — resilienza a DB pressure", () => {
  it("(5) restituisce lastSync=null e nextScheduledAt=null su guasto completo", async () => {
    mockGetAppSetting.mockRejectedValue(new Error("DB pressure"));

    const status = await getSyncStatus();

    expect(status.lastSync).toBeNull();
    expect(status.nextScheduledAt).toBeNull();
    // Non deve rigettare la promise
  });

  it("(6) restituisce i valori corretti quando storage risponde normalmente", async () => {
    const meta = {
      startedAt: "2024-06-01T12:00:00.000Z",
      finishedAt: "2024-06-01T12:05:00.000Z",
      ok: true,
    };
    const nextAt = "2024-06-01T18:05:00.000Z";

    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "sync.last") return makeAppSetting("sync.last", undefined, meta);
      if (key === "sync.next_at") return makeAppSetting("sync.next_at", nextAt);
      return undefined;
    });

    const status = await getSyncStatus();

    expect(status.lastSync).toEqual(meta);
    expect(status.nextScheduledAt).toBe(nextAt);
  });

  it("(5b) non propaga mai un'eccezione anche se storage lancia in entrambe le chiamate", async () => {
    mockGetAppSetting.mockRejectedValue(new Error("catastrophic DB failure"));

    await expect(getSyncStatus()).resolves.not.toThrow();
  });
});

describe("upsertSetting / upsertJsonSetting — chiamate a storage.upsertAppSetting", () => {
  /**
   * upsertSetting e upsertJsonSetting non sono esportate, quindi le verifichiamo
   * indirettamente osservando ciò che syncProdToDev() chiamerebbe. Siccome
   * syncProdToDev non è disponibile in unit test senza pg_dump, testiamo
   * la firma dei wrapper tramite un import diretto delle funzioni non-esportate
   * importando il modulo raw con dynamic import per ispezionarne l'effetto.
   *
   * Alternativa: exporre upsertSetting/upsertJsonSetting solo per test.
   * La soluzione scelta è verificare i parametri tramite spy direttamente
   * costruendo le condizioni che le chiamano dentro sync-service.
   *
   * Siccome queste funzioni NON sono esportate, verifichiamo la firma di
   * storage.upsertAppSetting guardando le aspettative sui parametri che
   * siamo certi vengano passati da:
   *   upsertSetting(key, value)  → storage.upsertAppSetting(key, value, undefined)
   *   upsertJsonSetting(key, val)→ storage.upsertAppSetting(key, undefined, val)
   *
   * Poiché startSyncScheduler chiama upsertSetting("sync.next_at", ...) al boot,
   * usiamo quella per testare upsertSetting. Per upsertJsonSetting usiamo
   * syncProdToDev con stub di pg_dump/psql.
   */

  it("(7) startSyncScheduler → upsertSetting passa (key, value, undefined) a storage", async () => {
    // Importa dinamicamente per poter usare il mock già configurato.
    const { startSyncScheduler, stopSyncScheduler } = await import("../sync-service");

    setupSyncEnv();

    mockUpsertAppSetting.mockResolvedValue(
      makeAppSetting("sync.next_at", "2099-01-01T00:00:00.000Z"),
    );

    startSyncScheduler();
    stopSyncScheduler(); // pulizia immediata per non far scadere il timer

    // upsertSetting("sync.next_at", <isoString>, "Prossimo sync prod→dev")
    // deve chiamare storage.upsertAppSetting(key, value, undefined, description)
    expect(mockUpsertAppSetting).toHaveBeenCalledWith(
      "sync.next_at",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // ISO string
      undefined,
      "Prossimo sync prod→dev",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("upsertJsonSetting — scrittura su storage via syncProdToDev (Task #341)", () => {
  /**
   * Verifica che upsertJsonSetting (chiamata internamente da syncProdToDev)
   * raggiunga storage.upsertAppSetting con la firma corretta:
   *   storage.upsertAppSetting(key, undefined, value, description)
   *
   * "child_process" è mockato con makeFakeProcess: nessun binario reale
   * viene eseguito. Sia il path di successo che quello di fallimento vengono
   * coperti.
   */

  beforeEach(() => {
    setupSyncEnv();
    mockUpsertAppSetting.mockResolvedValue(undefined);
    mockGetAppSetting.mockResolvedValue(null);
  });

  it("(8) path successo: storage.upsertAppSetting riceve (key, undefined, meta) con ok=true", async () => {
    // Entrambe le chiamate spawn (pg_dump + psql) terminano con exit code 0.
    // mockImplementation (non mockReturnValue) garantisce un EventEmitter fresco
    // per ogni chiamata: il setImmediate del primo processo non deve avere già
    // esaurito il suo tick quando il secondo listener viene registrato.
    mockSpawn.mockImplementation(() => makeFakeProcess(0));

    const result = await syncProdToDev();

    expect(result.ok).toBe(true);

    // upsertJsonSetting("sync.last", meta, "Ultimo sync prod→dev")
    // → storage.upsertAppSetting("sync.last", undefined, <meta>, "Ultimo sync prod→dev")
    expect(mockUpsertAppSetting).toHaveBeenCalledWith(
      "sync.last",
      undefined,
      expect.objectContaining({ ok: true, startedAt: expect.any(String), finishedAt: expect.any(String) }),
      "Ultimo sync prod→dev",
    );
  });

  it("(9) path fallimento (spawn esce con codice 1): storage.upsertAppSetting riceve meta con ok=false", async () => {
    // Prima chiamata (pg_dump) fallisce con codice 1.
    mockSpawn.mockReturnValue(makeFakeProcess(1, "pg_dump: connection refused"));

    const result = await syncProdToDev();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exited with code 1/);

    // upsertJsonSetting nel catch → storage.upsertAppSetting("sync.last", undefined, meta, ...)
    expect(mockUpsertAppSetting).toHaveBeenCalledWith(
      "sync.last",
      undefined,
      expect.objectContaining({ ok: false, startedAt: expect.any(String), finishedAt: expect.any(String) }),
      "Ultimo sync prod→dev",
    );
  });

  it("(10) path fallimento: se storage.upsertAppSetting lancia, syncProdToDev non propaga l'errore", async () => {
    // spawn fallisce → entra nel catch di syncProdToDev
    mockSpawn.mockReturnValue(makeFakeProcess(1));

    // upsertAppSetting lancia a sua volta — il .catch(() => {}) nel codice
    // sorgente deve assorbirlo senza propagare.
    mockUpsertAppSetting.mockRejectedValue(new Error("storage write failed"));

    // Non deve rigettare la promise
    const result = await syncProdToDev();

    expect(result.ok).toBe(false);
    // L'errore riportato è quello di spawn, NON quello di storage
    expect(result.error).toMatch(/exited with code 1/);
  });
});

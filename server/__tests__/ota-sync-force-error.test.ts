/**
 * Task #837 — Regressione per il path di errore di forceSyncNow().
 *
 * forceSyncNow() azzera _lastSyncAt e _syncInFlight *prima* di chiamare
 * syncProductionUpdates(), ma non ha un .finally() guard. Se
 * syncProductionUpdates() lancia, _lastSyncAt resta 0 e _syncInFlight
 * resta null: nessun lock stuck. Questi test verificano che il
 * comportamento rimanga corretto a fronte di una futura regressione.
 *
 * Casi verificati:
 * 1. forceSyncNow() che lancia non aggiorna _lastSyncAt (il retry è
 *    possibile).
 * 2. Dopo un forceSyncNow() fallito, triggerSyncInBackground() non è
 *    bloccato né dal TTL né da _syncInFlight.
 *
 * Strategia: osservazione indiretta dello stato interno tramite
 * comportamento osservabile (fetch viene invocato o meno).
 * vi.resetModules() + import dinamico garantisce stato fresco per ogni test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

// Catena builder riusabile per il mock DB (stessa forma dei test esistenti)
function makeDbMock() {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
        })),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    },
    withDbRetry: <T>(fn: () => Promise<T> | T): Promise<T> | T => fn(),
  };
}

// Fetch che simula EAS 5xx (forceSyncNow/syncProductionUpdates lancerà)
function makeEas5xxFetch() {
  return vi.fn(async (url: string) => {
    if (typeof url === "string" && url.startsWith(EAS_GRAPHQL_URL)) {
      return {
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      } as unknown as Response;
    }
    throw new Error(`fetch inatteso: ${String(url)}`);
  });
}

// Fetch che risponde subito con branch vuoto (sync completa con successo)
function makeSuccessFetch() {
  return vi.fn(async (url: string) => {
    if (typeof url === "string" && url.startsWith(EAS_GRAPHQL_URL)) {
      return {
        ok: true,
        json: async () => ({ data: { app: { byId: { updateBranches: [] } } } }),
      } as unknown as Response;
    }
    throw new Error(`fetch inatteso: ${String(url)}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.doMock("../db", () => makeDbMock());
  vi.doMock("../ai/watchdog/log", () => ({
    writeWatchdogLog: vi.fn().mockResolvedValue(undefined),
  }));
  process.env.EAS_TOKEN = "test-token";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.EAS_TOKEN;
});

describe("forceSyncNow — error path non lascia lock stuck", () => {
  it("lancia quando syncProductionUpdates fallisce (EAS 5xx)", async () => {
    vi.stubGlobal("fetch", makeEas5xxFetch());

    const { forceSyncNow } = await import("../routes/admin/ota-sync");

    await expect(forceSyncNow()).rejects.toThrow(/EAS GraphQL HTTP 503/);
  });

  it("_lastSyncAt resta 0 dopo un forceSyncNow() fallito — il retry non è bloccato dal TTL", async () => {
    // Prima chiamata: EAS 5xx → forceSyncNow lancia
    vi.stubGlobal("fetch", makeEas5xxFetch());

    const { forceSyncNow, triggerSyncInBackground } = await import("../routes/admin/ota-sync");

    await expect(forceSyncNow()).rejects.toThrow();

    // Se _lastSyncAt fosse stato aggiornato, triggerSyncInBackground
    // vedrebbe Date.now() - _lastSyncAt < SYNC_TTL_MS e uscirebbe silenziosamente.
    // Con _lastSyncAt = 0 e Date.now() >> 0, il TTL check passa.
    // Verifica osservabile: triggerSyncInBackground deve chiamare fetch.
    const successFetch = makeSuccessFetch();
    vi.stubGlobal("fetch", successFetch);

    triggerSyncInBackground();

    // Flush microtask per permettere alla fetch di essere invocata
    await vi.advanceTimersByTimeAsync(0);

    expect(successFetch).toHaveBeenCalledTimes(1);
  });

  it("_syncInFlight è null dopo un forceSyncNow() fallito — triggerSyncInBackground non è bloccato dalla guard in-flight", async () => {
    // Questo test verifica che nessun "lock" resti stuck:
    // forceSyncNow azzera _syncInFlight all'inizio, e il throw non lo ripristina.
    // triggerSyncInBackground deve quindi passare la guard `if (_syncInFlight) return`.
    vi.stubGlobal("fetch", makeEas5xxFetch());

    const { forceSyncNow, triggerSyncInBackground } = await import("../routes/admin/ota-sync");

    await expect(forceSyncNow()).rejects.toThrow();

    // Seconda chiamata con sync che risponde correttamente
    const successFetch = makeSuccessFetch();
    vi.stubGlobal("fetch", successFetch);

    triggerSyncInBackground();
    await vi.advanceTimersByTimeAsync(0);

    // Se _syncInFlight fosse rimasto non-null, fetch non sarebbe stato chiamato
    expect(successFetch).toHaveBeenCalledTimes(1);
  });

  it("una seconda forceSyncNow() dopo un fallimento completa con successo", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url === "string" && url.startsWith(EAS_GRAPHQL_URL)) {
        callCount++;
        if (callCount === 1) {
          // Prima chiamata: 5xx
          return {
            ok: false,
            status: 503,
            text: async () => "Service Unavailable",
          } as unknown as Response;
        }
        // Seconda chiamata: successo
        return {
          ok: true,
          json: async () => ({ data: { app: { byId: { updateBranches: [] } } } }),
        } as unknown as Response;
      }
      throw new Error(`fetch inatteso: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { forceSyncNow } = await import("../routes/admin/ota-sync");

    // Prima chiamata: deve fallire
    await expect(forceSyncNow()).rejects.toThrow(/EAS GraphQL HTTP 503/);
    expect(callCount).toBe(1);

    // Seconda chiamata: deve riuscire (nessun lock stuck)
    const result = await forceSyncNow();
    expect(callCount).toBe(2);
    expect(result).toEqual({ inserted: 0, backfilled: 0 });
  });
});

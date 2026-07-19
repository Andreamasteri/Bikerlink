/**
 * Task #811 — Regressione per il timeout del sync background OTA.
 *
 * triggerSyncInBackground() ha un timeout di 60s (Task #804). Verifica che:
 * 1. Il timeout resetta _syncInFlight a null (nessun lock stuck dopo timeout)
 * 2. _lastSyncAt NON viene aggiornato su timeout (il prossimo tick può riprovare)
 * 3. Una seconda chiamata dopo il timeout avvia un nuovo sync
 *
 * Strategia: osservazione indiretta dello stato interno tramite comportamento
 * osservabile (conteggio chiamate fetch) evitando di esporre i privati del modulo.
 * vi.resetModules() + import dinamico garantisce stato fresco per ogni test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

// Catena builder riusabile per il mock DB (stessa forma dell'esistente dedup test)
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

// Crea un fetch che pende finché il signal non viene abortito, poi rigetta.
function makeHangingFetch(onAbort?: () => void) {
  return vi.fn((url: string, opts?: RequestInit) => {
    if (typeof url === "string" && url.startsWith(EAS_GRAPHQL_URL)) {
      return new Promise<Response>((_, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          onAbort?.();
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
        // Non risolve mai da sola — simula EAS lento oltre il timeout
      });
    }
    throw new Error(`fetch inatteso: ${String(url)}`);
  });
}

// Crea un fetch che risponde subito con branch vuoto (sync completa con successo)
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
  // doMock (non hoistato) applicato prima di ogni import dinamico nel test
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

describe("triggerSyncInBackground — timeout 60s e reset lock", () => {
  it("resetta _syncInFlight a null dopo il timeout (nessun lock stuck)", async () => {
    let abortFired = false;
    const fetchMock = makeHangingFetch(() => { abortFired = true; });
    vi.stubGlobal("fetch", fetchMock);

    // Import dinamico dopo resetModules+doMock → stato interno fresco
    const { triggerSyncInBackground } = await import("../routes/admin/ota-sync");

    // Prima chiamata: avvia il sync, fetch pende
    triggerSyncInBackground();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Avanza i timer di 60s: fa scattare il setTimeout interno che chiama controller.abort()
    // advanceTimersByTimeAsync flush anche le microtask intermedie (promise rejection chain)
    await vi.advanceTimersByTimeAsync(60_000);

    // Il segnale di abort deve essersi propagato all'interno di fetch
    expect(abortFired).toBe(true);

    // Ora _syncInFlight dovrebbe essere null.
    // Verifica osservabile: una seconda chiamata DEVE avviare un nuovo fetch
    // (se _syncInFlight != null, la guard "if (_syncInFlight) return" la ignorerebbe)
    const fetchMock2 = makeHangingFetch();
    vi.stubGlobal("fetch", fetchMock2);

    triggerSyncInBackground();
    expect(fetchMock2).toHaveBeenCalledTimes(1);
  });

  it("non aggiorna _lastSyncAt su timeout — il tick successivo non è bloccato dal TTL", async () => {
    const fetchMock = makeHangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { triggerSyncInBackground } = await import("../routes/admin/ota-sync");

    // Prima chiamata: pende
    triggerSyncInBackground();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Timeout scatta
    await vi.advanceTimersByTimeAsync(60_000);

    // Se _lastSyncAt fosse stato aggiornato al momento del timeout,
    // Date.now() - _lastSyncAt < SYNC_TTL_MS (60s) sarebbe TRUE → la seconda
    // chiamata verrebbe silenziata. Con fake timers Date.now() è avanzato di 60s.
    // Verifichiamo che la seconda chiamata NON venga bloccata dal TTL.
    const fetchMock2 = makeSuccessFetch();
    vi.stubGlobal("fetch", fetchMock2);

    triggerSyncInBackground();
    // Deve chiamare fetch (non bloccato dal TTL)
    expect(fetchMock2).toHaveBeenCalledTimes(1);
  });

  it("la seconda chiamata dopo il timeout avvia un sync completo", async () => {
    let callCount = 0;
    const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.startsWith(EAS_GRAPHQL_URL)) {
        callCount++;
        if (callCount === 1) {
          // Prima chiamata: pende fino all'abort
          return new Promise<Response>((_, reject) => {
            opts?.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          });
        }
        // Seconda chiamata: risolve subito con lista vuota
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { app: { byId: { updateBranches: [] } } } }),
        } as unknown as Response);
      }
      throw new Error(`fetch inatteso: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { triggerSyncInBackground } = await import("../routes/admin/ota-sync");

    // Prima chiamata: innesca il sync che va in timeout
    triggerSyncInBackground();
    expect(callCount).toBe(1);

    // Timeout: abort + cleanup del lock
    await vi.advanceTimersByTimeAsync(60_000);

    // Seconda chiamata: deve avviare un nuovo sync indipendente
    triggerSyncInBackground();
    // Flush microtask per permettere alla seconda fetch di completarsi
    await vi.advanceTimersByTimeAsync(0);

    expect(callCount).toBe(2);
  });
});

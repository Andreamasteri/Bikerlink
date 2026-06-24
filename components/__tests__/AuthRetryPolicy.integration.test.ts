/**
 * Integration test della policy di retry di AuthProvider.
 *
 * Usa il vero @tanstack/react-query (NON mockato): QueryClient + fetchQuery reali.
 * Invece di tentare il mount del componente (che in React 19 / Node senza jsdom
 * non propaga gli aggiornamenti di stato via act()), il test usa
 * `queryClient.fetchQuery()` che:
 *   - esegue la queryFn esattamente come useQuery in AuthProvider
 *   - rispetta `retry` e `retryDelay` passati nelle opzioni
 *   - permette di misurare il numero di tentativi effettivi con precisione
 *   - permette di verificare lo stato finale della query senza React state
 *
 * La retry config viene da `createAuthRetryConfig(hadSessionRef)` — la stessa
 * factory già cablata in AuthProvider — così il test verifica il comportamento
 * end-to-end con react-query reale, non solo la logica del predicato in isolamento.
 *
 * Contratto verificato:
 *   1. AbortError → fetchQuery finalizza dopo 1 sola chiamata (nessun retry).
 *   2. hadSession=false + errore rete → 1 sola chiamata (nessun retry).
 *   3. hadSession=true + errore rete → 4 chiamate totali (1 iniziale + 3 retry).
 *   4. I ritardi tra i retry seguono RETRY_DELAYS [2000, 5000, 10000].
 *   5. Nessuna promise appesa: fetchQuery si risolve (reject) entro i timer attesi.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── mock: moduli nativi importati da auth-context a livello top-level ──────────
// (necessari per importare createAuthRetryConfig senza dipendenze native)

vi.mock("@/lib/query-client", () => ({
  queryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn(), fetchQuery: vi.fn() },
  apiRequest: vi.fn(),
  apiRequestWithInitRetry: vi.fn(),
  getApiUrl: () => "https://example.test",
  setSessionToken: vi.fn(),
  clearSessionToken: vi.fn(),
  initSessionToken: vi.fn(async () => null),
  authFetchHeaders: () => ({}),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));
vi.mock("@/lib/startup-beacon", () => ({ sendStartupBeacon: vi.fn() }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  // Pass-through: solo useQuery e useMutation sono "rimappati" per il mount
  // nel test del componente; tutti gli altri export (QueryClient,
  // QueryClientProvider, ecc.) restano quelli reali.
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    // NOTA: NON sovrascriviamo QueryClient, QueryClientProvider, fetchQuery, ecc.
    // L'unico motivo per cui useQuery/useMutation vengono stub-bati in alcuni test
    // è impedire che mountino il provider nel contesto sbagliato. Qui NON li
    // sovrascriviamo: fetchQuery usa direttamente le API del QueryClient.
  };
});

// NOTE: @tanstack/react-query non è mockato — gli import di QueryClient e
// fetchQuery usano l'implementazione reale.
import { QueryClient } from "@tanstack/react-query";
import { createAuthRetryConfig, RETRY_DELAYS } from "@/lib/auth-context";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeAbortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

function makeNetworkError(): Error {
  return new Error("network_unavailable");
}

/** Advance fake timers and drain microtasks between steps. */
async function advanceBy(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

/** Build a fresh QueryClient for tests. */
function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── suite: integrazione con react-query reale (QueryClient.fetchQuery) ─────────

describe("AuthProvider retry policy — integrazione con react-query reale", () => {
  it("AbortError: fetchQuery finalizza dopo 1 sola chiamata (nessun retry)", async () => {
    const hadSessionRef = { current: false };
    const { retry, retryDelay } = createAuthRetryConfig(hadSessionRef);

    let fetchCount = 0;
    const qc = makeQC();

    const settled: { ok: boolean; error?: unknown } = { ok: false };
    qc.fetchQuery({
      queryKey: ["/api/auth/me"],
      queryFn: async () => {
        fetchCount++;
        throw makeAbortError();
      },
      retry,
      retryDelay,
    }).then(
      () => { settled.ok = true; },
      (e) => { settled.ok = false; settled.error = e; }
    );

    // No retry delay needed for AbortError — should settle after microtasks only
    await advanceBy(100);

    expect(fetchCount).toBe(1);
    expect(settled.error).toBeDefined();
    const qs = qc.getQueryState(["/api/auth/me"]);
    expect(qs?.status).toBe("error");
  });

  it("utente nuovo (hadSession=false): errore rete → 1 sola chiamata (nessun retry)", async () => {
    const hadSessionRef = { current: false };
    const { retry, retryDelay } = createAuthRetryConfig(hadSessionRef);

    let fetchCount = 0;
    const qc = makeQC();

    const settled: { ok: boolean; error?: unknown } = { ok: false };
    qc.fetchQuery({
      queryKey: ["/api/auth/me"],
      queryFn: async () => {
        fetchCount++;
        throw makeNetworkError();
      },
      retry,
      retryDelay,
    }).then(
      () => { settled.ok = true; },
      (e) => { settled.ok = false; settled.error = e; }
    );

    await advanceBy(200);

    expect(fetchCount).toBe(1);
    expect(settled.error).toBeDefined();
    const qs = qc.getQueryState(["/api/auth/me"]);
    expect(qs?.status).toBe("error");
  });

  it("utente con sessione (hadSession=true): 4 chiamate totali poi stop (1 + 3 retry)", async () => {
    const hadSessionRef = { current: true };
    const { retry, retryDelay } = createAuthRetryConfig(hadSessionRef);

    let fetchCount = 0;
    const qc = makeQC();

    let settled = false;
    qc.fetchQuery({
      queryKey: ["/api/auth/me"],
      queryFn: async () => {
        fetchCount++;
        throw makeNetworkError();
      },
      retry,
      retryDelay,
    }).catch(() => { settled = true; });

    // Initial attempt fires immediately
    await advanceBy(100);
    expect(fetchCount).toBe(1);

    // Advance through retry delays: 2000ms, 5000ms, 10000ms
    await advanceBy(RETRY_DELAYS[0] + 100);
    expect(fetchCount).toBe(2);

    await advanceBy(RETRY_DELAYS[1] + 100);
    expect(fetchCount).toBe(3);

    await advanceBy(RETRY_DELAYS[2] + 100);
    expect(fetchCount).toBe(4);

    // No further retries
    await advanceBy(15000);
    expect(fetchCount).toBe(4);

    expect(settled).toBe(true);
    const qs = qc.getQueryState(["/api/auth/me"]);
    expect(qs?.status).toBe("error");
  });

  it("i ritardi tra i retry seguono esattamente RETRY_DELAYS [2000, 5000, 10000]", async () => {
    const hadSessionRef = { current: true };
    const { retry, retryDelay } = createAuthRetryConfig(hadSessionRef);

    const callTimestamps: number[] = [];
    const qc = makeQC();

    qc.fetchQuery({
      queryKey: ["/api/auth/me"],
      queryFn: async () => {
        callTimestamps.push(Date.now());
        throw makeNetworkError();
      },
      retry,
      retryDelay,
    }).catch(() => {});

    await advanceBy(100);
    await advanceBy(RETRY_DELAYS[0] + 100);
    await advanceBy(RETRY_DELAYS[1] + 100);
    await advanceBy(RETRY_DELAYS[2] + 100);

    expect(callTimestamps).toHaveLength(4);
    // Each successive gap must be at least the configured delay
    expect(callTimestamps[1] - callTimestamps[0]).toBeGreaterThanOrEqual(RETRY_DELAYS[0]);
    expect(callTimestamps[2] - callTimestamps[1]).toBeGreaterThanOrEqual(RETRY_DELAYS[1]);
    expect(callTimestamps[3] - callTimestamps[2]).toBeGreaterThanOrEqual(RETRY_DELAYS[2]);
  });

  it("nessuna promise appesa: AbortError con hadSession=true finalizza senza retry", async () => {
    // AbortError must prevent retry even when hadSession=true, so the promise
    // settles quickly without advancing retry delays.
    const hadSessionRef = { current: true };
    const { retry, retryDelay } = createAuthRetryConfig(hadSessionRef);

    let fetchCount = 0;
    const qc = makeQC();

    let settled = false;
    qc.fetchQuery({
      queryKey: ["/api/auth/me"],
      queryFn: async () => {
        fetchCount++;
        throw makeAbortError();
      },
      retry,
      retryDelay,
    }).catch(() => { settled = true; });

    // Should settle immediately (no 2000ms+ retry delay required)
    await advanceBy(100);

    expect(fetchCount).toBe(1);
    expect(settled).toBe(true);

    // Make sure no delayed retry fires even after the full delay window
    await advanceBy(RETRY_DELAYS[0] + RETRY_DELAYS[1] + RETRY_DELAYS[2] + 1000);
    expect(fetchCount).toBe(1);
  });
});

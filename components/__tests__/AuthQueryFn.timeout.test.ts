/**
 * Test di robustezza avvio per il queryFn di bootstrap (/api/auth/me).
 *
 * CONTRATTO (anti-blocco spinner): se /api/auth/me non risponde, la query NON
 * deve restare appesa per sempre (→ schermo nero + spinner infinito). Un timeout
 * dedicato (AUTH_FETCH_TIMEOUT_MS) aborta il fetch e la query va in ERRORE, così
 * React Query può ritentare e l'UI può mostrare il fallback "Riprova".
 *
 * Distinzione critica testata qui:
 *  - abort-per-TIMEOUT  → errore ritentabile "network_unavailable" (no AbortError)
 *  - abort-per-CANCELLAZIONE query (es. unmount) → AbortError ri-lanciato, così il
 *    predicato `retry` di useQuery lo riconosce e NON ritenta.
 *
 * Strategia: createAuthQueryFn è estratto come factory pura (parametrizzata su
 * hadSessionRef + setSessionExpired). Mockiamo il `fetch` globale con una promise
 * che non risolve mai ma reagisce all'abort del signal, e usiamo i fake timers
 * per pilotare il timeout. query-client / AsyncStorage / react-native ecc. sono
 * mockati così l'import del modulo auth-context non trascina dipendenze native.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// ── mock: query-client (getApiUrl / authFetchHeaders + altri export usati) ───
vi.mock("@/lib/query-client", () => ({
  queryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn(), fetchQuery: vi.fn() },
  apiRequest: vi.fn(),
  apiRequestWithInitRetry: vi.fn(),
  getApiUrl: () => "https://example.test",
  setSessionToken: vi.fn(),
  clearSessionToken: vi.fn(),
  initSessionToken: vi.fn(),
  authFetchHeaders: () => ({}),
}));

// ── mock: dipendenze native / espo che auth-context importa a livello modulo ──
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
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

import { createAuthQueryFn, AUTH_FETCH_TIMEOUT_MS } from "@/lib/auth-context";

function abortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

// fetch che non risolve MAI da solo, ma rigetta con AbortError appena il signal
// passato viene abortito (riproduce il comportamento reale di fetch sull'abort).
function makeNeverResolvingFetch() {
  return vi.fn((_url: string, opts: { signal?: AbortSignal }) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = opts.signal;
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      signal?.addEventListener("abort", () => reject(abortError()), { once: true });
    });
  });
}

let originalFetch: typeof globalThis.fetch;
let hadSessionRef: { current: boolean };
let setSessionExpired: Mock<(v: boolean) => void>;

beforeEach(() => {
  vi.useFakeTimers();
  originalFetch = globalThis.fetch;
  hadSessionRef = { current: false };
  setSessionExpired = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("createAuthQueryFn — timeout di bootstrap (no spinner infinito)", () => {
  it("se il fetch non risolve mai, la query va in errore entro il timeout (niente promise appesa)", async () => {
    globalThis.fetch = makeNeverResolvingFetch() as unknown as typeof globalThis.fetch;
    const queryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });

    const promise = queryFn({});
    // Evita unhandled rejection prima dell'assert: alleghiamo subito un catch.
    const settled = promise.then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, err })
    );

    // Prima dello scadere del timeout la promise è ancora pendente.
    await vi.advanceTimersByTimeAsync(AUTH_FETCH_TIMEOUT_MS - 1);
    let resolvedEarly = false;
    await Promise.race([
      settled.then(() => { resolvedEarly = true; }),
      Promise.resolve(),
    ]);
    expect(resolvedEarly).toBe(false);

    // Allo scadere del timeout il fetch viene abortito → la query rigetta.
    await vi.advanceTimersByTimeAsync(2);
    const outcome = await settled;
    expect(outcome.ok).toBe(false);
  });

  it("l'abort-per-timeout produce un errore ritentabile 'network_unavailable' (non AbortError)", async () => {
    globalThis.fetch = makeNeverResolvingFetch() as unknown as typeof globalThis.fetch;
    const queryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });

    const settled = queryFn({}).then(
      () => null,
      (err: Error) => err
    );

    await vi.advanceTimersByTimeAsync(AUTH_FETCH_TIMEOUT_MS + 1);
    const err = (await settled) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("network_unavailable");
    // Deve NON essere un AbortError, altrimenti il predicato retry lo bloccherebbe.
    expect(err.name).not.toBe("AbortError");
  });

  it("l'abort-per-cancellazione query (signal esterno) ri-lancia AbortError (niente retry)", async () => {
    globalThis.fetch = makeNeverResolvingFetch() as unknown as typeof globalThis.fetch;
    const queryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });

    const external = new AbortController();
    const settled = queryFn({ signal: external.signal }).then(
      () => null,
      (err: Error) => err
    );

    // Cancellazione "esterna" (es. unmount) PRIMA dello scadere del timeout.
    external.abort();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);

    const err = (await settled) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AbortError");
    expect(err.message).not.toBe("network_unavailable");
  });

  it("se il signal esterno è già abortito all'ingresso, ri-lancia AbortError", async () => {
    globalThis.fetch = makeNeverResolvingFetch() as unknown as typeof globalThis.fetch;
    const queryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });

    const external = new AbortController();
    external.abort();
    const settled = queryFn({ signal: external.signal }).then(
      () => null,
      (err: Error) => err
    );
    await vi.advanceTimersByTimeAsync(1);

    const err = (await settled) as Error;
    expect(err.name).toBe("AbortError");
  });
});

describe("createAuthQueryFn — risposte del server (no timeout)", () => {
  it("su 401 restituisce null e marca sessionExpired solo se c'era una sessione", async () => {
    const okResponse = { status: 401, ok: false, json: async () => null } as unknown as Response;
    globalThis.fetch = vi.fn(async () => okResponse) as unknown as typeof globalThis.fetch;

    // Senza sessione precedente: nessun sessionExpired.
    hadSessionRef.current = false;
    let queryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });
    let result = await queryFn({});
    expect(result).toBeNull();
    expect(setSessionExpired).not.toHaveBeenCalled();

    // Con sessione precedente: sessionExpired=true.
    hadSessionRef.current = true;
    queryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });
    result = await queryFn({});
    expect(result).toBeNull();
    expect(setSessionExpired).toHaveBeenCalledWith(true);
  });

  it("su 5xx lancia un errore ritentabile (non AbortError)", async () => {
    const res = { status: 503, ok: false, json: async () => ({}) } as unknown as Response;
    globalThis.fetch = vi.fn(async () => res) as unknown as typeof globalThis.fetch;
    const queryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });

    await expect(queryFn({})).rejects.toThrow("server_error_503");
  });

  it("su 200 restituisce l'utente, marca la sessione e azzera sessionExpired", async () => {
    const user = { id: "u1", nickname: "rider" };
    const res = { status: 200, ok: true, json: async () => user } as unknown as Response;
    globalThis.fetch = vi.fn(async () => res) as unknown as typeof globalThis.fetch;
    hadSessionRef.current = false;
    const queryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });

    const result = await queryFn({});
    expect(result).toEqual(user);
    expect(hadSessionRef.current).toBe(true);
    expect(setSessionExpired).toHaveBeenCalledWith(false);
  });
});

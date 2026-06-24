/**
 * Test della POLICY di retry di useQuery nell'AuthProvider.
 *
 * CONTRATTO (anti-loop): il predicato `retry` deve:
 *  1. NON ritentare su AbortError (cancellazione query / unmount).
 *  2. NON ritentare con hadSessionRef=false (utente nuovo, nessuna sessione pregressa).
 *  3. Ritentare fino a 3 volte con hadSessionRef=true, poi fermarsi (authFailed=true).
 *
 * Una regressione qui (es. rimozione del guard sull'AbortError o su hadSessionRef)
 * reintrodurrebbe loop di retry o attese inutili percepite dall'utente come blocco.
 *
 * Strategia: createAuthRetryConfig è estratto come factory pura (parametrizzata su
 * hadSessionRef). Lo testiamo in isolamento: niente mount di componenti, niente
 * dipendenze native. I valori di ritardo (RETRY_DELAYS) sono testati separatamente.
 */

import { describe, it, expect } from "vitest";

// ── mock: tutte le dipendenze del modulo auth-context (stesso set del test timeout) ──
import { vi } from "vitest";

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

// ── suite: predicato retry ────────────────────────────────────────────────────

describe("createAuthRetryConfig — predicato retry", () => {
  it("AbortError → non ritenta mai (failureCount qualsiasi)", () => {
    const hadSessionRef = { current: false };
    const { retry } = createAuthRetryConfig(hadSessionRef);
    const err = makeAbortError();

    expect(retry(0, err)).toBe(false);
    expect(retry(1, err)).toBe(false);
    expect(retry(2, err)).toBe(false);
  });

  it("AbortError blocca il retry anche se hadSession=true", () => {
    const hadSessionRef = { current: true };
    const { retry } = createAuthRetryConfig(hadSessionRef);
    const err = makeAbortError();

    expect(retry(0, err)).toBe(false);
  });

  it("utente nuovo (hadSession=false) — errore di rete non ritenta mai", () => {
    const hadSessionRef = { current: false };
    const { retry } = createAuthRetryConfig(hadSessionRef);
    const err = makeNetworkError();

    expect(retry(0, err)).toBe(false);
    expect(retry(1, err)).toBe(false);
    expect(retry(2, err)).toBe(false);
  });

  it("utente con sessione (hadSession=true) — ritenta fino a 3 volte poi si ferma", () => {
    const hadSessionRef = { current: true };
    const { retry } = createAuthRetryConfig(hadSessionRef);
    const err = makeNetworkError();

    expect(retry(0, err)).toBe(true);
    expect(retry(1, err)).toBe(true);
    expect(retry(2, err)).toBe(true);
    expect(retry(3, err)).toBe(false);
    expect(retry(4, err)).toBe(false);
  });

  it("hadSessionRef è letto al momento della chiamata (ref mutable)", () => {
    const hadSessionRef = { current: false };
    const { retry } = createAuthRetryConfig(hadSessionRef);
    const err = makeNetworkError();

    expect(retry(0, err)).toBe(false);

    hadSessionRef.current = true;
    expect(retry(0, err)).toBe(true);
  });

  it("errore non-Error (valore generico) non rilancia, segue la logica hadSession", () => {
    const hadSessionRef = { current: false };
    const { retry } = createAuthRetryConfig(hadSessionRef);

    expect(retry(0, "stringa")).toBe(false);
    expect(retry(0, null)).toBe(false);
    expect(retry(0, undefined)).toBe(false);

    hadSessionRef.current = true;
    expect(retry(0, "stringa")).toBe(true);
    expect(retry(2, "stringa")).toBe(true);
    expect(retry(3, "stringa")).toBe(false);
  });
});

// ── suite: ritardi retry ──────────────────────────────────────────────────────

describe("createAuthRetryConfig — retryDelay", () => {
  it("usa la sequenza RETRY_DELAYS [2000, 5000, 10000] per i primi tre tentativi", () => {
    const hadSessionRef = { current: true };
    const { retryDelay } = createAuthRetryConfig(hadSessionRef);

    expect(retryDelay(0)).toBe(RETRY_DELAYS[0]);
    expect(retryDelay(1)).toBe(RETRY_DELAYS[1]);
    expect(retryDelay(2)).toBe(RETRY_DELAYS[2]);
  });

  it("oltre il terzo tentativo usa il fallback di 10000 ms", () => {
    const hadSessionRef = { current: true };
    const { retryDelay } = createAuthRetryConfig(hadSessionRef);

    expect(retryDelay(3)).toBe(10000);
    expect(retryDelay(10)).toBe(10000);
  });

  it("RETRY_DELAYS esportato ha i valori attesi [2000, 5000, 10000]", () => {
    expect(RETRY_DELAYS).toEqual([2000, 5000, 10000]);
  });
});

// ── suite: sequenza completa (simulazione ciclo react-query) ──────────────────

describe("createAuthRetryConfig — simulazione ciclo retry", () => {
  it("utente nuovo: 1 solo tentativo, nessun delay applicato", () => {
    const hadSessionRef = { current: false };
    const { retry, retryDelay } = createAuthRetryConfig(hadSessionRef);
    const err = makeNetworkError();

    const attempts: number[] = [];
    let failureCount = 0;

    while (retry(failureCount, err)) {
      attempts.push(retryDelay(failureCount));
      failureCount++;
    }

    expect(attempts).toHaveLength(0);
    expect(failureCount).toBe(0);
  });

  it("utente con sessione: 3 retry con i ritardi corretti, poi stop", () => {
    const hadSessionRef = { current: true };
    const { retry, retryDelay } = createAuthRetryConfig(hadSessionRef);
    const err = makeNetworkError();

    const delays: number[] = [];
    let failureCount = 0;

    while (retry(failureCount, err)) {
      delays.push(retryDelay(failureCount));
      failureCount++;
    }

    expect(failureCount).toBe(3);
    expect(delays).toEqual([2000, 5000, 10000]);
  });

  it("abort annulla la sequenza al primo tentativo anche con sessione attiva", () => {
    const hadSessionRef = { current: true };
    const { retry, retryDelay } = createAuthRetryConfig(hadSessionRef);
    const abortErr = makeAbortError();
    const netErr = makeNetworkError();

    const delays: number[] = [];
    let failureCount = 0;

    while (retry(failureCount, failureCount === 0 ? abortErr : netErr)) {
      delays.push(retryDelay(failureCount));
      failureCount++;
    }

    expect(failureCount).toBe(0);
    expect(delays).toHaveLength(0);
  });
});

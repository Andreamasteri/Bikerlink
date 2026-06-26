/**
 * Test del predicato di revalidation della sessione idratata da cache.
 *
 * CONTESTO (fix crash boot "Maximum update depth exceeded"):
 * al cold boot, se c'è una sessione pregressa, AuthProvider semina la query
 * ["/api/auth/me"] con l'utente in cache (setQueryData) PRIMA di abilitare la
 * query → /(tabs) monta con `user` già definito, niente transizione
 * undefined→defined che innescava la cascata setOptions di React Navigation.
 *
 * Poiché la query parte "fresh" (staleTime:Infinity) NON rifà fetch da sola:
 * un effect dedicato forza UN solo userQuery.refetch() a query ABILITATA per
 * validare la sessione contro il server. `shouldRevalidateHydratedSession` è il
 * predicato puro che governa quell'effect.
 *
 * REGRESSIONE GUARDATA: una prima versione lanciava la revalidation dentro lo
 * storage-load effect via queryClient.refetchQueries() mentre la query era
 * ancora enabled:false → refetchQueries NON rifà fetch su query disabilitate →
 * la sessione scaduta non veniva MAI validata. Il fix sposta la decisione qui.
 *
 * La seconda metà del contratto (refetch → 401 → null + sessionExpired) è già
 * coperta da AuthQueryFn.timeout.test.ts ("su 401 restituisce null e marca
 * sessionExpired solo se c'era una sessione"). Insieme i due test coprono la
 * catena completa: seed → revalidate una volta → 401 → null/sessionExpired.
 */

import { describe, it, expect, vi } from "vitest";

// ── mock: dipendenze native / query-client importate da auth-context a livello
//    modulo (necessario per importare il predicato senza trascinare nativi) ──
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

import { shouldRevalidateHydratedSession } from "@/lib/auth-context";

describe("shouldRevalidateHydratedSession — revalidation una-tantum della sessione idratata", () => {
  const base = {
    storageChecked: true,
    hadSession: true,
    didRevalidate: false,
    hasUser: true,
  };

  it("sessione seminata (storage letto + sessione pregressa + utente in cache, non ancora revalidato) → true", () => {
    expect(shouldRevalidateHydratedSession(base)).toBe(true);
  });

  it("già revalidato → false (niente secondo refetch, niente loop)", () => {
    expect(shouldRevalidateHydratedSession({ ...base, didRevalidate: true })).toBe(false);
  });

  it("nessun utente in cache → false (la query normale, enabled+no data, fa già il fetch)", () => {
    expect(shouldRevalidateHydratedSession({ ...base, hasUser: false })).toBe(false);
  });

  it("storage non ancora letto (query ancora disabilitata) → false", () => {
    expect(shouldRevalidateHydratedSession({ ...base, storageChecked: false })).toBe(false);
  });

  it("nessuna sessione pregressa (utente nuovo) → false", () => {
    expect(shouldRevalidateHydratedSession({ ...base, hadSession: false })).toBe(false);
  });
});

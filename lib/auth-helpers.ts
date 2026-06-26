/**
 * Helper puri dell'autenticazione, estratti da auth-context.tsx per restare
 * sotto il limite di 600 righe per file (gate ratchet). Contiene SOLO logica
 * pura/testabile — snapshot utente in cache, retry policy e queryFn di
 * bootstrap (/api/auth/me). Nessun componente React: AuthProvider/useAuth
 * restano in auth-context.tsx, che importa da qui.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryClient, apiRequest, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import type { User } from "@shared/db";
import { PENDING_ONBOARDING_TAGS_KEY } from "@/constants/onboarding";

export type SafeUser = Omit<User, "password">;

/**
 * Confronto shallow di due SafeUser. React Query restituisce un nuovo oggetto a
 * ogni refetch anche quando i dati sono identici: usiamo questo per mantenere
 * stabile la reference dell'utente esposta nel context (vedi stableUserRef) ed
 * evitare la cascata di re-render che innesca "Maximum update depth exceeded".
 * SafeUser è una riga DB piatta (Omit<User,"password">) → shallow su tutte le
 * chiavi è sufficiente e preserva la freschezza quando il contenuto cambia.
 */
export function shallowEqualSafeUser(
  a: SafeUser | null | undefined,
  b: SafeUser | null | undefined
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  const aKeys = Object.keys(a) as (keyof SafeUser)[];
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export const HAD_SESSION_KEY = "@bikerlink/had_session";
export const CACHED_USER_KEY = "@bikerlink/cached_user";

/**
 * Snapshot dell'ultimo utente autenticato, persistito in AsyncStorage.
 *
 * Serve a IDRATARE la query ["/api/auth/me"] PRIMA che il sottoalbero /(tabs)
 * venga montato, così l'app boota con un `user` reale invece di `undefined`.
 * È proprio la transizione `undefined → defined` (il mount ottimistico delle
 * tabs mentre il bootstrap auth è ancora in volo) la CAUSA STRUTTURALE del loop
 * "Maximum update depth exceeded" al boot Android: quando /api/auth/me risolve,
 * il value di AuthContext cambia e l'intero albero authed appena montato si
 * ri-renderizza nel suo momento più fragile → cascata setOptions di React
 * Navigation. Seminando la cache, quella transizione non avviene più.
 *
 * Lo snapshot è un SafeUser (mai password né token).
 */
export function persistCachedUser(user: SafeUser | null | undefined): void {
  if (user) {
    AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user)).catch(() => {});
  } else {
    AsyncStorage.removeItem(CACHED_USER_KEY).catch(() => {});
  }
}

export function parseCachedUser(raw: string | null): SafeUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { id?: unknown }).id != null
    ) {
      return parsed as SafeUser;
    }
  } catch {
    // snapshot corrotto → ignora, si ricade sul normale bootstrap
  }
  return null;
}

/**
 * After successful login/register, drain any tag selections the user picked
 * during pre-auth onboarding (see app/onboarding.tsx → OnboardingTagsStep).
 * Best-effort: failures are silent so they never block the auth flow.
 */
export async function drainPendingOnboardingTags(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(PENDING_ONBOARDING_TAGS_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let payload: Record<string, string[]> | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      payload = parsed as Record<string, string[]>;
    }
  } catch {
    payload = null;
  }

  // Always clear the key so we don't keep retrying on every login.
  try {
    await AsyncStorage.removeItem(PENDING_ONBOARDING_TAGS_KEY);
  } catch {
    // no-op
  }

  if (!payload) return;

  for (const [categorySlug, tagIds] of Object.entries(payload)) {
    if (!Array.isArray(tagIds) || tagIds.length === 0) continue;
    try {
      await apiRequest("PUT", "/api/users/me/tags", { categorySlug, tagIds });
    } catch {
      // best-effort: skip categories that fail
    }
  }
  queryClient.invalidateQueries({ queryKey: ["/api/users/me/tags"] });
}

// Retry delays: 2s, 5s, 10s
export const RETRY_DELAYS = [2000, 5000, 10000];

/**
 * Predicato puro: decide se lanciare la revalidation UNA-TANTUM della sessione
 * idratata da cache. Estratto come funzione pura (come createAuthQueryFn /
 * createAuthRetryConfig) per testarlo senza montare AuthProvider.
 *
 * Deve essere true SOLO quando: lo storage è stato letto (query già abilitata),
 * c'era una sessione pregressa, non abbiamo ancora revalidato, e c'è un utente
 * in cache (seed). In tutti gli altri casi la query normale (enabled, no data)
 * fa già il fetch da sola → niente doppio fetch, niente loop.
 */
export function shouldRevalidateHydratedSession(args: {
  storageChecked: boolean;
  hadSession: boolean;
  didRevalidate: boolean;
  hasUser: boolean;
}): boolean {
  return args.storageChecked && args.hadSession && !args.didRevalidate && args.hasUser;
}

/**
 * Factory del predicato `retry` e del `retryDelay` usati da useQuery in
 * AuthProvider. Estratto come funzione pura parametrizzata su hadSessionRef
 * così da poterlo testare in isolamento:
 *  - AbortError → no retry (cancellazione query / unmount)
 *  - hadSessionRef=false → no retry (utente nuovo, niente sessione pregressa)
 *  - hadSessionRef=true → fino a 3 tentativi poi authFailed=true
 */
export function createAuthRetryConfig(hadSessionRef: { current: boolean }) {
  return {
    retry: (failureCount: number, error: unknown): boolean => {
      if (error instanceof Error && error.name === "AbortError") return false;
      if (!hadSessionRef.current) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt: number): number => RETRY_DELAYS[attempt] ?? 10000,
  };
}

// Timeout sul fetch di bootstrap /api/auth/me: se il server di produzione è
// saturo/lento (pool DB saturo, ping multi-secondo) la richiesta verrebbe
// appesa all'infinito → userQuery.isLoading resta true → schermo nero +
// spinner. Allo scadere abortiamo: l'abort-per-timeout è ritentabile, l'abort
// per cancellazione della query (unmount) no.
export const AUTH_FETCH_TIMEOUT_MS = 13000;

interface AuthQueryFnDeps {
  hadSessionRef: { current: boolean };
  setSessionExpired: (v: boolean) => void;
}

/**
 * Factory del queryFn di bootstrap (/api/auth/me). Estratto come funzione pura
 * (parametrizzata sulle sole dipendenze stateful: hadSessionRef e
 * setSessionExpired) così da poterlo testare in isolamento — in particolare il
 * timeout dedicato e la distinzione abort-per-timeout (ritentabile) vs
 * abort-per-cancellazione (AbortError ri-lanciato, niente retry).
 */
export function createAuthQueryFn({ hadSessionRef, setSessionExpired }: AuthQueryFnDeps) {
  // Custom queryFn: returns null on 401 (triggers no retry), throws on network errors (triggers retry)
  return async ({ signal }: { signal?: AbortSignal }) => {
    const baseUrl = getApiUrl();
    const url = new URL("/api/auth/me", baseUrl);

    // Timeout dedicato: se /api/auth/me non risponde entro AUTH_FETCH_TIMEOUT_MS
    // abortiamo il fetch così la query va in errore (e può ritentare) invece di
    // restare appesa per sempre tenendo l'app sullo spinner su sfondo nero.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`auth_timeout_${AUTH_FETCH_TIMEOUT_MS}ms`));
    }, AUTH_FETCH_TIMEOUT_MS);
    // Inoltra l'eventuale cancellazione di React Query (es. unmount) al nostro
    // controller, così la query cancellata aborta come prima.
    if (signal) {
      const ext = signal as AbortSignal & { reason?: unknown };
      if (ext.aborted) {
        controller.abort(ext.reason);
      } else {
        ext.addEventListener("abort", () => controller.abort(ext.reason), { once: true });
      }
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: authFetchHeaders(),
        credentials: "include",
        signal: controller.signal
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // Timeout → trattalo come errore di rete così scatta il retry.
        // Cancellazione query (unmount) → ri-lancia AbortError: niente retry.
        if (timedOut) throw new Error("network_unavailable");
        throw err;
      }
      // Network error / ECONNREFUSED → throw to trigger React Query retry
      throw new Error("network_unavailable");
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      // Session expired or never logged in — return null (no retry needed)
      if (hadSessionRef.current) {
        setSessionExpired(true);
      }
      return null;
    }

    if (!res.ok) {
      // 5xx or other server errors → throw to trigger retry
      throw new Error(`server_error_${res.status}`);
    }

    const user = await res.json();
    // Successful auth — save marker and clear any expired flag
    hadSessionRef.current = true;
    AsyncStorage.setItem(HAD_SESSION_KEY, "true").catch(() => {});
    setSessionExpired(false);
    return user as SafeUser;
  };
}

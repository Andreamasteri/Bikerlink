import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import {
  queryClient,
  apiRequest,
  apiRequestWithInitRetry,
  getApiUrl,
  setSessionToken,
  clearSessionToken,
  initSessionToken,
  authFetchHeaders
} from "@/lib/query-client";
import type { User } from "@shared/db";
import { PENDING_ONBOARDING_TAGS_KEY } from "@/constants/onboarding";

type SafeUser = Omit<User, "password">;

/**
 * Confronto shallow di due SafeUser. React Query restituisce un nuovo oggetto a
 * ogni refetch anche quando i dati sono identici: usiamo questo per mantenere
 * stabile la reference dell'utente esposta nel context (vedi stableUserRef) ed
 * evitare la cascata di re-render che innesca "Maximum update depth exceeded".
 * SafeUser è una riga DB piatta (Omit<User,"password">) → shallow su tutte le
 * chiavi è sufficiente e preserva la freschezza quando il contenuto cambia.
 */
function shallowEqualSafeUser(
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

const HAD_SESSION_KEY = "@bikerlink/had_session";
const CACHED_USER_KEY = "@bikerlink/cached_user";

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
function persistCachedUser(user: SafeUser | null | undefined): void {
  if (user) {
    AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user)).catch(() => {});
  } else {
    AsyncStorage.removeItem(CACHED_USER_KEY).catch(() => {});
  }
}

function parseCachedUser(raw: string | null): SafeUser | null {
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
async function drainPendingOnboardingTags(): Promise<void> {
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

interface AuthContextValue {
  user: SafeUser | null | undefined;
  userId: SafeUser["id"] | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hadPreviousSession: boolean;
  sessionExpired: boolean;
  isReconnecting: boolean;
  authFailed: boolean;
  retryAuth: () => void;
  loginMutation: ReturnType<typeof useLoginMutation>;
  registerMutation: ReturnType<typeof useRegisterMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
}

function useLoginMutation() {
  return useMutation({
    mutationFn: async (data: { identifier: string; password: string; latitude?: number; longitude?: number; platform?: string }) => {
      // apiRequestWithInitRetry ritenta in modo trasparente sui 503 di init/boot
      // (ServerBusyError) rispettando il Retry-After, così durante la finestra di
      // avvio di una nuova istanza l'utente non vede "Server occupato".
      const res = await apiRequestWithInitRetry("POST", "/api/auth/login", { ...data, platform: Platform.OS });
      try {
        return await res.json();
      } catch {
        throw new Error("Errore di connessione al server. Riprova.");
      }
    },
    onSuccess: async (response: SafeUser & { sessionToken?: string }) => {
      // Persist Bearer token (mobile cookie-jar bypass) BEFORE any subsequent fetch
      if (response?.sessionToken) {
        await setSessionToken(response.sessionToken);
      }
      const { sessionToken: _t, ...user } = response;
      queryClient.setQueryData(["/api/auth/me"], user);
      sendStartupBeacon("auth_login_success", { userId: user?.id });
      AsyncStorage.setItem(HAD_SESSION_KEY, "true").catch(() => {});
      import("@/lib/sentry").then(s => s.setSentryUser({ id: user.id, email: user.email, username: user.nickname, role: user.role })).catch(() => {});
      // Clear the freshly-issued connect.sid cookie from the Android native jar
      if (Platform.OS === "android") {
        fetch(new URL("/api/auth/clear-session-cookie", getApiUrl()).toString(), {
          method: "POST",
          credentials: "include"
        }).catch(() => {});
      }
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key !== "/api/auth/me";
        }
      });
      drainPendingOnboardingTags().catch(() => {
        // no-op: best-effort
      });
      (async () => {
        try {
          await queryClient.fetchQuery({ queryKey: ["/api/settings/maps"] });
        } catch {
          // no-op: settings fetching best-effort
        }
        let profileLat: number | null = null;
        let profileLng: number | null = null;
        try {
          const profile = await queryClient.fetchQuery<{ latitude?: number | null; longitude?: number | null }>({
            queryKey: ["/api/users/profile"]
          });
          if (profile?.latitude != null && profile?.longitude != null) {
            profileLat = Number(profile.latitude);
            profileLng = Number(profile.longitude);
          }
        } catch {
          // no-op: profile fetching best-effort
        }
        const nearbyLat = profileLat ?? 41.9028;
        const nearbyLng = profileLng ?? 12.4964;
        try {
          await queryClient.fetchQuery({
            queryKey: ["/api/users/nearby", nearbyLat, nearbyLng, undefined],
            queryFn: async () => {
              const baseUrl = getApiUrl();
              const url = new URL("/api/users/nearby", baseUrl);
              url.searchParams.set("lat", nearbyLat.toString());
              url.searchParams.set("lng", nearbyLng.toString());
              const res = await fetch(url.toString(), {
                headers: authFetchHeaders(),
                credentials: "include"
              });
              if (!res.ok) return [];
              return res.json();
            }
          });
        } catch {
          // no-op: nearby fetching best-effort
        }
        apiRequest("POST", "/api/matching/trigger").catch(() => {
          // no-op: matching trigger best-effort
        });
      })();
    }
  });
}

function useRegisterMutation() {
  return useMutation({
    mutationFn: async (data: {
      nickname: string;
      email: string;
      phone?: string;
      password: string;
      userType: "biker" | "zavorrina" | "coppia";
      sex?: "M" | "F";
      coupleSexConfig?: "M+M" | "M+F" | "F+F";
      birthYear?: number;
      country?: string;
      region?: string;
      eulaAccepted: true;
      invitationCode?: string;
    }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      try {
        return await res.json();
      } catch {
        throw new Error("Errore di connessione al server. Riprova.");
      }
    },
    onSuccess: async (response: unknown) => {
      const res = response as { requiresEmailVerification?: boolean; sessionToken?: string; [key: string]: unknown };
      if (!res?.requiresEmailVerification) {
        // Persist Bearer token (mobile cookie-jar bypass) BEFORE any subsequent fetch
        if (res?.sessionToken) {
          await setSessionToken(res.sessionToken);
        }
        const { sessionToken: _t, ...user } = res;
        queryClient.setQueryData(["/api/auth/me"], user);
        AsyncStorage.setItem(HAD_SESSION_KEY, "true").catch(() => {});
        drainPendingOnboardingTags().catch(() => {
          // no-op: best-effort
        });
      }
      // Clear the freshly-issued connect.sid cookie from the Android native jar
      if (Platform.OS === "android") {
        fetch(new URL("/api/auth/clear-session-cookie", getApiUrl()).toString(), {
          method: "POST",
          credentials: "include"
        }).catch(() => {});
      }
    }
  });
}

function useLogoutMutation() {
  return useMutation({
    mutationFn: async () => {
      // 0. Close the current app session BEFORE destroying the server session,
      //    so the request is still authenticated and targets only this device.
      try {
        const { getCurrentSessionId, clearCurrentSessionId } = await import("@/components/layout/AppStateHandler");
        const sid = getCurrentSessionId();
        if (sid) {
          clearCurrentSessionId();
          await apiRequest("POST", "/api/sessions/end", { sessionId: sid, exitType: "logout" });
        }
      } catch {
        // best-effort: crash cleanup job handles any leftovers
      }

      // 1. Invalidate the server-side session FIRST — while the Bearer token
      //    is still present so the server can identify the session.
      let serverLogoutFailed = false;
      try {
        await apiRequest("POST", "/api/auth/logout");
      } catch {
        serverLogoutFailed = true;
        // Server logout failed; continue with local cleanup anyway.
        // The server session will expire naturally.
      }

      // 2. Wipe local credentials after the server call.
      await Promise.allSettled([
        clearSessionToken(),
        AsyncStorage.removeItem(HAD_SESSION_KEY),
        AsyncStorage.removeItem(CACHED_USER_KEY),
      ]);

      // 3. On Android, flush the connect.sid cookie from the native cookie jar.
      //    Best-effort with a 3 s timeout.
      if (Platform.OS === "android") {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 3000);
          await fetch(new URL("/api/auth/clear-session-cookie", getApiUrl()).toString(), {
            method: "POST",
            credentials: "include",
            signal: controller.signal
          });
          clearTimeout(tid);
        } catch {
          // Best-effort: Bearer token is already wiped, cookie jar is the only
          // residual risk and it expires server-side regardless.
        }
      }

      if (serverLogoutFailed) {
        console.warn("[Auth] Server logout failed — local credentials cleared, server session will expire naturally.");
      }
    },
    onSuccess: () => {
      // Credentials already wiped in mutationFn; reset the in-memory cache.
      queryClient.setQueryData(["/api/auth/me"], null);
      import("@/lib/sentry").then(s => s.setSentryUser(null)).catch(() => {});
    },
    onError: () => {
      // Reached only if Promise.allSettled itself throws (extremely unlikely).
      // Attempt cleanup as a last resort.
      Promise.allSettled([
        clearSessionToken(),
        AsyncStorage.removeItem(HAD_SESSION_KEY),
        AsyncStorage.removeItem(CACHED_USER_KEY),
      ]).catch(() => {});
      queryClient.setQueryData(["/api/auth/me"], null);
    }
  });
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionExpired, setSessionExpired] = useState(false);
  // true while we're loading AND we know the user had a session before
  const [isReconnecting, setIsReconnecting] = useState(false);
  const hadSessionRef = useRef<boolean>(false);

  // Prefetch AsyncStorage state before enabling the query:
  //  1) the "had session" marker (controls retry/redirect UX)
  //  2) the Bearer session token (must be in cache before the first fetch fires)
  // On Android we also fire-and-forget a request to clear the stale connect.sid
  // cookie from the native cookie jar — the server responds with Max-Age=0 which
  // causes the OS to evict it. Web is intentionally skipped (cookies work normally).
  const [storageChecked, setStorageChecked] = useState(false);
  const didRevalidateRef = useRef(false);
  useEffect(() => {
    // Timeout di sicurezza: AsyncStorage su Android può appendere silenziosamente
    // (SQLite lock / storage in bad state). Il .catch(() => null) non scatta mai
    // perché la promise non rigetta — semplicemente non risolve. Senza questo guard
    // storageChecked resta false → isLoading=true → spinner nero infinito.
    // Con il timeout (5s) ricadiamo nel .catch → storageChecked=true con valori
    // null → la query auth parte comunque e l'utente si sblocca.
    const STORAGE_INIT_TIMEOUT_MS = 5000;
    const storageTimeout = new Promise<[null, null, null]>((resolve) => {
      setTimeout(() => resolve([null, null, null]), STORAGE_INIT_TIMEOUT_MS);
    });

    Promise.race([
      Promise.all([
        AsyncStorage.getItem(HAD_SESSION_KEY).catch(() => null),
        initSessionToken().catch(() => null),
        AsyncStorage.getItem(CACHED_USER_KEY).catch(() => null),
      ]),
      storageTimeout,
    ])
      .then(([hadSession, token, cachedRaw]) => {
        hadSessionRef.current = hadSession === "true";
        // HYDRATION: se c'era una sessione, semina la cache con l'ultimo utente
        // noto PRIMA di abilitare la query. Così /(tabs) monta con un `user`
        // reale e sparisce la transizione undefined→defined (causa strutturale
        // del loop di boot). Con dato seminato e staleTime:Infinity la query NON
        // rifà fetch da sola → forziamo una sola revalidation in background.
        const cached = hadSessionRef.current ? parseCachedUser(cachedRaw) : null;
        if (cached) {
          queryClient.setQueryData(["/api/auth/me"], cached);
        }
        if (Platform.OS === "android" && token) {
          const baseUrl = getApiUrl();
          fetch(new URL("/api/auth/clear-session-cookie", baseUrl).toString(), {
            method: "POST",
            credentials: "include"
          }).catch(() => {});
        }
        setStorageChecked(true);
        // NB: la revalidation NON va lanciata qui. La query è ancora enabled:false
        // (storageChecked si applica solo al render successivo) e refetchQueries
        // NON rifà fetch su una query disabilitata → la sessione scaduta non
        // verrebbe mai validata. La validazione è in un effect dedicato
        // post-useQuery (vedi sotto), che usa userQuery.refetch() a query ABILITATA.
      })
      .catch(() => {
        hadSessionRef.current = false;
        setStorageChecked(true);
      });
  }, []);

  // queryFn estratto in createAuthQueryFn (vedi sopra) per testabilità: stessa
  // logica di timeout/abort, parametrizzata su hadSessionRef e setSessionExpired.
  const authQueryFn = createAuthQueryFn({ hadSessionRef, setSessionExpired });

  const authRetryConfig = createAuthRetryConfig(hadSessionRef);

  const userQuery = useQuery<SafeUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: authQueryFn,
    staleTime: Infinity,
    enabled: storageChecked,
    // Only retry if the user had a previous session (don't make new users wait)
    retry: authRetryConfig.retry,
    retryDelay: authRetryConfig.retryDelay,
  });

  // Persisti/azzera lo snapshot utente ad ogni cambio del dato auth. Centralizza
  // la persistenza per TUTTE le sorgenti — queryFn success, login/register (via
  // setQueryData), logout/401 (data → null) — così il prossimo cold boot può
  // idratare /(tabs) con un utente reale. Vedi persistCachedUser per il razionale.
  useEffect(() => {
    if (userQuery.data) {
      persistCachedUser(userQuery.data);
    } else if (userQuery.data === null && storageChecked) {
      persistCachedUser(null);
    }
  }, [userQuery.data, storageChecked]);

  // Revalidation UNA-TANTUM della sessione idratata. Quando la cache è stata
  // seminata (utente cached + sessione pregressa) la query parte già "fresh"
  // (staleTime:Infinity) e NON rifà fetch da sola: forziamo qui un solo
  // userQuery.refetch() — che bypassa `enabled` ed è eseguito a query ABILITATA
  // (storageChecked=true) — per validare la sessione contro il server. Se è
  // scaduta → 401 → queryFn ritorna null → sessionExpired → redirect a /welcome.
  // Con `data` già presente non c'è spinner né flicker (isLoading resta false).
  useEffect(() => {
    if (
      shouldRevalidateHydratedSession({
        storageChecked,
        hadSession: hadSessionRef.current,
        didRevalidate: didRevalidateRef.current,
        hasUser: !!userQuery.data,
      })
    ) {
      didRevalidateRef.current = true;
      userQuery.refetch().catch(() => {});
    }
  }, [storageChecked, userQuery.data, userQuery.refetch]);

  // Clear sessionExpired whenever the user becomes authenticated
  // (covers login via setQueryData, not just queryFn success).
  useEffect(() => {
    if (userQuery.data) {
      setSessionExpired(false);
    }
  }, [userQuery.data]);

  // Diagnostic WS lifecycle: init on auth, teardown on logout.
  useEffect(() => {
    if (userQuery.data) {
      import("@/lib/diagnostic/ws-client").then(m => {
        m.initDiagnosticWS({
          isAdmin: userQuery.data?.role === "admin",
          isModerator: userQuery.data?.role === "moderatore" || userQuery.data?.role === "moderator",
        });
      }).catch(() => {});
    } else if (userQuery.data === null && storageChecked) {
      import("@/lib/diagnostic/ws-client").then(m => m.teardownDiagnosticWS()).catch(() => {});
    }
  }, [userQuery.data, storageChecked]);

  // Remote diagnostic polling: every 60s check if admin has requested a diagnostic run.
  // If pending, run silently in background and submit report with triggeredBy="remote".
  const remoteDiagRunningRef = useRef(false);
  useEffect(() => {
    if (!userQuery.data) return;
    const poll = async () => {
      if (remoteDiagRunningRef.current) return;
      try {
        const res = await fetch(new URL("/api/diagnostic/pending", getApiUrl()).toString(), {
          headers: authFetchHeaders(),
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json() as { pending?: boolean };
        if (!data?.pending) return;
        remoteDiagRunningRef.current = true;
        try {
          const role = userQuery.data?.role;
          const isAdminOrMod = role === "admin" || role === "moderatore" || role === "moderator";
          const { runAllTests } = await import("@/lib/diagnostic/runner");
          const report = await runAllTests({ isAdmin: role === "admin" });
          const { apiRequest: req } = await import("@/lib/query-client");
          await req("POST", "/api/diagnostic/report", {
            triggeredBy: "remote",
            appVersion: report.appVersion,
            platform: report.platform,
            deviceModel: report.deviceModel,
            sentryEventId: report.sentryEventId,
            summary: report.summary,
            results: report.results,
          });
          if (isAdminOrMod) {
            try {
              router.push({
                pathname: "/diagnostica-risultati",
                params: { reportJson: JSON.stringify(report) },
              } as never);
            } catch {
              // best-effort: navigazione non critica
            }
          }
        } catch {
          // best-effort: silently skip on errors
        } finally {
          remoteDiagRunningRef.current = false;
        }
      } catch {
        // network error — skip silently
      }
    };

    poll();
    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!userQuery.data]);

  // isReconnecting is true only during the INITIAL auth check when the user had a previous session.
  // Background refetches (triggered by scheduleAuthRecheck) don't set this flag.
  useEffect(() => {
    setIsReconnecting(userQuery.isLoading && hadSessionRef.current && storageChecked);
  }, [userQuery.isLoading, storageChecked]);

  // Bootstrap auth fallito (rete/server) e nessun utente in cache: l'app deve
  // mostrare un fallback con "Riprova" invece di restare appesa sullo spinner.
  const authFailed = storageChecked && userQuery.isError && !userQuery.data;
  const retryAuth = useCallback(() => {
    userQuery.refetch();
  }, [userQuery.refetch]);

  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const logoutMutation = useLogoutMutation();

  // Stabilizza la reference dell'utente. React Query crea un nuovo oggetto a ogni
  // refetch (es. la revalidation una-tantum della sessione idratata) anche quando
  // i dati sono identici. Senza questa guardia ogni refetch ricreerebbe il context
  // value → cascata di re-render su TUTTI i consumer di useAuth() + i ~13 effetti
  // con dep [user] → React Navigation supera il limite di 25 update annidati →
  // "Maximum update depth exceeded". Manteniamo la stessa reference finché il
  // contenuto è shallow-equal, così i [user] deps restano stabili ma i dati
  // restano freschi quando cambiano davvero (login/logout/edit profilo).
  const stableUserRef = useRef<SafeUser | null | undefined>(userQuery.data);
  if (!shallowEqualSafeUser(userQuery.data, stableUserRef.current)) {
    stableUserRef.current = userQuery.data;
  }
  const user = stableUserRef.current;
  const userId = user?.id ?? null;

  const value = useMemo(
    () => ({
      user,
      userId,
      isLoading: userQuery.isLoading || !storageChecked,
      isAuthenticated: !!user,
      hadPreviousSession: storageChecked && hadSessionRef.current,
      sessionExpired,
      isReconnecting,
      authFailed,
      retryAuth,
      loginMutation,
      registerMutation,
      logoutMutation
    }),
    // Le mutation di React Query restituiscono un nuovo oggetto a ogni render: includerle
    // intere qui invaliderebbe il memo a ogni render (causa del loop). Dipendiamo solo dalle
    // slice primitive `isPending` così i consumer vedono lo stato aggiornato senza ricreare il value.
    // `user` è già stabilizzato sopra (shallow-equal): cambia reference solo su variazioni reali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, userId, userQuery.isLoading, storageChecked, sessionExpired, isReconnecting, authFailed, retryAuth, loginMutation.isPending, registerMutation.isPending, logoutMutation.isPending]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

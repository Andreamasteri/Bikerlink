import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
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
import {
  type SafeUser,
  shallowEqualSafeUser,
  HAD_SESSION_KEY,
  CACHED_USER_KEY,
  persistCachedUser,
  parseCachedUser,
  drainPendingOnboardingTags,
  createAuthQueryFn,
  createAuthRetryConfig,
  shouldRevalidateHydratedSession,
  RETRY_DELAYS,
  AUTH_FETCH_TIMEOUT_MS,
} from "@/lib/auth-helpers";

// Re-export dei helper puri estratti in auth-helpers.ts (split per il limite
// 600 righe/file) così gli import esistenti dai test (`@/lib/auth-context`)
// continuano a funzionare senza modifiche.
export {
  RETRY_DELAYS,
  AUTH_FETCH_TIMEOUT_MS,
  shouldRevalidateHydratedSession,
  createAuthRetryConfig,
  createAuthQueryFn,
};

// Health Arbiter (Task #5124): stato di salute aggregato esposto da /api/health.
type HealthState = "READY" | "DEGRADED" | "BROKEN";
interface HealthResponse {
  status?: string;
  state?: HealthState;
  degraded?: boolean;
  degradedReasons?: string[];
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
  // Salute backend (Health Arbiter) — primitive stabili per il banner "degradato".
  healthState: HealthState;
  healthDegraded: boolean;
  healthReason: string;
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run on storageChecked/userQuery.data changes, not on every userQuery identity change
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

  // NB: il polling diagnostico remoto (con la sua navigazione router.push verso
  // /diagnostica-risultati) è stato estratto in components/layout/RemoteDiagnosticPoller.tsx
  // (Task #5071): auth-context non contiene più side-effect di navigazione.

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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: userQuery.refetch is stable, depending on the whole userQuery object would churn every render
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

  // ── Health polling (Task #5124) ──────────────────────────────────────────────
  // Poll leggero di /api/health ogni 60s per alimentare il banner "degradato".
  // Esponiamo SOLO primitive nel context value (healthState string + healthReason
  // come stringa joinata): un array di reasons cambierebbe reference a ogni poll
  // e invaliderebbe il memo → cascata di re-render su tutti i consumer di useAuth
  // (rischio loop React Navigation, vedi nota sul memo sotto). enabled:!!user
  // perché il banner vive solo nelle (tabs) autenticate; retry:false così un 503
  // di boot non innesca tentativi a raffica.
  const healthQuery = useQuery<HealthResponse>({
    queryKey: ["/api/health"],
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 55_000,
    retry: false,
  });
  const healthStateRaw = healthQuery.data?.state;
  const healthState: HealthState =
    healthStateRaw === "DEGRADED" || healthStateRaw === "BROKEN" ? healthStateRaw : "READY";
  const healthReason = (healthQuery.data?.degradedReasons ?? []).join(" · ");

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
      healthState,
      healthDegraded: healthState !== "READY",
      healthReason,
      loginMutation,
      registerMutation,
      logoutMutation
    }),
    // Le mutation di React Query restituiscono un nuovo oggetto a ogni render: includerle
    // intere qui invaliderebbe il memo a ogni render (causa del loop). Dipendiamo solo dalle
    // slice primitive `isPending` così i consumer vedono lo stato aggiornato senza ricreare il value.
    // `user` è già stabilizzato sopra (shallow-equal): cambia reference solo su variazioni reali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, userId, userQuery.isLoading, storageChecked, sessionExpired, isReconnecting, authFailed, retryAuth, healthState, healthReason, loginMutation.isPending, registerMutation.isPending, logoutMutation.isPending]
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

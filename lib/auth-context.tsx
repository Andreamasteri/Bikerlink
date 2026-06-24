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

const HAD_SESSION_KEY = "@bikerlink/had_session";

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
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(HAD_SESSION_KEY).catch(() => null),
      initSessionToken().catch(() => null),
    ])
      .then(([hadSession, token]) => {
        hadSessionRef.current = hadSession === "true";
        if (Platform.OS === "android" && token) {
          const baseUrl = getApiUrl();
          fetch(new URL("/api/auth/clear-session-cookie", baseUrl).toString(), {
            method: "POST",
            credentials: "include"
          }).catch(() => {});
        }
        setStorageChecked(true);
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
  }, [userQuery]);

  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const logoutMutation = useLogoutMutation();

  const value = useMemo(
    () => ({
      user: userQuery.data,
      isLoading: userQuery.isLoading || !storageChecked,
      isAuthenticated: !!userQuery.data,
      hadPreviousSession: storageChecked && hadSessionRef.current,
      sessionExpired,
      isReconnecting,
      authFailed,
      retryAuth,
      loginMutation,
      registerMutation,
      logoutMutation
    }),
    [userQuery.data, userQuery.isLoading, storageChecked, sessionExpired, isReconnecting, authFailed, retryAuth, loginMutation, registerMutation, logoutMutation]
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

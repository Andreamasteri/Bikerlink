import React, { createContext, useContext, useMemo, useState, useEffect, useRef, ReactNode } from "react";
import { Platform } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import {
  queryClient,
  apiRequest,
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
const RETRY_DELAYS = [2000, 5000, 10000];

interface AuthContextValue {
  user: SafeUser | null | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  isReconnecting: boolean;
  loginMutation: ReturnType<typeof useLoginMutation>;
  registerMutation: ReturnType<typeof useRegisterMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
}

function useLoginMutation() {
  return useMutation({
    mutationFn: async (data: { identifier: string; password: string; latitude?: number; longitude?: number; platform?: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { ...data, platform: Platform.OS });
      return await res.json();
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
      return await res.json();
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

  // Custom queryFn: returns null on 401 (triggers no retry), throws on network errors (triggers retry)
  const authQueryFn = async ({ signal }: { signal?: AbortSignal }) => {
    const baseUrl = getApiUrl();
    const url = new URL("/api/auth/me", baseUrl);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: authFetchHeaders(),
        credentials: "include",
        signal
      });
    } catch (err: unknown) {
      // AbortError = query was cancelled, re-throw as-is
      if (err instanceof Error && err.name === "AbortError") throw err;
      // Network error / ECONNREFUSED / timeout → throw to trigger React Query retry
      throw new Error("network_unavailable");
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

  const userQuery = useQuery<SafeUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: authQueryFn,
    staleTime: Infinity,
    enabled: storageChecked,
    // Only retry if the user had a previous session (don't make new users wait)
    retry: (failureCount, error) => {
      if (error instanceof Error && error.name === "AbortError") return false;
      if (!hadSessionRef.current) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => RETRY_DELAYS[attempt] ?? 10000
  });

  // Clear sessionExpired whenever the user becomes authenticated
  // (covers login via setQueryData, not just queryFn success).
  useEffect(() => {
    if (userQuery.data) {
      setSessionExpired(false);
    }
  }, [userQuery.data]);

  // isReconnecting is true only during the INITIAL auth check when the user had a previous session.
  // Background refetches (triggered by scheduleAuthRecheck) don't set this flag.
  useEffect(() => {
    setIsReconnecting(userQuery.isLoading && hadSessionRef.current && storageChecked);
  }, [userQuery.isLoading, storageChecked]);

  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const logoutMutation = useLogoutMutation();

  const value = useMemo(
    () => ({
      user: userQuery.data,
      isLoading: userQuery.isLoading || !storageChecked,
      isAuthenticated: !!userQuery.data,
      sessionExpired,
      isReconnecting,
      loginMutation,
      registerMutation,
      logoutMutation
    }),
    [userQuery.data, userQuery.isLoading, storageChecked, sessionExpired, isReconnecting, loginMutation, registerMutation, logoutMutation]
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

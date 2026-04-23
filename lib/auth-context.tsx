import React, { createContext, useContext, useMemo, useState, useEffect, useRef, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryClient, apiRequest, getQueryFn, getApiUrl } from "@/lib/query-client";
import type { User } from "@shared/schema";

type SafeUser = Omit<User, "password">;

const HAD_SESSION_KEY = "@bikerlink/had_session";

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
    mutationFn: async (data: { identifier: string; password: string; latitude?: number; longitude?: number }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: (user: SafeUser) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      AsyncStorage.setItem(HAD_SESSION_KEY, "true").catch(() => {});
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key !== "/api/auth/me";
        },
      });
      (async () => {
        try {
          await queryClient.fetchQuery({ queryKey: ["/api/settings/maps"] });
        } catch {}
        let profileLat: number | null = null;
        let profileLng: number | null = null;
        try {
          const profile = await queryClient.fetchQuery<{ latitude?: number | null; longitude?: number | null }>({
            queryKey: ["/api/users/profile"],
          });
          if (profile?.latitude != null && profile?.longitude != null) {
            profileLat = Number(profile.latitude);
            profileLng = Number(profile.longitude);
          }
        } catch {}
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
              const res = await fetch(url.toString(), { credentials: "include" });
              if (!res.ok) return [];
              return res.json();
            },
          });
        } catch {}
        apiRequest("POST", "/api/matching/trigger").catch(() => {});
      })();
    },
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
      region?: string;
      eulaAccepted: true;
      invitationCode?: string;
    }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return await res.json();
    },
    onSuccess: (response: any) => {
      if (!response?.requiresEmailVerification) {
        queryClient.setQueryData(["/api/auth/me"], response);
        AsyncStorage.setItem(HAD_SESSION_KEY, "true").catch(() => {});
      }
    },
  });
}

function useLogoutMutation() {
  return useMutation({
    mutationFn: async () => {
      apiRequest("POST", "/api/auth/logout").catch(() => {});
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      AsyncStorage.removeItem(HAD_SESSION_KEY).catch(() => {});
    },
    onError: () => {},
  });
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionExpired, setSessionExpired] = useState(false);
  // true while we're loading AND we know the user had a session before
  const [isReconnecting, setIsReconnecting] = useState(false);
  const hadSessionRef = useRef<boolean>(false);

  // Prefetch the AsyncStorage "had session" marker before enabling the query
  const [storageChecked, setStorageChecked] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(HAD_SESSION_KEY)
      .then((val) => {
        hadSessionRef.current = val === "true";
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
      res = await fetch(url.toString(), { credentials: "include", signal });
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
    retryDelay: (attempt) => RETRY_DELAYS[attempt] ?? 10000,
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
      logoutMutation,
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

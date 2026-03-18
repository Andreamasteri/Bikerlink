import React, { createContext, useContext, useMemo, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/query-client";
import type { User } from "@shared/schema";

type SafeUser = Omit<User, "password">;

interface AuthContextValue {
  user: SafeUser | null | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginMutation: ReturnType<typeof useLoginMutation>;
  registerMutation: ReturnType<typeof useRegisterMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
}

function useLoginMutation() {
  return useMutation({
    mutationFn: async (data: { identifier: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: (user: SafeUser) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      queryClient.invalidateQueries();
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
      }
    },
  });
}

function useLogoutMutation() {
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const userQuery = useQuery<SafeUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const logoutMutation = useLogoutMutation();

  const value = useMemo(
    () => ({
      user: userQuery.data,
      isLoading: userQuery.isLoading,
      isAuthenticated: !!userQuery.data,
      loginMutation,
      registerMutation,
      logoutMutation,
    }),
    [userQuery.data, userQuery.isLoading, loginMutation, registerMutation, logoutMutation]
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

import React from "react";
import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { AdminUser, MatchabilityInfo } from "@/components/admin/users/UserCard";
import { UserStats, SessionsData } from "@/components/admin/users/UserDetailModal";
import { CreateUserPayload } from "@/components/admin/users/CreateUserModal";

export function useAdminUsers() {
  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: summary } = useQuery<any>({
    queryKey: ["/api/admin/users/stats/summary"],
  });

  const { data: matchabilityData } = useQuery<{
    summary: { total: number; matchable: number; notMatchable: number };
    users: Array<{
      userId: string;
      matchable: boolean;
      reasons: string[];
      hasPrefs: boolean;
      hasCoords: boolean;
      hasMotos: boolean;
      hasTags: boolean;
    }>;
  }>({
    queryKey: ["/api/admin/matching/real-users-matchability"],
    staleTime: 60_000,
  });

  const matchabilityMap = React.useMemo<Record<string, MatchabilityInfo>>(() => {
    if (!matchabilityData?.users) return {};
    const map: Record<string, MatchabilityInfo> = {};
    for (const u of matchabilityData.users) {
      map[u.userId] = {
        matchable: u.matchable,
        reasons: u.reasons,
        hasPrefs: u.hasPrefs,
        hasCoords: u.hasCoords,
        hasMotos: u.hasMotos,
        hasTags: u.hasTags,
      };
    }
    return map;
  }, [matchabilityData]);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/stats/summary"] });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/email`, { email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      Alert.alert("Successo", "Email aggiornata");
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare l'email"),
  });

  const passwordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/password`, { password });
      return res.json();
    },
    onSuccess: (_data, _vars, _ctx) => {
      Alert.alert("Successo", "Password aggiornata");
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare la password"),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/stats/summary"] });
      Alert.alert("Successo", "Profilo eliminato");
    },
    onError: () => Alert.alert("Errore", "Impossibile eliminare il profilo"),
  });

  const createUserMutation = useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await apiRequest("POST", "/api/admin/users", payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/stats/summary"] });
    },
    onError: (err: Error) => Alert.alert("Errore creazione", err.message || "Impossibile creare l'utente"),
  });

  const primalMutation = useMutation({
    mutationFn: async ({ id, isPrimal }: { id: string; isPrimal: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/primal`, { isPrimal });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
    onError: () => Alert.alert("Errore", "Impossibile aggiornare stato Primal"),
  });

  const mapTesterMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/maps/users/${id}/map-tester`, { enabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
    onError: () => Alert.alert("Errore", "Impossibile aggiornare flag Map Tester"),
  });

  const telemetryDisabledMutation = useMutation({
    mutationFn: async ({ id, disabled }: { id: string; disabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/telemetry-disabled`, { disabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
    onError: () => Alert.alert("Errore", "Impossibile aggiornare stato sensori utente"),
  });

  const matchingDisabledMutation = useMutation({
    mutationFn: async ({ id, matchingDisabled }: { id: string; matchingDisabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/matching-disabled`, { matchingDisabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
    onError: () => Alert.alert("Errore", "Impossibile aggiornare flag matching"),
  });

  const aisMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/ais`);
      return res.json() as Promise<{ userId: string; aisEnabled: boolean }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare permesso AIS"),
  });

  const clearLastfmMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}/lastfm`);
      return res.json() as Promise<{ message: string; deleted: { tracks: number; sessions: number; snapshots: number } }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const { tracks, sessions, snapshots } = data.deleted;
      Alert.alert("Last.fm cancellato", `Rimossi: ${tracks} brani, ${sessions} sessioni, ${snapshots} snapshot`);
    },
    onError: () => Alert.alert("Errore", "Impossibile cancellare i dati Last.fm"),
  });

  function useUserStats(selectedUser: AdminUser | null, statsModalVisible: boolean) {
    return useQuery<UserStats>({
      queryKey: ["/api/admin/users", selectedUser?.id, "stats"],
      enabled: statsModalVisible && !!selectedUser,
      queryFn: async () => {
        const url = new URL(`/api/admin/users/${selectedUser!.id}/stats`, getApiUrl());
        const res = await fetch(url.toString(), { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch stats");
        return res.json();
      },
    });
  }

  function useUserSessions(selectedUser: AdminUser | null, statsModalVisible: boolean) {
    return useQuery<SessionsData>({
      queryKey: ["/api/admin/users", selectedUser?.id, "sessions"],
      enabled: statsModalVisible && !!selectedUser,
      queryFn: async () => {
        const url = new URL(`/api/admin/users/${selectedUser!.id}/sessions`, getApiUrl());
        const res = await fetch(url.toString(), { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
    });
  }

  const revokeSessionMutation = useMutation({
    mutationFn: async ({ userId, sid }: { userId: string; sid: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}/sessions/${encodeURIComponent(sid)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onError: (err: Error) => Alert.alert("Errore revoca", err.message || "Impossibile revocare la sessione"),
  });

  return {
    users,
    isLoading,
    summary,
    matchabilityMap,
    statusMutation,
    roleMutation,
    emailMutation,
    passwordMutation,
    deleteMutation,
    createUserMutation,
    primalMutation,
    mapTesterMutation,
    telemetryDisabledMutation,
    matchingDisabledMutation,
    aisMutation,
    clearLastfmMutation,
    revokeSessionMutation,
    useUserStats,
    useUserSessions,
  };
}

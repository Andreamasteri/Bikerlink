import { useState, useCallback } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/query-client";

interface UseMatchMutationsParams {
  distanceMode: "all" | "km";
  distanceKm: string;
  pendingKm: string;
  setDistanceKm: (km: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- translation function
  t: (key: string, ...args: any[]) => string;
}

export function useMatchMutations({ distanceMode, distanceKm, pendingKm, setDistanceKm, t }: UseMatchMutationsParams) {
  const router = useRouter();
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [propProfilePendingId, setPropProfilePendingId] = useState<string | null>(null);

  const acceptMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/matches/${matchId}/accept`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches"] });
      const previousMatches = queryClient.getQueryData(["/api/proposals/matches"]);
      queryClient.setQueryData(["/api/proposals/matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousMatches };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousMatches !== undefined) {
        queryClient.setQueryData(["/api/proposals/matches"], context.previousMatches);
      }
      setPendingMatchId(null);
      Alert.alert(t("common.error"), t("match.acceptError"));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/matches/${matchId}/reject`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches"] });
      const previousMatches = queryClient.getQueryData(["/api/proposals/matches"]);
      queryClient.setQueryData(["/api/proposals/matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousMatches };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousMatches !== undefined) {
        queryClient.setQueryData(["/api/proposals/matches"], context.previousMatches);
      }
      Alert.alert(t("common.error"), t("match.rejectError"));
    },
  });

  const acceptGarageMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/garage-matches/${matchId}/accept`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/garage-matches"] });
      const previousGarage = queryClient.getQueryData(["/api/proposals/garage-matches"]);
      queryClient.setQueryData(["/api/proposals/garage-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousGarage };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousGarage !== undefined) {
        queryClient.setQueryData(["/api/proposals/garage-matches"], context.previousGarage);
      }
      setPendingMatchId(null);
      Alert.alert(t("common.error"), t("match.acceptError"));
    },
  });

  const rejectGarageMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/garage-matches/${matchId}/reject`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/garage-matches"] });
      const previousGarage = queryClient.getQueryData(["/api/proposals/garage-matches"]);
      queryClient.setQueryData(["/api/proposals/garage-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousGarage };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousGarage !== undefined) {
        queryClient.setQueryData(["/api/proposals/garage-matches"], context.previousGarage);
      }
      Alert.alert(t("common.error"), t("match.rejectError"));
    },
  });

  const acceptBikerMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/biker-matches/${matchId}/accept`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/biker-matches"] });
      const previousBiker = queryClient.getQueryData(["/api/proposals/biker-matches"]);
      queryClient.setQueryData(["/api/proposals/biker-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousBiker };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousBiker !== undefined) {
        queryClient.setQueryData(["/api/proposals/biker-matches"], context.previousBiker);
      }
      setPendingMatchId(null);
      Alert.alert(t("common.error"), t("match.acceptError"));
    },
  });

  const rejectBikerMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/biker-matches/${matchId}/reject`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/biker-matches"] });
      const previousBiker = queryClient.getQueryData(["/api/proposals/biker-matches"]);
      queryClient.setQueryData(["/api/proposals/biker-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousBiker };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousBiker !== undefined) {
        queryClient.setQueryData(["/api/proposals/biker-matches"], context.previousBiker);
      }
      Alert.alert(t("common.error"), t("match.rejectError"));
    },
  });

  const acceptPropProfileMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/proposal-profile-matches/${matchId}/accept`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
      const previousPropProfile = queryClient.getQueryData(["/api/proposals/proposal-profile-matches"]);
      queryClient.setQueryData(["/api/proposals/proposal-profile-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousPropProfile };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
      setPropProfilePendingId(null);
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousPropProfile !== undefined) {
        queryClient.setQueryData(["/api/proposals/proposal-profile-matches"], context.previousPropProfile);
      }
      setPropProfilePendingId(null);
      Alert.alert(t("common.error"), t("match.acceptError"));
    },
  });

  const rejectPropProfileMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/proposal-profile-matches/${matchId}/reject`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
      const previousPropProfile = queryClient.getQueryData(["/api/proposals/proposal-profile-matches"]);
      queryClient.setQueryData(["/api/proposals/proposal-profile-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousPropProfile };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousPropProfile !== undefined) {
        queryClient.setQueryData(["/api/proposals/proposal-profile-matches"], context.previousPropProfile);
      }
      Alert.alert(t("common.error"), t("match.rejectError"));
    },
  });

  const acceptRouteAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/route-affinity-matches/${matchId}/accept`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
      const previousRouteAffinity = queryClient.getQueryData(["/api/proposals/route-affinity-matches"]);
      queryClient.setQueryData(["/api/proposals/route-affinity-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousRouteAffinity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousRouteAffinity !== undefined) {
        queryClient.setQueryData(["/api/proposals/route-affinity-matches"], context.previousRouteAffinity);
      }
      setPendingMatchId(null);
      Alert.alert(t("common.error"), t("match.acceptError"));
    },
  });

  const rejectRouteAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/route-affinity-matches/${matchId}/reject`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
      const previousRouteAffinity = queryClient.getQueryData(["/api/proposals/route-affinity-matches"]);
      queryClient.setQueryData(["/api/proposals/route-affinity-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousRouteAffinity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousRouteAffinity !== undefined) {
        queryClient.setQueryData(["/api/proposals/route-affinity-matches"], context.previousRouteAffinity);
      }
      Alert.alert(t("common.error"), t("match.rejectError"));
    },
  });

  const removeRouteAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/route-affinity-matches/${matchId}`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      const previousRouteAffinity = queryClient.getQueryData(["/api/proposals/route-affinity-matches"]);
      const previousAccepted = queryClient.getQueryData(["/api/proposals/matches/accepted"]);
      queryClient.setQueryData(["/api/proposals/route-affinity-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousRouteAffinity, previousAccepted };
    },
    onError: (_err, _matchId, context: Record<string, unknown> | undefined) => {
      if (context?.previousRouteAffinity !== undefined) {
        queryClient.setQueryData(["/api/proposals/route-affinity-matches"], context.previousRouteAffinity);
      }
      if (context?.previousAccepted !== undefined) {
        queryClient.setQueryData(["/api/proposals/matches/accepted"], context.previousAccepted);
      }
      Alert.alert(t("common.error"), t("match.removeError"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
    },
  });

  const acceptTelemetryAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/telemetry-affinity-matches/${matchId}/accept`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
      const previousTelemetryAffinity = queryClient.getQueryData(["/api/proposals/telemetry-affinity-matches"]);
      queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousTelemetryAffinity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousTelemetryAffinity !== undefined) {
        queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], context.previousTelemetryAffinity);
      }
      setPendingMatchId(null);
      Alert.alert(t("common.error"), t("match.acceptError"));
    },
  });

  const rejectTelemetryAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/telemetry-affinity-matches/${matchId}/reject`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
      const previousTelemetryAffinity = queryClient.getQueryData(["/api/proposals/telemetry-affinity-matches"]);
      queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousTelemetryAffinity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
      if (context?.previousTelemetryAffinity !== undefined) {
        queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], context.previousTelemetryAffinity);
      }
      Alert.alert(t("common.error"), t("match.rejectError"));
    },
  });

  const removeTelemetryAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/telemetry-affinity-matches/${matchId}`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      const previousTelemetryAffinity = queryClient.getQueryData(["/api/proposals/telemetry-affinity-matches"]);
      const previousAccepted = queryClient.getQueryData(["/api/proposals/matches/accepted"]);
      queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousTelemetryAffinity, previousAccepted };
    },
    onError: (_err, _matchId, context: Record<string, unknown> | undefined) => {
      if (context?.previousTelemetryAffinity !== undefined) {
        queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], context.previousTelemetryAffinity);
      }
      if (context?.previousAccepted !== undefined) {
        queryClient.setQueryData(["/api/proposals/matches/accepted"], context.previousAccepted);
      }
      Alert.alert(t("common.error"), t("match.removeError"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (blockedUserId: string) => apiRequest("DELETE", `/api/users/${blockedUserId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
      Alert.alert(t("common.success"), t("match.userUnblocked"));
    },
  });

  const startChatMutation = useMutation({
    mutationFn: (targetUserId: string) => apiRequest("POST", "/api/chat/conversations", { targetUserId }),
    onSuccess: (data) => {
      const conv = data as unknown as { id?: string };
      if (conv.id) { router.push(`/chat/${conv.id}` as never); }
    },
  });

  const blockFromMatchMutation = useMutation({
    mutationFn: (targetUserId: string) => apiRequest("POST", `/api/users/${targetUserId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
      Alert.alert(t("common.success"), t("match.userBlocked"));
    },
  });

  const removeGarageMatchMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/garage-matches/${matchId}`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/garage-matches"] });
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      const previousGarage = queryClient.getQueryData(["/api/proposals/garage-matches"]);
      const previousAccepted = queryClient.getQueryData(["/api/proposals/matches/accepted"]);
      queryClient.setQueryData(["/api/proposals/garage-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousGarage, previousAccepted };
    },
    onError: (_err, _matchId, context: Record<string, unknown> | undefined) => {
      if (context?.previousGarage !== undefined) {
        queryClient.setQueryData(["/api/proposals/garage-matches"], context.previousGarage);
      }
      if (context?.previousAccepted !== undefined) {
        queryClient.setQueryData(["/api/proposals/matches/accepted"], context.previousAccepted);
      }
      Alert.alert(t("common.error"), t("match.removeError"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
    },
  });

  const removeBikerMatchMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/biker-matches/${matchId}`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/biker-matches"] });
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      const previousBiker = queryClient.getQueryData(["/api/proposals/biker-matches"]);
      const previousAccepted = queryClient.getQueryData(["/api/proposals/matches/accepted"]);
      queryClient.setQueryData(["/api/proposals/biker-matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousBiker, previousAccepted };
    },
    onError: (_err, _matchId, context: Record<string, unknown> | undefined) => {
      if (context?.previousBiker !== undefined) {
        queryClient.setQueryData(["/api/proposals/biker-matches"], context.previousBiker);
      }
      if (context?.previousAccepted !== undefined) {
        queryClient.setQueryData(["/api/proposals/matches/accepted"], context.previousAccepted);
      }
      Alert.alert(t("common.error"), t("match.removeError"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
    },
  });

  const removeProposalMatchMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/matches/${matchId}`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches"] });
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      const previousProposal = queryClient.getQueryData(["/api/proposals/matches"]);
      const previousAccepted = queryClient.getQueryData(["/api/proposals/matches/accepted"]);
      queryClient.setQueryData(["/api/proposals/matches"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: unknown) =>
        Array.isArray(old) ? (old as { id: string }[]).filter((m) => m.id !== matchId) : old,
      );
      return { previousProposal, previousAccepted };
    },
    onError: (_err, _matchId, context: Record<string, unknown> | undefined) => {
      if (context?.previousProposal !== undefined) {
        queryClient.setQueryData(["/api/proposals/matches"], context.previousProposal);
      }
      if (context?.previousAccepted !== undefined) {
        queryClient.setQueryData(["/api/proposals/matches/accepted"], context.previousAccepted);
      }
      Alert.alert(t("common.error"), t("match.removeError"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
    },
  });

  const resetAndRematchMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/proposals/rematch", {
      distanceMode,
      distanceKm: parseInt(distanceKm, 10) || 50,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
    },
  });

  const handleResetAndRematch = useCallback(() => {
    const kmVal = parseInt(pendingKm, 10);
    if (distanceMode === "km" && (isNaN(kmVal) || kmVal <= 0)) {
      Alert.alert(t("common.error"), t("match.invalidKm"));
      return;
    }
    setDistanceKm(pendingKm);
    AsyncStorage.setItem("match_distance_km", pendingKm).catch(() => {});
    resetAndRematchMutation.mutate();
  }, [distanceMode, pendingKm, resetAndRematchMutation, t, setDistanceKm]);

  const confirmRemoveGarageMatch = useCallback((id: string) => {
    Alert.alert(t("common.confirm"), t("match.confirmRemoveMatch"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => removeGarageMatchMutation.mutate(id) },
    ]);
  }, [removeGarageMatchMutation, t]);

  const confirmRemoveBikerMatch = useCallback((id: string) =>
    Alert.alert(t("common.confirm"), t("match.confirmRemoveMatch"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => removeBikerMatchMutation.mutate(id) },
    ]), [removeBikerMatchMutation, t]);

  const confirmRemoveProposalMatch = useCallback((id: string) =>
    Alert.alert(t("common.confirm"), t("match.confirmRemoveMatch"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => removeProposalMatchMutation.mutate(id) },
    ]), [removeProposalMatchMutation, t]);

  const handleUnblock = useCallback((blockedUserId: string) => {
    Alert.alert(t("common.confirm"), t("match.confirmUnblock"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("match.unblock"), onPress: () => unblockMutation.mutate(blockedUserId) },
    ]);
  }, [unblockMutation, t]);

  return {
    pendingMatchId,
    setPendingMatchId,
    propProfilePendingId,
    setPropProfilePendingId,
    acceptMutation,
    rejectMutation,
    acceptGarageMutation,
    rejectGarageMutation,
    acceptBikerMutation,
    rejectBikerMutation,
    acceptPropProfileMutation,
    rejectPropProfileMutation,
    acceptRouteAffinityMutation,
    rejectRouteAffinityMutation,
    removeRouteAffinityMutation,
    acceptTelemetryAffinityMutation,
    rejectTelemetryAffinityMutation,
    removeTelemetryAffinityMutation,
    unblockMutation,
    startChatMutation,
    blockFromMatchMutation,
    removeGarageMatchMutation,
    removeBikerMatchMutation,
    removeProposalMatchMutation,
    resetAndRematchMutation,
    handleResetAndRematch,
    confirmRemoveGarageMatch,
    confirmRemoveBikerMatch,
    confirmRemoveProposalMatch,
    handleUnblock,
  };
}

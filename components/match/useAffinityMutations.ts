import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/query-client";

interface UseAffinityMutationsParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- translation function
  t: (key: string, ...args: any[]) => string;
  setPendingMatchId: (id: string | null) => void;
}

export function useAffinityMutations({ t, setPendingMatchId }: UseAffinityMutationsParams) {
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
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
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
    onError: (_err: unknown, _matchId: string, context: Record<string, unknown> | undefined) => {
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

  return {
    acceptRouteAffinityMutation,
    rejectRouteAffinityMutation,
    removeRouteAffinityMutation,
    acceptTelemetryAffinityMutation,
    rejectTelemetryAffinityMutation,
    removeTelemetryAffinityMutation,
  };
}

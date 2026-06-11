import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useColors } from "@/hooks/useColors";
import { queryClient, apiRequest, ServerBusyError } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/language-context";

import { MatchHeader } from "@/components/match/MatchHeader";
import { TabBar, TabKey } from "@/components/match/TabBar";

import { MatchEmptyState } from "@/components/match/tabs/MatchEmptyState";
import { BikerInfoBanner } from "@/components/match/tabs/BikerInfoBanner";
import { MusicCriteriaChip } from "@/components/match/tabs/MusicCriteriaChip";
import { MatchCardStack } from "@/components/match/tabs/MatchCardStack";
import { MatchFiltersPanel } from "@/components/match/tabs/MatchFiltersPanel";
import { NegativeSuggestionsCard } from "@/components/match/tabs/NegativeSuggestionsCard";
import { PlannedRouteInvitesTab } from "@/components/match/tabs/PlannedRouteInvitesTab";
import { PlannedRouteInviteBanner } from "@/components/match/tabs/PlannedRouteInviteBanner";
import { useRenderItem } from "@/components/match/useRenderItem";
import { useMusicMatchFeature } from "@/components/match/useMusicMatchFeature";
import { styles } from "@/components/match/match.styles";

export default function MatchScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("zavorrine");
  const [propProfilePendingId, setPropProfilePendingId] = useState<string | null>(null);
  const [giriBannerDismissed, setGiriBannerDismissed] = useState(false);
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [distanceMode, setDistanceMode] = useState<"all" | "km">("all");
  const [distanceKm, setDistanceKm] = useState<string>("50");
  const [pendingKm, setPendingKm] = useState<string>("50");
  const [musicCriteria, setMusicCriteria] = useState<string>("songs,genre");
  const [musicMinSongs, setMusicMinSongs] = useState<number>(5);

  const { data: refetchIntervalData } = useQuery<{ seconds: number }>({
    queryKey: ["/api/settings/profile-refetch-interval"],
  });
  const profileRefetchMs = (refetchIntervalData?.seconds ?? 30) * 1000;

  const { data: myProfile } = useQuery<{ latitude?: number | null; longitude?: number | null }>({
    queryKey: ["/api/users/profile"],
    enabled: !!user,
    refetchInterval: profileRefetchMs,
  });

  useEffect(() => {
    if (tabParam === "giri") {
      setActiveTab("giri");
    }
  }, [tabParam]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.multiGet(["match_distance_mode", "match_distance_km"]).then(pairs => {
        const mode = pairs[0][1];
        const km = pairs[1][1];
        if (mode === "all" || mode === "km") setDistanceMode(mode);
        if (km) { setDistanceKm(km); setPendingKm(km); }
      }).catch(() => {});
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (activeTab !== "music") return;
      AsyncStorage.multiGet(["music_match_criteria", "music_match_logic", "music_match_min_songs"])
        .then(pairs => {
          const criteria = pairs[0][1] ?? "songs,genre";
          const minS = pairs[2][1] ?? "5";
          setMusicCriteria(criteria);
          setMusicMinSongs(parseInt(minS, 10) || 5);
        })
        .catch(() => {});
    }, [activeTab])
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match data shape varies
  const { data: proposalMatches, isLoading: proposalLoading, refetch: proposalRefetch, isRefetching: proposalRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match data shape varies
  const { data: garageMatches, isLoading: garageLoading, refetch: garageRefetch, isRefetching: garageRefetching, isFetching: garageIsFetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/garage-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match data shape varies
  const { data: bikerMatches, isLoading: bikerLoading, refetch: bikerRefetch, isRefetching: bikerRefetching, isFetching: bikerIsFetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/biker-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: freshMatchesList } = useQuery<Array<{ id: string; freshness: number }>>({
    queryKey: ["/api/proposals/matches/fresh"],
    enabled: !!user,
    refetchInterval: 60000,
    refetchOnMount: true,
  });
  const freshIds = useMemo(
    () => new Set((freshMatchesList ?? []).map((m) => m.id)),
    [freshMatchesList],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user list shape
  const { data: blockedUsers, isLoading: blockedLoading, refetch: blockedRefetch, isRefetching: blockedRefetching } = useQuery<any[]>({
    queryKey: ["/api/users/blocked"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match data shape varies
  const { data: acceptedMatches, isLoading: acceptedLoading, refetch: acceptedRefetch, isRefetching: acceptedRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/matches/accepted"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match data shape varies
  const { data: propProfileMatches, isLoading: propProfileLoading, refetch: propProfileRefetch, isRefetching: propProfileRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/proposal-profile-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match data shape varies
  const { data: routeAffinityMatches, isLoading: routeAffinityLoading, refetch: routeAffinityRefetch, isRefetching: routeAffinityRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/route-affinity-matches"],
    enabled: !!user,
    refetchInterval: 60000,
    refetchOnMount: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match data shape varies
  const { data: telemetryAffinityMatches, isLoading: telemetryAffinityLoading, refetch: telemetryAffinityRefetch, isRefetching: telemetryAffinityRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/telemetry-affinity-matches"],
    enabled: !!user,
    refetchInterval: 60000,
    refetchOnMount: true,
  });

  const { data: plannedRouteInvitesData, refetch: plannedRouteInvitesRefetch } = useQuery<{ count: number; invites: any[] }>({
    queryKey: ["/api/planned-route-invites/mine"],
    enabled: !!user,
    refetchInterval: 60000,
    refetchOnMount: true,
  });

  const { data: lastfmStatus } = useQuery<{ connected: boolean; username?: string }>({
    queryKey: ["/api/lastfm/status"],
    enabled: !!user,
  });

  const { musicMatches, musicLoading, musicRefetch, musicRefetching, isServerBusy, acceptMusicMutation, rejectMusicMutation } = useMusicMatchFeature({
    activeTab,
    lastfmConnected: lastfmStatus?.connected === true,
  });

  const acceptMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/matches/${matchId}/accept`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/matches"] });
      const previousMatches = queryClient.getQueryData(["/api/proposals/matches"]);
      queryClient.setQueryData(["/api/proposals/matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousMatches };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousMatches };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/garage-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousGarage };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/garage-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousGarage };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/biker-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousBiker };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/biker-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousBiker };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/proposal-profile-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousPropProfile };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
      setPropProfilePendingId(null);
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/proposal-profile-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousPropProfile };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/route-affinity-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousRouteAffinity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/route-affinity-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousRouteAffinity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/route-affinity-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousRouteAffinity, previousAccepted };
    },
    onError: (_err, _matchId, context: any) => {
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

  // Task #3393 — mutations per i match telemetry-affinity (stile di guida).
  const acceptTelemetryAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/telemetry-affinity-matches/${matchId}/accept`),
    onMutate: async (matchId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
      const previousTelemetryAffinity = queryClient.getQueryData(["/api/proposals/telemetry-affinity-matches"]);
      queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousTelemetryAffinity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
      setPendingMatchId(null);
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousTelemetryAffinity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/telemetry-affinity-matches"] });
    },
    onError: (_err: unknown, _matchId: string, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/telemetry-affinity-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousTelemetryAffinity, previousAccepted };
    },
    onError: (_err, _matchId, context: any) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape
      if ((data as any).id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape
        router.push(`/chat/${(data as any).id}` as never);
      }
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
      queryClient.setQueryData(["/api/proposals/garage-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousGarage, previousAccepted };
    },
    onError: (_err, _matchId, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/biker-matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousBiker, previousAccepted };
    },
    onError: (_err, _matchId, context: any) => {
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
      queryClient.setQueryData(["/api/proposals/matches"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      queryClient.setQueryData(["/api/proposals/matches/accepted"], (old: any[]) =>
        Array.isArray(old) ? old.filter((m: any) => m.id !== matchId) : old,
      );
      return { previousProposal, previousAccepted };
    },
    onError: (_err, _matchId, context: any) => {
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
  }, [distanceMode, pendingKm, resetAndRematchMutation, t]);

  const confirmRemoveGarageMatch = useCallback((id: string) => {
    Alert.alert(t("common.confirm"), t("match.confirmRemoveMatch"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => removeGarageMatchMutation.mutate(id) },
    ]);
  }, [removeGarageMatchMutation, t]);

  const confirmRemoveBikerMatch = useCallback((id: string) => {
    Alert.alert(t("common.confirm"), t("match.confirmRemoveMatch"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => removeBikerMatchMutation.mutate(id) },
    ]);
  }, [removeBikerMatchMutation, t]);

  const confirmRemoveProposalMatch = useCallback((id: string) => {
    Alert.alert(t("common.confirm"), t("match.confirmRemoveMatch"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => removeProposalMatchMutation.mutate(id) },
    ]);
  }, [removeProposalMatchMutation, t]);

  const onRefresh = useCallback(() => {
    if (activeTab === "proposals") proposalRefetch();
    else if (activeTab === "zavorrine") garageRefetch();
    else if (activeTab === "biker") bikerRefetch();
    else if (activeTab === "blacklist") blockedRefetch();
    else if (activeTab === "music") musicRefetch();
    else if (activeTab === "accepted") acceptedRefetch();
    else if (activeTab === "propProfile") propProfileRefetch();
    else if (activeTab === "route") routeAffinityRefetch();
    else if (activeTab === "telemetry") telemetryAffinityRefetch();
    else if (activeTab === "giri") plannedRouteInvitesRefetch();
  }, [activeTab, proposalRefetch, garageRefetch, bikerRefetch, blockedRefetch, musicRefetch, acceptedRefetch, propProfileRefetch, routeAffinityRefetch, telemetryAffinityRefetch, plannedRouteInvitesRefetch]);

  const handleUnblock = useCallback((blockedUserId: string) => {
    Alert.alert(t("common.confirm"), t("match.confirmUnblock"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("match.unblock"), onPress: () => unblockMutation.mutate(blockedUserId) },
    ]);
  }, [unblockMutation, t]);

  const currentList = useMemo(() => {
    if (activeTab === "proposals") return proposalMatches?.filter(m => m.status === "pending") || [];
    if (activeTab === "zavorrine") return garageMatches?.filter(m => m.status === "new") || [];
    if (activeTab === "biker") return bikerMatches?.filter(m => m.status === "new") || [];
    if (activeTab === "blacklist") return blockedUsers || [];
    if (activeTab === "music") return musicMatches || [];
    if (activeTab === "propProfile") return propProfileMatches?.filter(m => m.status === "new") || [];
    if (activeTab === "route") {
      return (routeAffinityMatches?.filter(m => m.status === "new") || []).map(m => ({ ...m, _matchType: "routeAffinity" }));
    }
    if (activeTab === "telemetry") {
      return (telemetryAffinityMatches?.filter(m => m.status === "new") || []).map(m => ({ ...m, _matchType: "telemetryAffinity" }));
    }
    if (activeTab === "accepted") {
      const g = (garageMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "garage" }));
      const b = (bikerMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "biker" }));
      const p = (proposalMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "proposal" }));
      const pp = (propProfileMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "propProfile" }));
      const ra = (routeAffinityMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "routeAffinity" }));
      const ta = (telemetryAffinityMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "telemetryAffinity" }));
      const acc = (acceptedMatches || []).map(m => ({ ...m, _matchType: "generic" }));
      return [...g, ...b, ...p, ...pp, ...ra, ...ta, ...acc].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    }
    return [];
  }, [activeTab, proposalMatches, garageMatches, bikerMatches, blockedUsers, musicMatches, acceptedMatches, propProfileMatches, routeAffinityMatches, telemetryAffinityMatches]);

  const isLoading = proposalLoading || garageLoading || bikerLoading || blockedLoading || musicLoading || acceptedLoading || propProfileLoading || routeAffinityLoading || telemetryAffinityLoading;
  const isRefetching = proposalRefetching || garageRefetching || bikerRefetching || blockedRefetching || musicRefetching || acceptedRefetching || propProfileRefetching || routeAffinityRefetching || telemetryAffinityRefetching;

  const renderItem = useRenderItem({
    activeTab,
    userId: user?.id,
    pendingMatchId,
    setPendingMatchId,
    propProfilePendingId,
    setPropProfilePendingId,
    freshIds,
    acceptMutation,
    rejectMutation,
    acceptMusicMutation,
    rejectMusicMutation,
    acceptGarageMutation,
    rejectGarageMutation,
    acceptBikerMutation,
    rejectBikerMutation,
    blockFromMatchMutation,
    acceptPropProfileMutation,
    rejectPropProfileMutation,
    acceptRouteAffinityMutation,
    rejectRouteAffinityMutation,
    removeRouteAffinityMutation,
    acceptTelemetryAffinityMutation,
    rejectTelemetryAffinityMutation,
    removeTelemetryAffinityMutation,
    startChatMutation,
    confirmRemoveGarageMatch,
    confirmRemoveBikerMatch,
    confirmRemoveProposalMatch,
    handleUnblock,
    t,
    locale,
  });

  const newGarageMatches = useMemo(() => garageMatches?.filter(m => m.status === "new") || [], [garageMatches]);
  const newBikerMatches = useMemo(() => bikerMatches?.filter(m => m.status === "new") || [], [bikerMatches]);
  const newProposalMatches = useMemo(() => proposalMatches?.filter(m => m.status === "pending") || [], [proposalMatches]);
  const newPropProfileMatches = useMemo(() => propProfileMatches?.filter(m => m.status === "new") || [], [propProfileMatches]);
  const newTelemetryMatches = useMemo(() => telemetryAffinityMatches?.filter(m => m.status === "new") || [], [telemetryAffinityMatches]);

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "biker", label: t("match.tabBiker"), icon: "bicycle", count: newBikerMatches.length },
    { key: "zavorrine", label: t("match.tabZavorrine"), icon: "person", count: newGarageMatches.length },
    { key: "music", label: t("match.tabMusic"), icon: "musical-notes", count: 0 },
    { key: "proposals", label: t("match.tabProposals"), icon: "flash", count: newProposalMatches.length },
    { key: "propProfile", label: t("match.tabPropProfile"), icon: "location", count: newPropProfileMatches.length },
    { key: "route", label: t("match.tabRoute"), icon: "map", count: (routeAffinityMatches?.filter((m) => m.status === "new") || []).length },
    { key: "telemetry", label: t("match.tabTelemetry"), icon: "speedometer", count: newTelemetryMatches.length },
    { key: "giri", label: t("match.tabGiri"), icon: "map-outline", count: plannedRouteInvitesData?.count ?? 0 },
    { key: "accepted", label: t("match.tabAccepted"), icon: "checkmark-circle", count: 0 },
    { key: "blacklist", label: t("match.tabBlacklist"), icon: "ban", count: 0 },
  ];

  const EMPTY_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }> = {
    zavorrine: { icon: "person-outline",          title: t("match.emptyZavorrinaTitle"),    desc: t("match.emptyZavorrinaDesc") },
    biker:     { icon: "bicycle-outline",         title: t("match.emptyBikerTitle"),        desc: t("match.emptyBikerDesc") },
    music:     { icon: "musical-notes-outline",   title: t("match.emptyMusicNoMatchTitle"), desc: t("match.emptyMusicNoMatchDesc") },
    accepted:  { icon: "checkmark-circle-outline",title: t("match.emptyAcceptedTitle"),     desc: t("match.emptyAcceptedDesc") },
    blacklist: { icon: "ban-outline",             title: t("match.emptyBlacklistTitle"),    desc: t("match.emptyBlacklistDesc") },
    propProfile:{ icon: "location-outline",       title: t("match.emptyPropProfileTitle"),  desc: t("match.emptyPropProfileDesc") },
    route:     { icon: "map-outline",             title: t("match.emptyRouteTitle"),        desc: t("match.emptyRouteDesc") },
    telemetry: { icon: "speedometer-outline",     title: t("match.emptyTelemetryTitle"),    desc: t("match.emptyTelemetryDesc") },
    giri:      { icon: "map-outline",             title: t("match.emptyGiriTitle"),         desc: t("match.emptyGiriDesc") },
  };
  const _emptyMeta = EMPTY_META[activeTab] ?? { icon: "flash-outline" as keyof typeof Ionicons.glyphMap, title: t("match.emptyProposalsTitle"), desc: t("match.emptyProposalsDesc") };
  const getEmptyIcon = (): keyof typeof Ionicons.glyphMap => _emptyMeta.icon;
  const getEmptyTitle = () => _emptyMeta.title;
  const getEmptyDesc = () => _emptyMeta.desc;

  const isRematching = resetAndRematchMutation.isPending;
  const isAnyRefetching = garageIsFetching || bikerIsFetching || proposalRefetching;
  const myLat = myProfile?.latitude;
  const myLng = myProfile?.longitude;

  const kmLimit = parseInt(distanceKm, 10) || 50;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <InlineMiniPlayer />
      <MatchHeader title={t("match.title")} />

      <MatchFiltersPanel
        distanceMode={distanceMode}
        setDistanceMode={(mode) => {
          const wasKm = distanceMode === "km" && mode === "all";
          setDistanceMode(mode);
          AsyncStorage.multiSet([["match_distance_mode", mode], ["match_distance_km", distanceKm]]).catch(() => {});
          if (wasKm) resetAndRematchMutation.mutate();
        }}
        pendingKm={pendingKm}
        setPendingKm={setPendingKm}
        isRematching={isRematching}
        isAnyRefetching={isAnyRefetching}
        onApplyDistance={handleResetAndRematch}
        myLat={myLat}
        myLng={myLng}
      />

      <TabBar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === "giri") setGiriBannerDismissed(true);
        }}
        tabs={tabs}
      />

      <NegativeSuggestionsCard />

      <BikerInfoBanner visible={activeTab === "biker"} />

      <PlannedRouteInviteBanner
        count={activeTab !== "giri" && !giriBannerDismissed ? (plannedRouteInvitesData?.count ?? 0) : 0}
        onPress={() => {
          setActiveTab("giri");
          setGiriBannerDismissed(true);
        }}
        onDismiss={() => setGiriBannerDismissed(true)}
      />

      <MusicCriteriaChip
        visible={activeTab === "music" && lastfmStatus?.connected === true}
        musicCriteria={musicCriteria}
        musicMinSongs={musicMinSongs}
        distanceMode={distanceMode}
        kmLimit={kmLimit}
      />

      {activeTab === "giri" ? (
        <PlannedRouteInvitesTab />
      ) : activeTab === "music" && lastfmStatus?.connected !== true ? (
        <MatchEmptyState
          icon="musical-notes-outline"
          title={t("match.emptyMusicTitle")}
          description={t("match.emptyMusicDesc")}
        />
      ) : (
        <MatchCardStack
          currentList={currentList}
          renderItem={renderItem}
          isRefetching={isRefetching}
          onRefresh={onRefresh}
          isLoading={isLoading}
          isServerBusy={isServerBusy}
          activeTab={activeTab}
          getEmptyIcon={getEmptyIcon}
          getEmptyTitle={getEmptyTitle}
          getEmptyDesc={getEmptyDesc}
        />
      )}
    </View>
  );
}

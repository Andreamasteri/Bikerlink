// LARGE-FILE-LOCKED — limite: 719 righe (attuali: 719)
// Aggiungi nuove funzionalità in: app/(tabs)/match-extra.tsx
// Motivo: file delicato di dimensione media. Splittare ora introduce rischio.
//         Vedi Task #2584 (regola 600 righe) e Task "Lock dimensione file priorità media".

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useColors } from "@/hooks/useColors";
import { queryClient, apiRequest, ServerBusyError } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/language-context";

import { MatchHeader } from "@/components/match/MatchHeader";
import { GarageMatchCard, BikerBikerMatchCard, MatchCardFull, ProposalProfileMatchCard } from "@/components/match/MatchCard";
import { RouteAffinityMatchCard } from "@/components/match/RouteAffinityMatchCard";
import { TabBar, TabKey } from "@/components/match/TabBar";

import { MatchEmptyState } from "@/components/match/tabs/MatchEmptyState";
import { BikerInfoBanner } from "@/components/match/tabs/BikerInfoBanner";
import { MusicCriteriaChip } from "@/components/match/tabs/MusicCriteriaChip";
import { BlacklistCard } from "@/components/match/tabs/BlacklistCard";
import { MusicMatchCard } from "@/components/match/tabs/MusicMatchCard";
import { MatchCardStack } from "@/components/match/tabs/MatchCardStack";
import { MatchFiltersPanel } from "@/components/match/tabs/MatchFiltersPanel";
import { NegativeSuggestionsCard } from "@/components/match/tabs/NegativeSuggestionsCard";

export default function MatchScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("zavorrine");
  const [propProfilePendingId, setPropProfilePendingId] = useState<string | null>(null);
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

  const { data: lastfmStatus } = useQuery<{ connected: boolean; username?: string }>({
    queryKey: ["/api/music/lastfm/status"],
    enabled: !!user,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- music match shape
  const { data: musicMatches, isLoading: musicLoading, refetch: musicRefetch, isRefetching: musicRefetching, error: musicError } = useQuery<any[]>({
    queryKey: ["/api/music/matches"],
    enabled: !!user && activeTab === "music" && lastfmStatus?.connected === true,
    refetchInterval: 60000,
  });

  const isServerBusy = musicError instanceof ServerBusyError;

  const acceptMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/matches/${matchId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: () => setPendingMatchId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/matches/${matchId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
  });

  const acceptGarageMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/garage-matches/${matchId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: () => setPendingMatchId(null),
  });

  const rejectGarageMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/garage-matches/${matchId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
  });

  const acceptBikerMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/biker-matches/${matchId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
      setPendingMatchId(null);
    },
    onError: () => setPendingMatchId(null),
  });

  const rejectBikerMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/biker-matches/${matchId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
    },
  });

  const acceptPropProfileMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/proposal-profile-matches/${matchId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
      setPropProfilePendingId(null);
    },
    onError: () => setPropProfilePendingId(null),
  });

  const rejectPropProfileMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/proposal-profile-matches/${matchId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/proposal-profile-matches"] });
    },
  });

  const acceptRouteAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/route-affinity-matches/${matchId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
      setPendingMatchId(null);
    },
    onError: () => setPendingMatchId(null),
  });

  const rejectRouteAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("POST", `/api/proposals/route-affinity-matches/${matchId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
    },
  });

  const removeRouteAffinityMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/route-affinity-matches/${matchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/route-affinity-matches"] });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (blockedUserId: string) => apiRequest("DELETE", `/api/users/blocked/${blockedUserId}`),
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
    mutationFn: (targetUserId: string) => apiRequest("POST", "/api/users/block", { targetUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
      Alert.alert(t("common.success"), t("match.userBlocked"));
    },
  });

  const removeGarageMatchMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/garage-matches/${matchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
    },
  });

  const removeBikerMatchMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/biker-matches/${matchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches/accepted"] });
    },
  });

  const removeProposalMatchMutation = useMutation({
    mutationFn: (matchId: string) => apiRequest("DELETE", `/api/proposals/matches/${matchId}`),
    onSuccess: () => {
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
  }, [activeTab, proposalRefetch, garageRefetch, bikerRefetch, blockedRefetch, musicRefetch, acceptedRefetch, propProfileRefetch, routeAffinityRefetch]);

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
    if (activeTab === "route") return routeAffinityMatches?.filter(m => m.status === "new") || [];
    if (activeTab === "accepted") {
      const g = (garageMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "garage" }));
      const b = (bikerMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "biker" }));
      const p = (proposalMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "proposal" }));
      const pp = (propProfileMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "propProfile" }));
      const ra = (routeAffinityMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "routeAffinity" }));
      const acc = (acceptedMatches || []).map(m => ({ ...m, _matchType: "generic" }));
      return [...g, ...b, ...p, ...pp, ...ra, ...acc].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    }
    return [];
  }, [activeTab, proposalMatches, garageMatches, bikerMatches, blockedUsers, musicMatches, acceptedMatches, propProfileMatches, routeAffinityMatches]);

  const isLoading = proposalLoading || garageLoading || bikerLoading || blockedLoading || musicLoading || acceptedLoading || propProfileLoading || routeAffinityLoading;
  const isRefetching = proposalRefetching || garageRefetching || bikerRefetching || blockedRefetching || musicRefetching || acceptedRefetching || propProfileRefetching || routeAffinityRefetching;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- item shape varies by tab
  const renderItem = useCallback(({ item }: { item: any }) => {
    if (activeTab === "blacklist") {
      return (
        <BlacklistCard item={item} onUnblock={handleUnblock} />
      );
    }

    if (activeTab === "music") {
      return (
        <MusicMatchCard item={item} onSendMessage={(userId) => startChatMutation.mutate(userId)} />
      );
    }

    if (activeTab === "propProfile") {
      const isBiker = item.bikerId === user?.id;
      const otherUserId = isBiker ? item.zavarrinaId : item.bikerId;
      return (
        <ProposalProfileMatchCard
          match={{ ...item, isFresh: freshIds.has(item.id) }}
          currentUserId={user?.id || ""}
          onAccept={() => {
            setPropProfilePendingId(item.id);
            acceptPropProfileMutation.mutate(item.id);
          }}
          onReject={() => rejectPropProfileMutation.mutate(item.id)}
          onChatPress={item.status === "accepted" ? () => startChatMutation.mutate(otherUserId) : undefined}
          isPending={propProfilePendingId === item.id}
          t={t}
          locale={locale}
        />
      );
    }

    if (activeTab === "accepted") {
      if (item._matchType === "biker") {
        const isBiker1 = item.biker1Id === user?.id;
        const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
        return (
          <BikerBikerMatchCard
            match={{ ...item, isFresh: freshIds.has(item.id) }}
            currentUserId={user?.id || ""}
            onAccept={() => {}}
            onReject={() => {}}
            onBlock={() => {}}
            onChatPress={() => startChatMutation.mutate(otherUserId)}
            onRemove={() => confirmRemoveBikerMatch(item.id)}
            isPending={false}
            t={t}
            locale={locale}
          />
        );
      }
      if (item._matchType === "garage") {
        const isBiker = item.bikerId === user?.id;
        const otherUserId = isBiker ? item.zavarrinaId : item.bikerId;
        return (
          <GarageMatchCard
            match={{ ...item, isFresh: freshIds.has(item.id) }}
            currentUserId={user?.id || ""}
            onAccept={() => {}}
            onReject={() => {}}
            onChatPress={() => startChatMutation.mutate(otherUserId)}
            onRemove={() => confirmRemoveGarageMatch(item.id)}
            isPending={false}
            t={t}
            locale={locale}
          />
        );
      }
      if (item._matchType === "propProfile") {
        const otherUserId = item.bikerId === user?.id ? item.zavarrinaId : item.bikerId;
        return (
          <ProposalProfileMatchCard
            match={{ ...item, isFresh: freshIds.has(item.id) }}
            currentUserId={user?.id || ""}
            onAccept={() => {}}
            onReject={() => {}}
            onChatPress={() => startChatMutation.mutate(otherUserId)}
            isPending={false}
            t={t}
            locale={locale}
          />
        );
      }
      if (item._matchType === "routeAffinity") {
        const otherId: string = item.otherUserId ?? (item.userAId === user?.id ? item.userBId : item.userAId);
        return (
          <RouteAffinityMatchCard
            match={item}
            currentUserId={user?.id || ""}
            onAccept={() => {}}
            onReject={() => {}}
            onChatPress={() => startChatMutation.mutate(otherId)}
            onRemove={() => removeRouteAffinityMutation.mutate(item.id)}
            isPending={false}
            t={t}
            locale={locale}
          />
        );
      }
      return (
        <MatchCardFull
          match={{ ...item, isFresh: freshIds.has(item.id) }}
          currentUserId={user?.id || ""}
          onAccept={() => {}}
          onReject={() => {}}
          onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as never) : undefined}
          onRemove={() => confirmRemoveProposalMatch(item.id)}
          isPending={false}
          t={t}
          locale={locale}
        />
      );
    }

    if (activeTab === "route") {
      const otherId: string = item.otherUserId ?? (item.userAId === user?.id ? item.userBId : item.userAId);
      return (
        <RouteAffinityMatchCard
          match={item}
          currentUserId={user?.id || ""}
          onAccept={() => {
            setPendingMatchId(item.id);
            acceptRouteAffinityMutation.mutate(item.id);
          }}
          onReject={() => rejectRouteAffinityMutation.mutate(item.id)}
          onChatPress={item.status === "accepted" ? () => startChatMutation.mutate(otherId) : undefined}
          onRemove={item.status === "accepted" ? () => removeRouteAffinityMutation.mutate(item.id) : undefined}
          isPending={pendingMatchId === item.id}
          t={t}
          locale={locale}
        />
      );
    }

    if (activeTab === "biker") {
      const isBiker1 = item.biker1Id === user?.id;
      const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
      return (
        <BikerBikerMatchCard
          match={{ ...item, isFresh: freshIds.has(item.id) }}
          currentUserId={user?.id || ""}
          onAccept={() => {
            setPendingMatchId(item.id);
            acceptBikerMutation.mutate(item.id);
          }}
          onReject={() => rejectBikerMutation.mutate(item.id)}
          onBlock={() => {
            const nickname = (item.biker1Id === user?.id ? item.biker2Nickname : item.biker1Nickname) || t("match.thisUser");
            const msg = t("match.blockUserConfirmMsg").replace("{nickname}", nickname);
            Alert.alert(t("match.blockUserConfirmTitle"), msg, [
              { text: t("common.cancel"), style: "cancel" },
              { text: t("match.blockUser"), style: "destructive", onPress: () => blockFromMatchMutation.mutate(otherUserId) },
            ]);
          }}
          onChatPress={item.status === "accepted" ? () => startChatMutation.mutate(otherUserId) : undefined}
          onRemove={item.status === "accepted" ? () => confirmRemoveBikerMatch(item.id) : undefined}
          isPending={pendingMatchId === item.id}
          t={t}
          locale={locale}
        />
      );
    }
    if (activeTab === "zavorrine") {
      const isBiker = item.bikerId === user?.id;
      const otherUserId = isBiker ? item.zavarrinaId : item.bikerId;
      return (
        <GarageMatchCard
          match={{ ...item, isFresh: freshIds.has(item.id) }}
          currentUserId={user?.id || ""}
          onAccept={() => {
            setPendingMatchId(item.id);
            acceptGarageMutation.mutate(item.id);
          }}
          onReject={() => rejectGarageMutation.mutate(item.id)}
          onChatPress={item.status === "accepted" ? () => startChatMutation.mutate(otherUserId) : undefined}
          onRemove={item.status === "accepted" ? () => confirmRemoveGarageMatch(item.id) : undefined}
          isPending={pendingMatchId === item.id}
          t={t}
          locale={locale}
        />
      );
    }
    return (
      <MatchCardFull
        match={{ ...item, isFresh: freshIds.has(item.id) }}
        currentUserId={user?.id || ""}
        onAccept={() => {
          setPendingMatchId(item.id);
          acceptMutation.mutate(item.id);
        }}
        onReject={() => rejectMutation.mutate(item.id)}
        onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as never) : undefined}
        onRemove={item.status === "accepted" ? () => confirmRemoveProposalMatch(item.id) : undefined}
        isPending={pendingMatchId === item.id}
        t={t}
        locale={locale}
      />
    );
  }, [activeTab, user?.id, pendingMatchId, propProfilePendingId, acceptGarageMutation, rejectGarageMutation, acceptBikerMutation, rejectBikerMutation, blockFromMatchMutation, acceptMutation, rejectMutation, acceptPropProfileMutation, rejectPropProfileMutation, acceptRouteAffinityMutation, rejectRouteAffinityMutation, removeRouteAffinityMutation, startChatMutation, confirmRemoveGarageMatch, confirmRemoveBikerMatch, confirmRemoveProposalMatch, handleUnblock, router, t, locale, freshIds]);

  const newGarageMatches = useMemo(() => garageMatches?.filter(m => m.status === "new") || [], [garageMatches]);
  const newBikerMatches = useMemo(() => bikerMatches?.filter(m => m.status === "new") || [], [bikerMatches]);
  const newProposalMatches = useMemo(() => proposalMatches?.filter(m => m.status === "pending") || [], [proposalMatches]);
  const newPropProfileMatches = useMemo(() => propProfileMatches?.filter(m => m.status === "new") || [], [propProfileMatches]);

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "biker", label: t("match.tabBiker"), icon: "bicycle", count: newBikerMatches.length },
    { key: "zavorrine", label: t("match.tabZavorrine"), icon: "person", count: newGarageMatches.length },
    { key: "music", label: t("match.tabMusic"), icon: "musical-notes", count: 0 },
    { key: "proposals", label: t("match.tabProposals"), icon: "flash", count: newProposalMatches.length },
    { key: "propProfile", label: t("match.tabPropProfile"), icon: "location", count: newPropProfileMatches.length },
    { key: "route", label: t("match.tabRoute"), icon: "map", count: (routeAffinityMatches?.filter((m) => m.status === "new") || []).length },
    { key: "accepted", label: t("match.tabAccepted"), icon: "checkmark-circle", count: 0 },
    { key: "blacklist", label: t("match.tabBlacklist"), icon: "ban", count: 0 },
  ];

  const getEmptyIcon = (): keyof typeof Ionicons.glyphMap => {
    if (activeTab === "zavorrine") return "person-outline";
    if (activeTab === "biker") return "bicycle-outline";
    if (activeTab === "music") return "musical-notes-outline";
    if (activeTab === "accepted") return "checkmark-circle-outline";
    if (activeTab === "blacklist") return "ban-outline";
    if (activeTab === "propProfile") return "location-outline";
    if (activeTab === "route") return "map-outline";
    return "flash-outline";
  };

  const getEmptyTitle = () => {
    if (activeTab === "zavorrine") return t("match.emptyZavorrinaTitle");
    if (activeTab === "biker") return t("match.emptyBikerTitle");
    if (activeTab === "music") return t("match.emptyMusicNoMatchTitle");
    if (activeTab === "accepted") return t("match.emptyAcceptedTitle");
    if (activeTab === "blacklist") return t("match.emptyBlacklistTitle");
    if (activeTab === "propProfile") return t("match.emptyPropProfileTitle");
    if (activeTab === "route") return t("match.emptyRouteTitle");
    return t("match.emptyProposalsTitle");
  };

  const getEmptyDesc = () => {
    if (activeTab === "zavorrine") return t("match.emptyZavorrinaDesc");
    if (activeTab === "biker") return t("match.emptyBikerDesc");
    if (activeTab === "music") return t("match.emptyMusicNoMatchDesc");
    if (activeTab === "accepted") return t("match.emptyAcceptedDesc");
    if (activeTab === "blacklist") return t("match.emptyBlacklistDesc");
    if (activeTab === "propProfile") return t("match.emptyPropProfileDesc");
    if (activeTab === "route") return t("match.emptyRouteDesc");
    return t("match.emptyProposalsDesc");
  };

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

      <TabBar activeTab={activeTab} setActiveTab={setActiveTab} tabs={tabs} />

      <NegativeSuggestionsCard />

      <BikerInfoBanner visible={activeTab === "biker"} />

      <MusicCriteriaChip 
        visible={activeTab === "music" && lastfmStatus?.connected === true}
        musicCriteria={musicCriteria}
        musicMinSongs={musicMinSongs}
        distanceMode={distanceMode}
        kmLimit={kmLimit}
      />

      {activeTab === "music" && lastfmStatus?.connected !== true ? (
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});


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

import { FilterPanel } from "@/components/match/FilterPanel";
import { MatchHeader } from "@/components/match/MatchHeader";
import { GarageMatchCard, BikerBikerMatchCard, MatchCardFull } from "@/components/match/MatchCard";
import { MatchList } from "@/components/match/MatchList";
import { TabBar, TabKey } from "@/components/match/TabBar";

import { MatchEmptyState } from "@/components/match/tabs/MatchEmptyState";
import { BikerInfoBanner } from "@/components/match/tabs/BikerInfoBanner";
import { MusicCriteriaChip } from "@/components/match/tabs/MusicCriteriaChip";
import { BlacklistCard } from "@/components/match/tabs/BlacklistCard";
import { MusicMatchCard } from "@/components/match/tabs/MusicMatchCard";
import { MatchCardStack } from "@/components/match/tabs/MatchCardStack";
import { MatchFiltersPanel } from "@/components/match/tabs/MatchFiltersPanel";

export default function MatchScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("zavorrine");
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
        if (mode === "all" || mode === "km") setDistanceMode(mode as any);
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

  const { data: proposalMatches, isLoading: proposalLoading, refetch: proposalRefetch, isRefetching: proposalRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: garageMatches, isLoading: garageLoading, refetch: garageRefetch, isRefetching: garageRefetching, isFetching: garageIsFetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/garage-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: bikerMatches, isLoading: bikerLoading, refetch: bikerRefetch, isRefetching: bikerRefetching, isFetching: bikerIsFetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/biker-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: blockedUsers, isLoading: blockedLoading, refetch: blockedRefetch, isRefetching: blockedRefetching } = useQuery<any[]>({
    queryKey: ["/api/users/blocked"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: acceptedMatches, isLoading: acceptedLoading, refetch: acceptedRefetch, isRefetching: acceptedRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/matches/accepted"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: lastfmStatus } = useQuery<{ connected: boolean; username?: string }>({
    queryKey: ["/api/music/lastfm/status"],
    enabled: !!user,
  });

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
      if ((data as any).id) {
        router.push(`/chat/${(data as any).id}` as any);
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
  }, [activeTab, proposalRefetch, garageRefetch, bikerRefetch, blockedRefetch, musicRefetch, acceptedRefetch]);

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
    if (activeTab === "accepted") {
      const g = (garageMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "garage" }));
      const b = (bikerMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "biker" }));
      const p = (proposalMatches?.filter(m => m.status === "accepted") || []).map(m => ({ ...m, _matchType: "proposal" }));
      const acc = (acceptedMatches || []).map(m => ({ ...m, _matchType: "generic" }));
      return [...g, ...b, ...p, ...acc].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    }
    return [];
  }, [activeTab, proposalMatches, garageMatches, bikerMatches, blockedUsers, musicMatches, acceptedMatches]);

  const isLoading = proposalLoading || garageLoading || bikerLoading || blockedLoading || musicLoading || acceptedLoading;
  const isRefetching = proposalRefetching || garageRefetching || bikerRefetching || blockedRefetching || musicRefetching || acceptedRefetching;

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

    if (activeTab === "accepted") {
      if (item._matchType === "biker") {
        const isBiker1 = item.biker1Id === user?.id;
        const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
        return (
          <BikerBikerMatchCard
            match={item}
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
            match={item}
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
      return (
        <MatchCardFull
          match={item}
          currentUserId={user?.id || ""}
          onAccept={() => {}}
          onReject={() => {}}
          onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as any) : undefined}
          onRemove={() => confirmRemoveProposalMatch(item.id)}
          isPending={false}
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
          match={item}
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
          match={item}
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
        match={item}
        currentUserId={user?.id || ""}
        onAccept={() => {
          setPendingMatchId(item.id);
          acceptMutation.mutate(item.id);
        }}
        onReject={() => rejectMutation.mutate(item.id)}
        onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as any) : undefined}
        onRemove={item.status === "accepted" ? () => confirmRemoveProposalMatch(item.id) : undefined}
        isPending={pendingMatchId === item.id}
        t={t}
        locale={locale}
      />
    );
  }, [activeTab, user?.id, pendingMatchId, acceptGarageMutation, rejectGarageMutation, acceptBikerMutation, rejectBikerMutation, blockFromMatchMutation, acceptMutation, rejectMutation, startChatMutation, confirmRemoveGarageMatch, confirmRemoveBikerMatch, confirmRemoveProposalMatch, handleUnblock, router, t, locale]);

  const newGarageMatches = useMemo(() => garageMatches?.filter(m => m.status === "new") || [], [garageMatches]);
  const newBikerMatches = useMemo(() => bikerMatches?.filter(m => m.status === "new") || [], [bikerMatches]);
  const newProposalMatches = useMemo(() => proposalMatches?.filter(m => m.status === "pending") || [], [proposalMatches]);

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "zavorrine", label: t("match.tabZavorrine"), icon: "person", count: newGarageMatches.length },
    { key: "biker", label: t("match.tabBiker"), icon: "bicycle", count: newBikerMatches.length },
    { key: "proposals", label: t("match.tabProposals"), icon: "flash", count: newProposalMatches.length },
    { key: "music", label: t("match.tabMusic"), icon: "musical-notes", count: 0 },
    { key: "accepted", label: t("match.tabAccepted"), icon: "checkmark-circle", count: 0 },
    { key: "blacklist", label: t("match.tabBlacklist"), icon: "ban", count: 0 },
  ];

  const getEmptyIcon = (): keyof typeof Ionicons.glyphMap => {
    if (activeTab === "zavorrine") return "person-outline";
    if (activeTab === "biker") return "bicycle-outline";
    if (activeTab === "music") return "musical-notes-outline";
    if (activeTab === "accepted") return "checkmark-circle-outline";
    if (activeTab === "blacklist") return "ban-outline";
    return "flash-outline";
  };

  const getEmptyTitle = () => {
    if (activeTab === "zavorrine") return t("match.emptyZavorrinaTitle");
    if (activeTab === "biker") return t("match.emptyBikerTitle");
    if (activeTab === "music") return t("match.emptyMusicNoMatchTitle");
    if (activeTab === "accepted") return t("match.emptyAcceptedTitle");
    if (activeTab === "blacklist") return t("match.emptyBlacklistTitle");
    return t("match.emptyProposalsTitle");
  };

  const getEmptyDesc = () => {
    if (activeTab === "zavorrine") return t("match.emptyZavorrinaDesc");
    if (activeTab === "biker") return t("match.emptyBikerDesc");
    if (activeTab === "music") return t("match.emptyMusicNoMatchDesc");
    if (activeTab === "accepted") return t("match.emptyAcceptedDesc");
    if (activeTab === "blacklist") return t("match.emptyBlacklistDesc");
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
      <MatchHeader title={t("match.title")} systemDesc={t("match.systemDesc")} />

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


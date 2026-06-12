import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useColors } from "@/hooks/useColors";
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
import { useMatchMutations } from "@/components/match/useMatchMutations";
import { styles } from "@/components/match/match.styles";

interface ApiMatchItem {
  id: string;
  status?: string;
  updatedAt?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

export default function MatchScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("zavorrine");
  const [giriBannerDismissed, setGiriBannerDismissed] = useState(false);
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

  useEffect(() => { if (tabParam === "giri") setActiveTab("giri"); }, [tabParam]);

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

  const { data: proposalMatches, isLoading: proposalLoading, refetch: proposalRefetch, isRefetching: proposalRefetching } = useQuery<ApiMatchItem[]>({
    queryKey: ["/api/proposals/matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: garageMatches, isLoading: garageLoading, refetch: garageRefetch, isRefetching: garageRefetching, isFetching: garageIsFetching } = useQuery<ApiMatchItem[]>({
    queryKey: ["/api/proposals/garage-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: bikerMatches, isLoading: bikerLoading, refetch: bikerRefetch, isRefetching: bikerRefetching, isFetching: bikerIsFetching } = useQuery<ApiMatchItem[]>({
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

  const { data: blockedUsers, isLoading: blockedLoading, refetch: blockedRefetch, isRefetching: blockedRefetching } = useQuery<ApiMatchItem[]>({
    queryKey: ["/api/users/blocked"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: acceptedMatches, isLoading: acceptedLoading, refetch: acceptedRefetch, isRefetching: acceptedRefetching } = useQuery<ApiMatchItem[]>({
    queryKey: ["/api/proposals/matches/accepted"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: propProfileMatches, isLoading: propProfileLoading, refetch: propProfileRefetch, isRefetching: propProfileRefetching } = useQuery<ApiMatchItem[]>({
    queryKey: ["/api/proposals/proposal-profile-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: routeAffinityMatches, isLoading: routeAffinityLoading, refetch: routeAffinityRefetch, isRefetching: routeAffinityRefetching } = useQuery<ApiMatchItem[]>({
    queryKey: ["/api/proposals/route-affinity-matches"],
    enabled: !!user,
    refetchInterval: 60000,
    refetchOnMount: true,
  });

  const { data: telemetryAffinityMatches, isLoading: telemetryAffinityLoading, refetch: telemetryAffinityRefetch, isRefetching: telemetryAffinityRefetching } = useQuery<ApiMatchItem[]>({
    queryKey: ["/api/proposals/telemetry-affinity-matches"],
    enabled: !!user,
    refetchInterval: 60000,
    refetchOnMount: true,
  });
  const { data: plannedRouteInvitesData, refetch: plannedRouteInvitesRefetch } = useQuery<{ count: number; invites: unknown[] }>({
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

  const {
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
    startChatMutation,
    blockFromMatchMutation,
    resetAndRematchMutation,
    handleResetAndRematch,
    confirmRemoveGarageMatch,
    confirmRemoveBikerMatch,
    confirmRemoveProposalMatch,
    handleUnblock,
  } = useMatchMutations({ distanceMode, distanceKm, pendingKm, setDistanceKm, t });

  const onRefresh = useCallback(() => {
    const refetchMap: Partial<Record<TabKey, () => void>> = {
      proposals: proposalRefetch, zavorrine: garageRefetch, biker: bikerRefetch,
      blacklist: blockedRefetch, music: musicRefetch, accepted: acceptedRefetch,
      propProfile: propProfileRefetch, route: routeAffinityRefetch,
      telemetry: telemetryAffinityRefetch, giri: plannedRouteInvitesRefetch,
    };
    refetchMap[activeTab]?.();
  }, [activeTab, proposalRefetch, garageRefetch, bikerRefetch, blockedRefetch, musicRefetch, acceptedRefetch, propProfileRefetch, routeAffinityRefetch, telemetryAffinityRefetch, plannedRouteInvitesRefetch]);

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
  const getEmptyTitle = () => _emptyMeta.title; const getEmptyDesc = () => _emptyMeta.desc;

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
        onPress={() => { setActiveTab("giri"); setGiriBannerDismissed(true); }}
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

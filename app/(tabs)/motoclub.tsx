import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  BackHandler,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useT } from "@/lib/language-context";

// Local Components
import { MotoClubCard, Club, UserClub } from "@/components/motoclub/MotoClubCard";
import { MotoClubSearch } from "@/components/motoclub/MotoClubSearch";
import { FeaturedClubsSection } from "@/components/motoclub/FeaturedClubsSection";
import { MotoClubInvites, Invite } from "@/components/motoclub/MotoClubInvites";
import { MotoClubMarketplace, MarketplaceMoto } from "@/components/motoclub/MotoClubMarketplace";
import { InvitesBanner } from "@/components/motoclub/InvitesBanner";

export default function MotoclubScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [tab, setTab] = useState<"all" | "mine" | "market">("all");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"" | "brand" | "model" | "custom">("");
  const [filterCountry, setFilterCountry] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showInvites, setShowInvites] = useState(false);

  useEffect(() => {
    if (!showInvites) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setShowInvites(false);
      return true;
    });
    return () => sub.remove();
  }, [showInvites]);

  const clubsUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.append("search", search.trim());
    if (filterType) p.append("type", filterType);
    if (filterCountry) p.append("country", filterCountry);
    const qs = p.toString();
    return qs ? `/api/motoclubs?${qs}` : "/api/motoclubs";
  }, [search, filterType, filterCountry]);

  const { data: clubs = [], isLoading: loadingClubs, refetch: refetchClubs } = useQuery<Club[]>({
    queryKey: [clubsUrl],
  });

  const { data: myClubs = [], refetch: refetchMine } = useQuery<UserClub[]>({
    queryKey: ["/api/motoclubs/me/clubs"],
  });

  const { data: featured } = useQuery<Club | null>({
    queryKey: ["/api/motoclubs/featured"],
  });

  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ["/api/motoclubs/invites"],
  });

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"],
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const { data: motoclubCreationData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/motoclub-user-creation"],
  });
  const motoclubCreationEnabled = motoclubCreationData?.enabled === true;

  const { data: creationStatus } = useQuery<{ status: string } | null>({
    queryKey: ["/api/motoclubs/creation-request/status"],
    enabled: motoclubCreationEnabled,
  });
  const hasPendingRequest = creationStatus?.status === "pending";

  const { data: marketplaceMotos = [], refetch: refetchMarket } = useQuery<MarketplaceMoto[]>({
    queryKey: ["/api/motoclubs/marketplace"],
    enabled: marketplaceEnabled && tab === "market",
  });

  const pendingInvites = invites.filter((i) => i.status === "pending");

  const myClubIds = useMemo(() => new Set(myClubs.map((c) => c.id)), [myClubs]);
  const myClubMap = useMemo(() => new Map(myClubs.map((c) => [c.id, c])), [myClubs]);

  const invalidateClubLists = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/motoclubs");
      },
    });
  }, [queryClient]);

  const joinMut = useMutation({
    mutationFn: (clubId: string) =>
      apiRequest("POST", `/api/motoclubs/${clubId}/join`),
    onSuccess: invalidateClubLists,
  });

  const leaveMut = useMutation({
    mutationFn: (clubId: string) =>
      apiRequest("POST", `/api/motoclubs/${clubId}/leave`),
    onSuccess: invalidateClubLists,
  });

  const respondMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "reject" }) =>
      apiRequest("PUT", `/api/motoclubs/invites/${id}/respond`, {
        response: action === "accept" ? "accepted" : "declined",
      }),
    onSuccess: invalidateClubLists,
  });

  const syncGarageMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/motoclubs/sync-garage");
      return res.json() as Promise<{ joined: number; message: string }>;
    },
    onSuccess: (data) => {
      invalidateClubLists();
      Alert.alert(
        data.joined > 0 ? t("motoclub.clubsFound") : t("motoclub.noClub"),
        data.message
      );
    },
    onError: () => {
      Alert.alert(t("common.error"), t("motoclub.syncError"));
    },
  });

  const handleJoin = useCallback(
    (clubId: string) => {
      joinMut.mutate(clubId);
    },
    [joinMut]
  );

  const handleLeave = useCallback(
    (clubId: string, name: string) => {
      Alert.alert(t("motoclub.leaveTitle"), t("motoclub.leaveMsg").replace("{name}", name), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("motoclub.leaveConfirm"), style: "destructive", onPress: () => leaveMut.mutate(clubId) },
      ]);
    },
    [leaveMut, t]
  );

  const handleOpenChat = useCallback(
    (clubId: string, conversationId?: string | null) => {
      const url = conversationId
        ? `/motoclub/${clubId}?conversationId=${conversationId}`
        : `/motoclub/${clubId}`;
      routerRef.current.push(url as never);
    },
    []
  );

  const displayedClubs = tab === "mine"
    ? clubs.filter((c) => myClubIds.has(c.id))
    : clubs;

  const topInset = insets.top;

  if (showInvites && pendingInvites.length > 0) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <MotoClubInvites
          pendingInvites={pendingInvites}
          clubs={clubs}
          onBack={() => setShowInvites(false)}
          onRespond={(id, action) => respondMut.mutate({ id, action })}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <InlineMiniPlayer />
      <MotoClubSearch
        search={search}
        setSearch={setSearch}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterType={filterType}
        setFilterType={setFilterType}
        filterCountry={filterCountry}
        setFilterCountry={setFilterCountry}
        tab={tab}
        setTab={setTab}
        marketplaceEnabled={marketplaceEnabled}
      />

      {tab === "market" && marketplaceEnabled ? (
        <MotoClubMarketplace
          myClubs={myClubs}
          marketplaceMotos={marketplaceMotos}
          onRefresh={() => { refetchMarket(); }}
          bottomInset={insets.bottom}
        />
      ) : loadingClubs ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={displayedClubs}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => { refetchClubs(); refetchMine(); }}
              tintColor={Colors.accent}
            />
          }
          ListHeaderComponent={
            <>
              <InvitesBanner
                count={pendingInvites.length}
                onPress={() => setShowInvites(true)}
              />
              {tab === "mine" && myClubs.length === 0 && (
                <TouchableOpacity
                  style={styles.syncBanner}
                  onPress={() => syncGarageMut.mutate()}
                  disabled={syncGarageMut.isPending}
                  activeOpacity={0.8}
                >
                  {syncGarageMut.isPending
                    ? <ActivityIndicator size="small" color={Colors.accent} />
                    : <Ionicons name="sync-outline" size={18} color={Colors.accent} />}
                  <Text style={styles.syncBannerText}>
                    {syncGarageMut.isPending ? t("motoclub.syncing") : t("motoclub.syncGarage")}
                  </Text>
                </TouchableOpacity>
              )}
              {tab === "all" && featured && !search && !filterType && !filterCountry && (
                <FeaturedClubsSection
                  club={featured}
                  myClubIds={myClubIds}
                  onJoin={handleJoin}
                />
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>
                {tab === "mine"
                  ? t("motoclub.noMineClub")
                  : t("motoclub.noClubFound")}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const myData = myClubMap.get(item.id);
            return (
              <MotoClubCard
                club={item}
                myClubIds={myClubIds}
                onJoin={handleJoin}
                onLeave={handleLeave}
                onOpenChat={handleOpenChat}
                joinedAt={myData?.joinedAt}
                role={myData?.role}
                conversationId={myData?.conversationId}
              />
            );
          }}
        />
      )}

      {motoclubCreationEnabled && !hasPendingRequest && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 16 }]}
          onPress={() => router.push("/motoclub/create" as never)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}
      {motoclubCreationEnabled && hasPendingRequest && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 16, backgroundColor: Colors.warning }]}
          onPress={() => router.push("/motoclub/create" as never)}
          activeOpacity={0.85}
        >
          <Ionicons name="time" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.accent + "12",
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  syncBannerText: { flex: 1, fontSize: 13, color: Colors.accent, fontFamily: "Inter_500Medium" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});

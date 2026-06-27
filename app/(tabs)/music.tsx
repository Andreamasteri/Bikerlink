import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { styles, lastfmBannerStyles } from "@/components/music/styles";

import {
  Tab,
  LASTFM_RED,
  SearchTrack,
  LibraryTrack,
  MusicMatch,
  SharedPlaylistEntry,
  ChatConversation
} from "@/components/music/types";

import { BraniTab } from "@/components/music/BraniTab";
import { MatchTab } from "@/components/music/MatchTab";
import { SharedPlaylistsTab } from "@/components/music/SharedPlaylistsTab";
import { MusicRadioTab } from "@/components/music/MusicRadioTab";
import { TelefonoTab } from "@/components/music/TelefonoTab";
import { LastfmLoginModal } from "@/components/music/LastfmLoginModal";
import { MusicPart2 } from "@/components/music/MusicTabPart2";

export default function MusicScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { tab: tabParam, playlistId: playlistIdParam } = useLocalSearchParams<{ tab?: string; playlistId?: string }>();

  const [activeTab, setActiveTab] = useState<Tab>("brani");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [matchCriteria, setMatchCriteria] = useState<string[]>(["songs", "genre"]);
  const [matchMaxKm, setMatchMaxKm] = useState(100);
  const [matchLogic, setMatchLogic] = useState<"tutti" | "almeno_uno">("almeno_uno");
  const [minSongs, setMinSongs] = useState(5);
  const [playlistOverride, setPlaylistOverride] = useState<{ nickname: string; tracks: LibraryTrack[] } | null>(null);

  const [pendingAddId, setPendingAddId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [isConnecting] = useState(false);
  const [searchNeedsReconnect, setSearchNeedsReconnect] = useState(false);

  const [lastfmModalVisible, setLastfmModalVisible] = useState(false);
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [sendingToConv, setSendingToConv] = useState<string | null>(null);

  const { user: currentUser } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const apiPrefix = "/api/lastfm";

  const statusQuery = useQuery<{ connected: boolean; displayName?: string; username?: string; trackCount: number }>({
    queryKey: [`${apiPrefix}/status`],
    staleTime: 60_000
  });

  const conversationsQuery = useQuery<ChatConversation[]>({
    queryKey: ["/api/chat/conversations"],
    enabled: sendModalVisible,
    staleTime: 30_000
  });

  const handleSendPlaylist = useCallback(async (conv: ChatConversation) => {
    const otherUser = conv.participants.find((p) => p.id !== currentUser?.id);
    if (!otherUser) return;
    setSendingToConv(conv.id);
    try {
      const res = await apiRequest("POST", `${apiPrefix}/share-playlist`, {
        toUserId: otherUser.id,
        conversationId: conv.id
      });
      const body = await res.json();
      if (!res.ok) {
        const msg = (body as { message?: string }).message ?? t("music.error");
        if (msg.toLowerCase().includes("nessuna traccia") || msg.toLowerCase().includes("nessun brano")) {
          Alert.alert(t("music.emptyPlaylistTitle"), t("music.connectFirstMsg"));
        } else {
          Alert.alert(t("music.error"), msg);
        }
        return;
      }
      setSendModalVisible(false);
      routerRef.current.push(`/chat/${conv.id}` as never);
    } catch {
      Alert.alert(t("music.error"), t("music.sendPlaylistError"));
    } finally {
      setSendingToConv(null);
    }
  }, [currentUser, apiPrefix, t]);

  useEffect(() => {
    if (tabParam === "ricevute" || tabParam === "match" || tabParam === "brani" || tabParam === "telefono") {
      setActiveTab(tabParam as Tab);
    }
  }, [tabParam]);

  useEffect(() => {
    if (!playlistIdParam) return;
    const numId = parseInt(playlistIdParam, 10);
    if (isNaN(numId)) return;
    const url = new URL(`${apiPrefix}/shared-playlists/${numId}`, getApiUrl());
    fetch(url.toString(), { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { id: number; fromUser: { nickname: string }; tracks: Array<{ trackId: string; trackName: string; artistName: string; albumName?: string | null; imageUrl?: string | null }> }) => {
        const mapped: LibraryTrack[] = data.tracks.map((t, i) => ({
          id: i,
          lastfmTrackId: t.trackId,
          trackName: t.trackName,
          artistName: t.artistName,
          albumName: t.albumName ?? null,
          imageUrl: t.imageUrl ?? null,
          popularity: 0,
          addedAt: ""
        }));
        setPlaylistOverride({ nickname: data.fromUser.nickname, tracks: mapped });
        setActiveTab("brani");
      })
      .catch(() => {
        Alert.alert(t("music.playlistUnavailable"), t("music.playlistUnavailableMsg"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistIdParam]);

  useEffect(() => {
    AsyncStorage.getMany(["music_match_criteria", "music_match_logic", "music_match_min_songs"])
      .then(result => {
        const criteria = result["music_match_criteria"];
        const logic = result["music_match_logic"];
        const minS = result["music_match_min_songs"];
        if (criteria) setMatchCriteria(criteria.split(",").filter(Boolean));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- logic value matches union type at runtime
        if (logic === "tutti" || logic === "almeno_uno") setMatchLogic(logic as any);
        if (minS) setMinSongs(parseInt(minS, 10) || 5);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setSearchNeedsReconnect(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const searchQuery = useQuery<{ tracks: SearchTrack[] }>({
    queryKey: [`${apiPrefix}/search`, debouncedQuery],
    queryFn: async () => {
      const url = new URL(`${apiPrefix}/search`, getApiUrl());
      url.searchParams.set("q", debouncedQuery);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) {
        let msg = `${res.status}`;
        try {
          const body = await res.json();
          if (typeof body.message === "string") msg = body.message;
        } catch (e) {
          console.warn("[music] search error body parse:", e);
        }
        throw new Error(msg);
      }
      setSearchNeedsReconnect(false);
      return res.json();
    },
    enabled: debouncedQuery.length >= 2 && activeTab === "brani",
    staleTime: 30_000
  });

  const tracksQuery = useQuery<{ tracks: LibraryTrack[] }>({
    queryKey: [`${apiPrefix}/tracks`]
  });

  const matchQuery = useQuery<{ matches: MusicMatch[] }>({
    queryKey: ["/api/match/music"],
    queryFn: async () => {
      const url = new URL("/api/match/music", getApiUrl());
      url.searchParams.set("criteria", matchCriteria.join(","));
      url.searchParams.set("maxKm", String(matchMaxKm));
      url.searchParams.set("logic", matchLogic === "tutti" ? "all" : "any");
      url.searchParams.set("minSongs", String(minSongs));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: false
  });

  const sharedPlaylistsQuery = useQuery<{ playlists: SharedPlaylistEntry[] }>({
    queryKey: [`${apiPrefix}/shared-playlists`],
    enabled: activeTab === "ricevute"
  });

  const addTrackMutation = useMutation({
    mutationFn: async (track: SearchTrack) => {
      setPendingAddId(track.lastfmTrackId);
      const res = await apiRequest("POST", `${apiPrefix}/tracks`, track);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/tracks`] });
    },
    onError: (err: Error) => {
      Alert.alert(t("music.error"), (err as Error).message ?? t("music.addTrackError"));
    },
    onSettled: () => setPendingAddId(null)
  });

  const removeTrackMutation = useMutation({
    mutationFn: async (lastfmTrackId: string) => {
      setPendingRemoveId(lastfmTrackId);
      const res = await apiRequest("DELETE", `${apiPrefix}/tracks/${encodeURIComponent(lastfmTrackId)}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/tracks`] });
    },
    onError: (err: Error) => {
      Alert.alert(t("music.error"), (err as Error).message ?? t("music.removeTrackError2"));
    },
    onSettled: () => setPendingRemoveId(null)
  });

  const mergePlaylistMutation = useMutation({
    mutationFn: async (playlistId: number) => {
      const res = await apiRequest("POST", `${apiPrefix}/merge-playlist/${playlistId}`, {});
      return res.json() as Promise<{ newTracksAdded: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/shared-playlists`] });
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/tracks`] });
      Alert.alert("Playlist Aggiunta!", `${data.newTracksAdded ?? 0} nuovi brani aggiunti alla tua Playlist.`);
    },
    onError: (err: Error) => {
      Alert.alert(t("music.error"), err.message);
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiPrefix}/disconnect`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/status`] });
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/tracks`] });
    },
    onError: (err: Error) => {
      Alert.alert(t("music.error"), err.message ?? "Impossibile disconnettere");
    }
  });

  const disconnectMutationRef = useRef(disconnectMutation);
  disconnectMutationRef.current = disconnectMutation;

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      t("music.disconnectTitle2"),
      t("music.disconnectMsg2"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("music.disconnectBtn"), style: "destructive", onPress: () => disconnectMutationRef.current.mutate() },
      ]
    );
  }, [t]);

  const toggleCriteria = useCallback((c: string) => {
    setMatchCriteria((prev) => {
      const next = prev.includes(c) ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c];
      AsyncStorage.setItem("music_match_criteria", next.join(",")).catch(() => {});
      return next;
    });
  }, []);

  const handleSetMatchLogic = useCallback((v: "tutti" | "almeno_uno") => {
    setMatchLogic(v);
    AsyncStorage.setItem("music_match_logic", v).catch(() => {});
  }, []);

  const handleSetMinSongs = useCallback((v: number) => {
    setMinSongs(v);
    AsyncStorage.setItem("music_match_min_songs", String(v)).catch(() => {});
  }, []);

  const savedIds = new Set((tracksQuery.data?.tracks ?? []).map((t) => t.lastfmTrackId));
  const topPadding = insets.top;
  const providerColor = LASTFM_RED;

  const isConnected = statusQuery.isLoading ? null : (statusQuery.data?.connected ?? false);
  const isLastfmConnected = isConnected === true;

  const tabItems = (["brani", "match", "ricevute", "radio", "telefono"] as Tab[]).map((tab) => (
    <TouchableOpacity
      key={tab}
      style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
      onPress={() => setActiveTab(tab)}
    >
      {tab === "radio" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="radio-outline" size={12} color={activeTab === "radio" ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>Radio</Text>
        </View>
      ) : tab === "telefono" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="phone-portrait-outline" size={12} color={activeTab === "telefono" ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{t("music.tabTelefono")}</Text>
        </View>
      ) : (
        <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
          {tab === "brani" ? t("music.tabBrani") : tab === "match" ? "Match" : t("music.tabRicevute")}
        </Text>
      )}
    </TouchableOpacity>
  ));

  return (
    <>
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <InlineMiniPlayer />

        {!isLastfmConnected && (
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="musical-notes" size={24} color={providerColor} />
              <Text style={styles.headerTitle}>Musica</Text>
            </View>
            <View style={styles.headerRight}>
              {statusQuery.data?.connected && (
                <Text style={styles.headerCount}>
                  {tracksQuery.data ? `${tracksQuery.data.tracks.length} brani` : ""}
                </Text>
              )}
            </View>
          </View>
        )}

        {isLastfmConnected ? (
          <View style={styles.compactHeader}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.tabBarContent}>
              {tabItems}
            </ScrollView>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
              {tabItems}
            </ScrollView>

            {isConnected === false && (
              <View style={lastfmBannerStyles.banner}>
                <Ionicons name="warning-outline" size={18} color="#92400e" style={{ marginRight: 8, flexShrink: 0 }} />
                <Text style={lastfmBannerStyles.text}>
                  {t("music.lastfmAuthWarning")}
                </Text>
              </View>
            )}
          </>
        )}

        {activeTab === "brani" && (
          <BraniTab
            provider="lastfm"
            isConnected={isConnected}
            isConnecting={isConnecting}
            onConnect={() => setLastfmModalVisible(true)}
            searchNeedsReconnect={searchNeedsReconnect}
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            debouncedQuery={debouncedQuery}
            searchResults={searchQuery.data?.tracks ?? []}
            searchLoading={searchQuery.isLoading}
            searchError={searchQuery.isError && !searchNeedsReconnect ? ((searchQuery.error?.message && searchQuery.error.message.length > 5) ? searchQuery.error.message : "Errore nella ricerca. Riprova.") : null}
            library={tracksQuery.data?.tracks ?? []}
            libraryLoading={tracksQuery.isLoading}
            savedIds={savedIds}
            onAdd={(track) => addTrackMutation.mutate(track)}
            onRemove={(id) => removeTrackMutation.mutate(id)}
            pendingAddId={pendingAddId}
            pendingRemoveId={pendingRemoveId}
            onDisconnect={handleDisconnect}
            onShare={() => setSendModalVisible(true)}
            playlistOverride={playlistOverride}
            onResetPlaylist={() => setPlaylistOverride(null)}
          />
        )}
        {activeTab === "match" && (
          <MatchTab
            matches={matchQuery.data?.matches ?? []}
            isFetching={matchQuery.isFetching}
            hasData={matchQuery.data !== undefined}
            criteria={matchCriteria}
            onToggleCriteria={toggleCriteria}
            maxKm={matchMaxKm}
            onSetMaxKm={setMatchMaxKm}
            matchLogic={matchLogic}
            onSetMatchLogic={handleSetMatchLogic}
            minSongs={minSongs}
            onSetMinSongs={handleSetMinSongs}
            onSearch={() => matchQuery.refetch()}
          />
        )}
        {activeTab === "ricevute" && (
          <SharedPlaylistsTab
            playlists={sharedPlaylistsQuery.data?.playlists ?? []}
            isLoading={sharedPlaylistsQuery.isLoading}
            onMerge={(id) => mergePlaylistMutation.mutate(id)}
            isMerging={mergePlaylistMutation.isPending}
          />
        )}
        {activeTab === "radio" && <MusicRadioTab />}
        {activeTab === "telefono" && <TelefonoTab />}
      </View>

      <LastfmLoginModal
        visible={lastfmModalVisible}
        onClose={() => setLastfmModalVisible(false)}
      />

      <MusicPart2
        sendModalVisible={sendModalVisible}
        setSendModalVisible={setSendModalVisible}
        sendingToConv={sendingToConv}
        conversationsQuery={conversationsQuery}
        currentUser={currentUser ?? null}
        handleSendPlaylist={handleSendPlaylist}
      />
    </>
  );
}


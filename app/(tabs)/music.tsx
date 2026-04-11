import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  TextInput,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Linking,
  Switch,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { usePlayer, PlayerTrack, RadioStation } from "@/lib/player-context";

WebBrowser.maybeCompleteAuthSession();

function getSpotifyRedirectUri(): string {
  if (Platform.OS === "web") {
    return "/spotify-callback";
  }
  return "bikerlink://spotify-callback";
}

const SPOTIFY_GREEN = "#1DB954";
const LASTFM_RED = "#D51007";

type Tab = "brani" | "match" | "ricevute" | "radio";

interface PreviewResult {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  previewUrl: string;
  artworkUrl: string | null;
  durationMs: number;
  genre: string | null;
}

interface SearchTrack {
  spotifyTrackId: string;
  trackName: string;
  artistId: string;
  artistName: string;
  albumName?: string | null;
  imageUrl?: string | null;
  genres: string[];
  popularity: number;
}

interface LibraryTrack {
  id: number;
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  imageUrl?: string | null;
  popularity: number;
  addedAt: string;
}

interface MusicMatch {
  user: { id: string; nickname: string; userType: string; photos: string[] };
  songsInCommon: number;
  sharedArtist: string | null;
  sharedGenre: string | null;
  distanceKm: number;
}

interface SharedPlaylistEntry {
  id: number;
  fromUser: { id: string; nickname: string; photos: string[] };
  trackCount: number;
  sharedAt: string;
  mergedAt: string | null;
  tracks: Array<{ trackId: string; trackName: string; artistId: string; artistName: string }>;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

interface RadioGenre {
  id: string;
  label: string;
  icon: string;
}

function MusicRadioTab() {
  const { playRadioStation, selectedGenre, setSelectedGenre, favoriteStationIds, toggleFavorite, currentTrack } = usePlayer();
  const [useLastFm, setUseLastFm] = useState(false);

  const { data: genres = [] } = useQuery<RadioGenre[]>({
    queryKey: ["/api/music/radio/genres"],
  });

  const { data: suggestedGenreIds = [] } = useQuery<string[]>({
    queryKey: ["/api/music/radio/suggested-genres"],
    enabled: useLastFm,
  });

  const { data: stations = [], isLoading: loadingStations } = useQuery<RadioStation[]>({
    queryKey: selectedGenre
      ? [`/api/music/radio/stations?genre=${selectedGenre}`]
      : ["/api/music/radio/stations"],
    enabled: !!selectedGenre,
  });

  const displayedGenres =
    useLastFm && suggestedGenreIds.length > 0
      ? [...genres].sort((a, b) => {
          const aIdx = suggestedGenreIds.indexOf(a.id);
          const bIdx = suggestedGenreIds.indexOf(b.id);
          if (aIdx !== -1 && bIdx === -1) return -1;
          if (bIdx !== -1 && aIdx === -1) return 1;
          if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
          return 0;
        })
      : genres;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={radioTabStyles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={radioTabStyles.lastFmRow}>
        <View style={{ flex: 1 }}>
          <Text style={radioTabStyles.lastFmLabel}>Suggerisci da Last.fm</Text>
          <Text style={radioTabStyles.lastFmSub}>Generi basati sulla tua musica</Text>
        </View>
        <Switch
          value={useLastFm}
          onValueChange={setUseLastFm}
          trackColor={{ false: Colors.border, true: Colors.accent + "66" }}
          thumbColor={useLastFm ? Colors.accent : Colors.textSecondary}
        />
      </View>

      <Text style={radioTabStyles.sectionTitle}>Generi</Text>
      <View style={radioTabStyles.genreGrid}>
        {displayedGenres.map((g) => {
          const isSuggested = suggestedGenreIds.includes(g.id);
          return (
            <TouchableOpacity
              key={g.id}
              style={[
                radioTabStyles.genreChip,
                selectedGenre === g.id && radioTabStyles.genreChipActive,
                useLastFm && isSuggested && radioTabStyles.genreChipSuggested,
              ]}
              onPress={() => setSelectedGenre(g.id === selectedGenre ? null : g.id)}
            >
              <Text style={radioTabStyles.genreIcon}>{g.icon}</Text>
              <Text
                style={[
                  radioTabStyles.genreLabel,
                  selectedGenre === g.id && radioTabStyles.genreLabelActive,
                ]}
              >
                {g.label}
              </Text>
              {useLastFm && isSuggested && (
                <Ionicons name="star" size={10} color={Colors.accent} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedGenre && (
        <>
          <Text style={radioTabStyles.sectionTitle}>Stazioni</Text>
          {loadingStations ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 16 }} />
          ) : stations.length === 0 ? (
            <Text style={radioTabStyles.emptyText}>Nessuna stazione trovata</Text>
          ) : (
            stations.map((s) => {
              const isFav = favoriteStationIds.includes(s.id);
              const isActive = currentTrack?.id === s.id;
              return (
                <View key={s.id} style={radioTabStyles.stationRow}>
                  <TouchableOpacity
                    style={radioTabStyles.stationInfo}
                    onPress={() => playRadioStation(s, selectedGenre)}
                  >
                    {s.favicon ? (
                      <Image
                        source={{ uri: s.favicon }}
                        style={radioTabStyles.stationImg}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={radioTabStyles.stationImgPlaceholder}>
                        <Ionicons name="radio" size={18} color={Colors.textSecondary} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          radioTabStyles.stationName,
                          isActive && { color: Colors.accent },
                        ]}
                        numberOfLines={1}
                      >
                        {s.name}
                      </Text>
                      <Text style={radioTabStyles.stationMeta}>
                        {[s.country, s.bitrate ? `${s.bitrate}kbps` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    {isActive && (
                      <Ionicons name="volume-high" size={16} color={Colors.accent} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleFavorite(s.id)} style={{ padding: 8 }}>
                    <Ionicons
                      name={isFav ? "heart" : "heart-outline"}
                      size={20}
                      color={isFav ? Colors.accent : Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </>
      )}

      {!selectedGenre && (
        <View style={radioTabStyles.hint}>
          <Ionicons name="radio-outline" size={32} color={Colors.textSecondary} />
          <Text style={radioTabStyles.hintText}>Seleziona un genere per ascoltare la radio</Text>
        </View>
      )}
    </ScrollView>
  );
}

const radioTabStyles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  lastFmRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 4,
  },
  lastFmLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  lastFmSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  genreGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  genreChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genreChipActive: {
    backgroundColor: Colors.accent + "22",
    borderColor: Colors.accent,
  },
  genreChipSuggested: {
    borderColor: Colors.accent + "88",
  },
  genreIcon: { fontSize: 14 },
  genreLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  genreLabelActive: { color: Colors.accent },
  stationRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 8,
    gap: 8,
  },
  stationInfo: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  stationImg: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  stationImgPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: Colors.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stationName: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  stationMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 8,
  },
  hint: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 48,
    gap: 12,
  },
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    paddingHorizontal: 24,
  },
});

export default function MusicScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (tabParam === "ricevute" || tabParam === "match" || tabParam === "brani" || tabParam === "radio") return tabParam;
    return "brani";
  });

  const [matchCriteria, setMatchCriteria] = useState<string[]>(["songs", "genre"]);
  const [matchMaxKm, setMatchMaxKm] = useState<number>(100);
  const [matchLogic, setMatchLogic] = useState<"tutti" | "almeno_uno">("almeno_uno");
  const [minSongs, setMinSongs] = useState<number>(5);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pendingAddId, setPendingAddId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [searchNeedsReconnect, setSearchNeedsReconnect] = useState(false);

  const [lastfmModalVisible, setLastfmModalVisible] = useState(false);
  const [lastfmUsername, setLastfmUsername] = useState("");
  const [lastfmPassword, setLastfmPassword] = useState("");
  const [lastfmError, setLastfmError] = useState<string | null>(null);
  const [lastfmConnecting, setLastfmConnecting] = useState(false);

  const { data: providerData } = useQuery<{ provider: string }>({
    queryKey: ["/api/settings/music-provider"],
    staleTime: 120_000,
  });
  const musicProvider: "lastfm" | "spotify" = (providerData?.provider as "lastfm" | "spotify") ?? "lastfm";
  const apiPrefix = musicProvider === "lastfm" ? "/api/lastfm" : "/api/spotify";

  const statusQuery = useQuery<{ connected: boolean; displayName?: string; username?: string; trackCount: number }>({
    queryKey: [`${apiPrefix}/status`],
    staleTime: 60_000,
    enabled: !!providerData,
  });

  useEffect(() => {
    if (tabParam === "ricevute" || tabParam === "match" || tabParam === "brani") {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    AsyncStorage.multiGet(["music_match_criteria", "music_match_logic", "music_match_min_songs"])
      .then(pairs => {
        const criteria = pairs[0][1];
        const logic = pairs[1][1];
        const minS = pairs[2][1];
        if (criteria) setMatchCriteria(criteria.split(",").filter(Boolean));
        if (logic === "tutti" || logic === "almeno_uno") setMatchLogic(logic);
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
        let needsAuth = false;
        try {
          const body = await res.json();
          if (typeof body.message === "string") msg = body.message;
          if (body.needsSpotifyAuth === true) needsAuth = true;
        } catch (e) {
          console.warn("[music] search error body parse:", e);
        }
        if (needsAuth) {
          setSearchNeedsReconnect(true);
        }
        throw new Error(msg);
      }
      setSearchNeedsReconnect(false);
      return res.json();
    },
    enabled: debouncedQuery.length >= 2 && activeTab === "brani" && (
      musicProvider === "lastfm" ? true : statusQuery.data?.connected === true
    ),
    staleTime: 30_000,
  });

  const tracksQuery = useQuery<{ tracks: LibraryTrack[] }>({
    queryKey: [`${apiPrefix}/tracks`],
    enabled: !!providerData,
  });

  const matchQuery = useQuery<{ matches: MusicMatch[] }>({
    queryKey: ["/api/spotify/match/music"],
    queryFn: async () => {
      const url = new URL("/api/spotify/match/music", getApiUrl());
      url.searchParams.set("criteria", matchCriteria.join(","));
      url.searchParams.set("maxKm", String(matchMaxKm));
      url.searchParams.set("logic", matchLogic === "tutti" ? "all" : "any");
      url.searchParams.set("minSongs", String(minSongs));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: false,
  });

  const sharedPlaylistsQuery = useQuery<{ playlists: SharedPlaylistEntry[] }>({
    queryKey: ["/api/spotify/shared-playlists"],
    enabled: activeTab === "ricevute",
  });

  const addTrackMutation = useMutation({
    mutationFn: async (track: SearchTrack) => {
      setPendingAddId(track.spotifyTrackId);
      const res = await apiRequest("POST", `${apiPrefix}/tracks`, track);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/tracks`] });
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message ?? "Impossibile aggiungere il brano");
    },
    onSettled: () => setPendingAddId(null),
  });

  const removeTrackMutation = useMutation({
    mutationFn: async (spotifyTrackId: string) => {
      setPendingRemoveId(spotifyTrackId);
      const res = await apiRequest("DELETE", `${apiPrefix}/tracks/${encodeURIComponent(spotifyTrackId)}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/tracks`] });
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message ?? "Impossibile rimuovere il brano");
    },
    onSettled: () => setPendingRemoveId(null),
  });

  const mergePlaylistMutation = useMutation({
    mutationFn: async (playlistId: number) => {
      const res = await apiRequest("POST", `/api/spotify/merge-playlist/${playlistId}`, {});
      return res.json() as Promise<{ newTracksAdded: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/shared-playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/tracks"] });
      Alert.alert("Playlist Aggiunta!", `${data.newTracksAdded ?? 0} nuovi brani aggiunti alla tua libreria.`);
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message);
    },
  });

  const connectSpotify = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Info", "Collega Spotify dall'app mobile BikerLink.");
      return;
    }
    setIsConnecting(true);
    try {
      const redirectUri = getSpotifyRedirectUri();

      const urlObj = new URL("/api/spotify/auth-url", getApiUrl());
      urlObj.searchParams.set("redirectUri", redirectUri);
      const resp = await fetch(urlObj.toString(), { credentials: "include" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? "Errore nell'avvio della connessione Spotify");
      }
      const { authUrl } = await resp.json() as { authUrl: string };

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === "success") {
        const resultUrl = new URL(result.url);
        const code = resultUrl.searchParams.get("code") ?? undefined;
        const state = resultUrl.searchParams.get("state") ?? undefined;
        const oauthError = resultUrl.searchParams.get("error") ?? undefined;

        if (oauthError) {
          Alert.alert(
            "Connessione Spotify",
            oauthError === "access_denied"
              ? "Accesso negato. Riprova quando vuoi."
              : `Errore Spotify: ${oauthError}`
          );
          return;
        }
        if (!code) {
          Alert.alert("Errore", "Codice di autorizzazione mancante. Riprova.");
          return;
        }

        const callbackResp = await apiRequest("POST", "/api/spotify/callback", {
          code,
          redirectUri,
          state,
        });
        const callbackData = await callbackResp.json() as { connected?: boolean; displayName?: string | null; trackCount?: number; message?: string };

        if (!callbackResp.ok) {
          Alert.alert("Errore", callbackData.message ?? "Errore durante la connessione Spotify");
          return;
        }

        setSearchNeedsReconnect(false);
        queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/spotify/tracks"] });

        const tracksMsg = callbackData.trackCount ? ` ${callbackData.trackCount} brani sincronizzati.` : "";
        Alert.alert(
          "Spotify Collegato!",
          callbackData.displayName
            ? `Benvenuto, ${callbackData.displayName}!${tracksMsg}`
            : `Spotify collegato con successo!${tracksMsg}`
        );
      }
    } catch (err) {
      console.error("[Spotify connect]", err);
      Alert.alert("Errore", (err as Error).message ?? "Impossibile connettersi a Spotify");
    } finally {
      setIsConnecting(false);
    }
  }, [queryClient]);

  const connectLastfm = useCallback(() => {
    setLastfmUsername("");
    setLastfmPassword("");
    setLastfmError(null);
    setLastfmModalVisible(true);
  }, []);

  const submitLastfmLogin = useCallback(async () => {
    if (!lastfmUsername.trim() || !lastfmPassword.trim()) {
      setLastfmError("Inserisci username e password.");
      return;
    }
    setLastfmConnecting(true);
    setLastfmError(null);
    try {
      const resp = await apiRequest("POST", "/api/lastfm/mobile-auth", {
        username: lastfmUsername.trim(),
        password: lastfmPassword,
      });
      const data = await resp.json() as { connected?: boolean; username?: string; trackCount?: number };
      setLastfmModalVisible(false);
      setLastfmUsername("");
      setLastfmPassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/lastfm/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lastfm/tracks"] });
      const tracksMsg = data.trackCount ? ` ${data.trackCount} brani sincronizzati.` : "";
      Alert.alert(
        "Last.fm Collegato!",
        data.username
          ? `Benvenuto, ${data.username}!${tracksMsg}`
          : `Last.fm collegato con successo!${tracksMsg}`
      );
    } catch (err) {
      console.error("[Last.fm mobile-auth]", err);
      setLastfmError((err as Error).message ?? "Impossibile connettersi a Last.fm");
    } finally {
      setLastfmConnecting(false);
    }
  }, [lastfmUsername, lastfmPassword, queryClient]);

  const handleConnect = useCallback(() => {
    if (musicProvider === "lastfm") {
      connectLastfm();
    } else {
      connectSpotify();
    }
  }, [musicProvider, connectLastfm, connectSpotify]);

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
      Alert.alert("Errore", err.message ?? "Impossibile disconnettere");
    },
  });

  const handleDisconnect = useCallback(() => {
    const providerName = musicProvider === "lastfm" ? "Last.fm" : "Spotify";
    Alert.alert(
      `Disconnetti ${providerName}`,
      `Rimuovere la connessione ${providerName}? I brani salvati verranno eliminati.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Disconnetti", style: "destructive", onPress: () => disconnectMutation.mutate() },
      ]
    );
  }, [disconnectMutation, musicProvider]);

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

  const savedIds = new Set((tracksQuery.data?.tracks ?? []).map((t) => t.spotifyTrackId));
  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);
  const providerColor = musicProvider === "lastfm" ? LASTFM_RED : SPOTIFY_GREEN;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="musical-notes" size={24} color={providerColor} />
          <Text style={styles.headerTitle}>Musica</Text>
        </View>
        <View style={styles.headerRight}>
          {statusQuery.data?.connected && (
            <>
              <Text style={styles.headerCount}>
                {tracksQuery.data ? `${tracksQuery.data.tracks.length} brani` : ""}
              </Text>
              <TouchableOpacity
                onPress={handleDisconnect}
                style={{ marginLeft: 10 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="log-out-outline" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View style={styles.tabBar}>
        {(["brani", "match", "ricevute", "radio"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === "brani" ? "Brani" : tab === "match" ? "Match" : tab === "ricevute" ? "Ricevute" : "Radio"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "brani" && (
        <BraniTab
          provider={musicProvider}
          isConnected={statusQuery.isLoading ? null : (statusQuery.data?.connected ?? false)}
          isConnecting={isConnecting}
          onConnect={handleConnect}
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

      <Modal
        visible={lastfmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !lastfmConnecting && setLastfmModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="radio" size={28} color={LASTFM_RED} />
              <Text style={styles.modalTitle}>Accedi a Last.fm</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Inserisci le tue credenziali Last.fm per collegare l'account.
            </Text>

            <Text style={styles.modalLabel}>Username</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Il tuo username Last.fm"
              placeholderTextColor={Colors.textSecondary}
              value={lastfmUsername}
              onChangeText={setLastfmUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!lastfmConnecting}
              returnKeyType="next"
            />

            <Text style={styles.modalLabel}>Password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="La tua password"
              placeholderTextColor={Colors.textSecondary}
              value={lastfmPassword}
              onChangeText={setLastfmPassword}
              secureTextEntry
              editable={!lastfmConnecting}
              returnKeyType="done"
              onSubmitEditing={submitLastfmLogin}
            />

            {lastfmError !== null && (
              <View style={styles.modalErrorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.modalErrorText}>{lastfmError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.modalConnectBtn, lastfmConnecting && { opacity: 0.7 }]}
              onPress={submitLastfmLogin}
              disabled={lastfmConnecting}
            >
              {lastfmConnecting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalConnectBtnText}>Connetti</Text>
              )}
            </TouchableOpacity>

            <View style={styles.modalDivider} />

            <TouchableOpacity
              style={styles.modalCreateAccountBtn}
              onPress={() => Linking.openURL("https://www.last.fm/join")}
              disabled={lastfmConnecting}
            >
              <Ionicons name="person-add-outline" size={16} color={LASTFM_RED} style={{ marginRight: 6 }} />
              <Text style={styles.modalCreateAccountText}>Crea nuovo account Last.fm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setLastfmModalVisible(false)}
              disabled={lastfmConnecting}
            >
              <Text style={styles.modalCancelText}>Annulla</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function BraniTab({
  provider,
  isConnected,
  isConnecting,
  onConnect,
  searchNeedsReconnect,
  searchInput,
  onSearchChange,
  debouncedQuery,
  searchResults,
  searchLoading,
  searchError,
  library,
  libraryLoading,
  savedIds,
  onAdd,
  onRemove,
  pendingAddId,
  pendingRemoveId,
}: {
  provider: "lastfm" | "spotify";
  isConnected: boolean | null;
  isConnecting: boolean;
  onConnect: () => void;
  searchNeedsReconnect: boolean;
  searchInput: string;
  onSearchChange: (v: string) => void;
  debouncedQuery: string;
  searchResults: SearchTrack[];
  searchLoading: boolean;
  searchError: string | null;
  library: LibraryTrack[];
  libraryLoading: boolean;
  savedIds: Set<string>;
  onAdd: (t: SearchTrack) => void;
  onRemove: (id: string) => void;
  pendingAddId: string | null;
  pendingRemoveId: string | null;
}) {
  const isLastfm = provider === "lastfm";
  const providerColor = isLastfm ? LASTFM_RED : SPOTIFY_GREEN;
  const providerName = isLastfm ? "Last.fm" : "Spotify";

  if (isConnected === null) {
    return (
      <View style={styles.connectContainer}>
        <ActivityIndicator color={providerColor} size="large" />
      </View>
    );
  }

  if (!isConnected) {
    return (
      <View style={styles.connectContainer}>
        <Ionicons name={isLastfm ? "radio" : "musical-notes"} size={52} color={providerColor} />
        <Text style={styles.connectTitle}>Collega {providerName}</Text>
        <Text style={styles.connectDesc}>
          {isLastfm
            ? "Collega il tuo account Last.fm per sincronizzare i tuoi brani più ascoltati con i bikers."
            : "Collega il tuo account Spotify per cercare brani e costruire il tuo profilo musicale con i bikers."}
        </Text>
        <TouchableOpacity
          style={[styles.connectBtn, { backgroundColor: providerColor }, isConnecting && styles.connectBtnDisabled]}
          onPress={onConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.connectBtnText}>Connetti {providerName}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={styles.searchBarWrapper}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={isLastfm ? "Cerca brani su Last.fm…" : "Cerca brani su Spotify…"}
          placeholderTextColor={Colors.textSecondary}
          value={searchInput}
          onChangeText={onSearchChange}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchInput.length > 0 && Platform.OS !== "ios" && (
          <TouchableOpacity onPress={() => onSearchChange("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {debouncedQuery.length >= 2 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risultati di ricerca</Text>
          {searchLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginVertical: 20 }} />
          ) : searchNeedsReconnect ? (
            <View style={styles.reconnectBox}>
              <Ionicons name={isLastfm ? "radio" : "musical-notes"} size={32} color={providerColor} style={{ marginBottom: 8 }} />
              <Text style={styles.reconnectText}>La sessione {providerName} è scaduta.</Text>
              <TouchableOpacity
                style={[styles.connectBtn, { backgroundColor: providerColor, marginTop: 12 }]}
                onPress={onConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.connectBtnText}>Riconnetti {providerName}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : searchError !== null ? (
            <Text style={styles.emptyText}>{searchError}</Text>
          ) : searchResults.length === 0 ? (
            <Text style={styles.emptyText}>Nessun risultato per "{debouncedQuery}"</Text>
          ) : (
            searchResults.map((track) => (
              <SearchTrackRow
                key={track.spotifyTrackId}
                track={track}
                isAdded={savedIds.has(track.spotifyTrackId)}
                isAdding={pendingAddId === track.spotifyTrackId}
                onAdd={onAdd}
              />
            ))
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          La mia libreria{library.length > 0 ? ` (${library.length})` : ""}
        </Text>
        {libraryLoading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginVertical: 20 }} />
        ) : library.length === 0 ? (
          <View style={styles.emptyLibrary}>
            <Ionicons name="musical-note" size={32} color={Colors.textSecondary} />
            <Text style={styles.emptyLibraryText}>Cerca un brano e aggiungilo alla tua libreria</Text>
          </View>
        ) : (
          library.map((track) => (
            <LibraryTrackRow
              key={track.spotifyTrackId}
              track={track}
              isRemoving={pendingRemoveId === track.spotifyTrackId}
              onRemove={onRemove}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function SearchTrackRow({
  track,
  isAdded,
  isAdding,
  onAdd,
}: {
  track: SearchTrack;
  isAdded: boolean;
  isAdding: boolean;
  onAdd: (t: SearchTrack) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const lastfmUrl = `https://www.last.fm/music/${encodeURIComponent(track.artistName)}/_/${encodeURIComponent(track.trackName)}`;
  return (
    <View style={styles.trackRow}>
      {track.imageUrl && !imgError ? (
        <Image source={{ uri: track.imageUrl }} style={styles.albumArt} onError={() => setImgError(true)} />
      ) : (
        <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
          <Ionicons name="musical-note" size={16} color={Colors.textSecondary} />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackName} numberOfLines={1}>{track.trackName}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artistName}</Text>
      </View>
      <TouchableOpacity
        onPress={() => Linking.openURL(lastfmUrl).catch(() => {})}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginRight: 6 }}
      >
        <Ionicons name="open-outline" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.addBtn, isAdded && styles.addBtnDone]}
        onPress={() => !isAdded && !isAdding && onAdd(track)}
        disabled={isAdded || isAdding}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isAdding ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name={isAdded ? "checkmark" : "add"} size={18} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

function LibraryTrackRow({
  track,
  isRemoving,
  onRemove,
}: {
  track: LibraryTrack;
  isRemoving: boolean;
  onRemove: (id: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const lastfmUrl = `https://www.last.fm/music/${encodeURIComponent(track.artistName)}/_/${encodeURIComponent(track.trackName)}`;
  return (
    <View style={styles.trackRow}>
      {track.imageUrl && !imgError ? (
        <Image source={{ uri: track.imageUrl }} style={styles.albumArt} onError={() => setImgError(true)} />
      ) : (
        <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
          <Ionicons name="musical-note" size={16} color={Colors.textSecondary} />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackName} numberOfLines={1}>{track.trackName}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artistName}</Text>
      </View>
      <TouchableOpacity
        onPress={() => Linking.openURL(lastfmUrl).catch(() => {})}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginRight: 6 }}
      >
        <Ionicons name="open-outline" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => {
          Alert.alert(
            "Rimuovi brano",
            `Vuoi rimuovere "${track.trackName}" dalla tua libreria?`,
            [
              { text: "Annulla", style: "cancel" },
              { text: "Rimuovi", style: "destructive", onPress: () => onRemove(track.spotifyTrackId) },
            ]
          );
        }}
        disabled={isRemoving}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isRemoving ? (
          <ActivityIndicator size="small" color={Colors.textSecondary} />
        ) : (
          <Ionicons name="trash-outline" size={18} color={Colors.textSecondary} />
        )}
      </TouchableOpacity>
    </View>
  );
}

function MatchTab({
  matches,
  isFetching,
  hasData,
  criteria,
  onToggleCriteria,
  maxKm,
  onSetMaxKm,
  matchLogic,
  onSetMatchLogic,
  minSongs,
  onSetMinSongs,
  onSearch,
}: {
  matches: MusicMatch[];
  isFetching: boolean;
  hasData: boolean;
  criteria: string[];
  onToggleCriteria: (c: string) => void;
  maxKm: number;
  onSetMaxKm: (km: number) => void;
  matchLogic: "tutti" | "almeno_uno";
  onSetMatchLogic: (v: "tutti" | "almeno_uno") => void;
  minSongs: number;
  onSetMinSongs: (v: number) => void;
  onSearch: () => void;
}) {
  const KM_OPTIONS = [50, 100, 300, 9999];
  const MIN_SONGS_OPTIONS = [1, 3, 5, 10];

  return (
    <View style={styles.tabContent}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.filterBox}>
          <Text style={styles.filterLabel}>Criteri</Text>
          <View style={styles.filterRow}>
            {[
              { key: "songs", label: "Brani" },
              { key: "genre", label: "Genere" },
              { key: "artist", label: "Artista" },
            ].map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, criteria.includes(key) && styles.filterChipActive]}
                onPress={() => onToggleCriteria(key)}
              >
                <Text style={[styles.filterChipText, criteria.includes(key) && styles.filterChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>Logica</Text>
          <View style={styles.filterRow}>
            {(["tutti", "almeno_uno"] as const).map((logic) => (
              <TouchableOpacity
                key={logic}
                style={[styles.filterChip, matchLogic === logic && styles.filterChipActive]}
                onPress={() => onSetMatchLogic(logic)}
              >
                <Text style={[styles.filterChipText, matchLogic === logic && styles.filterChipTextActive]}>
                  {logic === "tutti" ? "Tutti i criteri" : "Almeno uno"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>Brani in comune (min)</Text>
          <View style={styles.filterRow}>
            {MIN_SONGS_OPTIONS.map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.filterChip, minSongs === n && styles.filterChipActive]}
                onPress={() => onSetMinSongs(n)}
              >
                <Text style={[styles.filterChipText, minSongs === n && styles.filterChipTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>Raggio</Text>
          <View style={styles.filterRow}>
            {KM_OPTIONS.map((km) => (
              <TouchableOpacity
                key={km}
                style={[styles.filterChip, maxKm === km && styles.filterChipActive]}
                onPress={() => onSetMaxKm(km)}
              >
                <Text style={[styles.filterChipText, maxKm === km && styles.filterChipTextActive]}>
                  {km >= 9999 ? "Ovunque" : `${km} km`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={onSearch} disabled={isFetching}>
            {isFetching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.searchBtnText}>Cerca</Text>
            )}
          </TouchableOpacity>
        </View>

        {isFetching ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : !hasData ? null : matches.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="people" size={40} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun biker trovato con gusti simili. Prova a cambiare i filtri.</Text>
          </View>
        ) : (
          matches.map((item) => <MatchCard key={item.user.id} match={item} />)
        )}
      </ScrollView>
    </View>
  );
}

function MatchCard({ match }: { match: MusicMatch }) {
  const router = useRouter();
  const localQueryClient = useQueryClient();
  const [chatLoading, setChatLoading] = useState(false);

  const openChat = useCallback(async () => {
    setChatLoading(true);
    try {
      const res = await apiRequest("POST", "/api/chat/conversations", { participantId: match.user.id });
      const data = await res.json();
      localQueryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      router.push(`/chat/${data.id}` as any);
    } catch {
      Alert.alert("Errore", "Impossibile aprire la chat. Riprova.");
    } finally {
      setChatLoading(false);
    }
  }, [match.user.id, router, localQueryClient]);

  return (
    <View style={styles.matchCard}>
      <View style={styles.matchLeft}>
        {match.user.photos[0] ? (
          <Image source={{ uri: match.user.photos[0] }} style={styles.matchAvatar} />
        ) : (
          <View style={[styles.matchAvatar, styles.matchAvatarPlaceholder]}>
            <Ionicons name="person" size={22} color={Colors.textSecondary} />
          </View>
        )}
      </View>
      <View style={styles.matchInfo}>
        <Text style={styles.matchName}>{match.user.nickname}</Text>
        <View style={styles.matchBadges}>
          {match.songsInCommon > 0 && (
            <View style={styles.badge}>
              <Ionicons name="musical-note" size={11} color={SPOTIFY_GREEN} />
              <Text style={styles.badgeText}>{match.songsInCommon} brani</Text>
            </View>
          )}
          {match.sharedGenre && (
            <View style={styles.badge}>
              <Ionicons name="radio" size={11} color={Colors.accent} />
              <Text style={styles.badgeText}>{match.sharedGenre}</Text>
            </View>
          )}
          {match.sharedArtist && (
            <View style={styles.badge}>
              <Ionicons name="person" size={11} color="#9B59B6" />
              <Text style={styles.badgeText}>{match.sharedArtist}</Text>
            </View>
          )}
        </View>
        {match.distanceKm > 0 && (
          <Text style={styles.matchDist}>{match.distanceKm} km di distanza</Text>
        )}
        <View style={styles.matchActions}>
          <TouchableOpacity
            style={styles.matchActionBtn}
            onPress={() => router.push(`/profile/${match.user.id}` as any)}
          >
            <Text style={styles.matchActionText}>Profilo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.matchActionBtn, { backgroundColor: Colors.accent }]}
            onPress={openChat}
            disabled={chatLoading}
          >
            {chatLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.matchActionText, { color: "#fff" }]}>Scrivi</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function SharedPlaylistCard({
  item,
  onMerge,
  isMerging,
}: {
  item: SharedPlaylistEntry;
  onMerge: (id: number) => void;
  isMerging: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { playQueue, isAvailable: playerAvailable } = usePlayer();

  const handlePreview = useCallback(async () => {
    if (!playerAvailable) {
      Alert.alert("Player non disponibile", "Il player audio non è disponibile su questo dispositivo.");
      return;
    }
    if (item.tracks.length === 0) return;
    setPreviewLoading(true);
    try {
      const tracksParam = encodeURIComponent(
        JSON.stringify(item.tracks.map((t) => ({ trackName: t.trackName, artistName: t.artistName })))
      );
      const url = new URL(`/api/music/radio/preview-playlist?tracks=${tracksParam}`, getApiUrl());
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error("Errore nel caricamento");
      const previews: PreviewResult[] = await resp.json();
      if (!previews || previews.length === 0) {
        Alert.alert("Nessuna anteprima", "Nessun brano di questa playlist ha un'anteprima disponibile.");
        return;
      }
      const tracks: PlayerTrack[] = previews.map((p) => ({
        id: p.trackId,
        url: p.previewUrl,
        title: p.trackName,
        artist: p.artistName,
        album: p.albumName ?? undefined,
        artwork: p.artworkUrl ?? undefined,
        duration: p.durationMs ? p.durationMs / 1000 : 30,
        source: "preview" as const,
      }));
      await playQueue(tracks, 0);
    } catch (err) {
      console.warn("[music] preview load error:", err);
      Alert.alert("Errore", "Impossibile caricare le anteprime.");
    } finally {
      setPreviewLoading(false);
    }
  }, [item.tracks, playQueue, playerAvailable]);

  return (
    <View style={styles.playlistCard}>
      <TouchableOpacity style={styles.playlistHeader} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        {item.fromUser.photos[0] ? (
          <Image source={{ uri: item.fromUser.photos[0] }} style={styles.playlistAvatar} />
        ) : (
          <View style={[styles.playlistAvatar, styles.matchAvatarPlaceholder]}>
            <Ionicons name="person" size={18} color={Colors.textSecondary} />
          </View>
        )}
        <View style={styles.playlistMeta}>
          <Text style={styles.playlistName}>{item.fromUser.nickname}</Text>
          <Text style={styles.playlistSub}>{item.trackCount} brani · {formatDate(item.sharedAt)}</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={Colors.textSecondary}
          style={{ marginRight: 8 }}
        />
        {item.mergedAt ? (
          <View style={styles.mergedBadge}>
            <Ionicons name="checkmark" size={14} color={SPOTIFY_GREEN} />
            <Text style={styles.mergedText}>Aggiunta</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.mergeBtn}
            onPress={() => onMerge(item.id)}
            disabled={isMerging}
          >
            <Text style={styles.mergeBtnText}>Aggiungi</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {expanded && (
        <View style={{ paddingTop: 4 }}>
          {item.tracks.map((track, i) => (
            <View key={i} style={styles.previewTrack}>
              <Ionicons name="musical-note" size={12} color={Colors.textSecondary} />
              <Text style={styles.previewTrackText} numberOfLines={1}>
                {track.trackName} — {track.artistName}
              </Text>
            </View>
          ))}
          {item.tracks.length > 0 && (
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={handlePreview}
              disabled={previewLoading}
            >
              {previewLoading ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <>
                  <Ionicons name="play-circle" size={16} color={Colors.accent} />
                  <Text style={styles.previewBtnText}>Anteprima 30s</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function SharedPlaylistsTab({
  playlists,
  isLoading,
  onMerge,
  isMerging,
}: {
  playlists: SharedPlaylistEntry[];
  isLoading: boolean;
  onMerge: (id: number) => void;
  isMerging: boolean;
}) {
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (playlists.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="albums" size={40} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>Nessuna playlist ricevuta ancora. Chiedi a un biker di condividere la sua musica!</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={playlists}
      keyExtractor={(item) => String(item.id)}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
      renderItem={({ item }) => (
        <SharedPlaylistCard item={item} onMerge={onMerge} isMerging={isMerging} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRight: {},
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  headerCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  tabContent: {
    flex: 1,
  },
  searchBarWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    paddingVertical: 0,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 10,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  albumArt: {
    width: 42,
    height: 42,
    borderRadius: 6,
  },
  albumArtPlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfo: {
    flex: 1,
  },
  trackName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  trackArtist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: SPOTIFY_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDone: {
    backgroundColor: Colors.border,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyLibrary: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 10,
  },
  emptyLibraryText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  filterBox: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  matchLeft: {},
  matchAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  matchAvatarPlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  matchInfo: {
    flex: 1,
    gap: 4,
  },
  matchName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  matchBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  matchDist: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  matchActions: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 10,
  },
  matchActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  matchActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  playlistCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 14,
  },
  playlistHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  playlistAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  playlistMeta: {
    flex: 1,
  },
  playlistName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  playlistSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  mergedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mergedText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: SPOTIFY_GREEN,
  },
  mergeBtn: {
    backgroundColor: SPOTIFY_GREEN,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  mergeBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  searchBtn: {
    marginTop: 12,
    backgroundColor: SPOTIFY_GREEN,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center" as const,
  },
  searchBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  previewTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  previewTrackText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.accent + "18",
    alignSelf: "flex-start",
    minWidth: 80,
    minHeight: 36,
    justifyContent: "center",
  },
  previewBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.accent,
  },
  surfaceLight: {
    backgroundColor: Colors.surfaceLight,
  },
  connectContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 36,
    gap: 16,
  },
  connectTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center" as const,
  },
  connectDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center" as const,
    lineHeight: 21,
  },
  connectBtn: {
    marginTop: 8,
    backgroundColor: SPOTIFY_GREEN,
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 28,
    minWidth: 200,
    alignItems: "center" as const,
  },
  connectBtnDisabled: {
    opacity: 0.6,
  },
  connectBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  reconnectBox: {
    alignItems: "center" as const,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  reconnectText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 19,
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    marginBottom: 12,
  },
  modalErrorBox: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#c0392b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  modalErrorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
    flex: 1,
  },
  modalConnectBtn: {
    backgroundColor: LASTFM_RED,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center" as const,
    marginTop: 4,
  },
  modalConnectBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  modalCreateAccountBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 10,
    marginBottom: 8,
  },
  modalCreateAccountText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: LASTFM_RED,
  },
  modalCancelBtn: {
    alignItems: "center" as const,
    paddingVertical: 8,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
});

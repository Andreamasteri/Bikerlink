import React, { useState, useCallback, useEffect } from "react";
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
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";

WebBrowser.maybeCompleteAuthSession();

const SPOTIFY_GREEN = "#1DB954";
const SCOPES = "user-top-read";

type Tab = "brani" | "match" | "ricevute";

interface SpotifyStatus {
  connected: boolean;
  displayName?: string | null;
  trackCount?: number;
  lastSyncAt?: string | null;
}

interface TrackEntry {
  id: number;
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  genres?: string[];
  popularity: number;
}

interface MyTracksData {
  tracks: TrackEntry[];
  topArtists: Array<{ id: string; name: string; count: number }>;
  topGenres: string[];
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

function buildSpotifyAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    show_dialog: "false",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function MusicScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (tabParam === "ricevute" || tabParam === "match" || tabParam === "brani") return tabParam;
    return "brani";
  });
  const [matchCriteria, setMatchCriteria] = useState<string[]>(["songs", "genre"]);
  const [matchMaxKm, setMatchMaxKm] = useState<number>(100);
  const [matchLogic, setMatchLogic] = useState<"tutti" | "almeno_uno">("almeno_uno");
  const [minSongs, setMinSongs] = useState<number>(5);

  useEffect(() => {
    if (tabParam === "ricevute" || tabParam === "match" || tabParam === "brani") {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const comingSoonQuery = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/spotify-coming-soon"],
  });

  const statusQuery = useQuery<SpotifyStatus>({
    queryKey: ["/api/spotify/status"],
    enabled: comingSoonQuery.data?.enabled !== true,
  });

  const myTracksQuery = useQuery<MyTracksData>({
    queryKey: ["/api/spotify/my-tracks"],
    enabled: statusQuery.data?.connected === true,
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
    enabled: activeTab === "ricevute" && statusQuery.data?.connected === true,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const clientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
      if (!clientId) {
        throw new Error("Spotify non configurato. Contatta l'amministratore.");
      }
      const redirectUri = Linking.createURL("spotify-callback");
      const authUrl = buildSpotifyAuthUrl(clientId, redirectUri);

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== "success" || !result.url) {
        if (result.type === "cancel" || result.type === "dismiss") return null;
        throw new Error("Autenticazione annullata o fallita");
      }

      const parsed = Linking.parse(result.url);
      const code = parsed.queryParams?.code as string | undefined;
      if (!code) throw new Error("Codice di autorizzazione non ricevuto da Spotify");

      const response = await apiRequest("POST", "/api/spotify/callback", { code, redirectUri });
      return response;
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/my-tracks"] });
      Alert.alert("Spotify Connesso!", `Ciao ${data.displayName ?? ""}! ${data.trackCount ?? 0} brani sincronizzati.`);
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message ?? "Impossibile connettersi a Spotify");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/spotify/disconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/my-tracks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/match/music"] });
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/spotify/sync", {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/my-tracks"] });
      Alert.alert("Sincronizzato", `${data.trackCount ?? 0} brani aggiornati.`);
    },
    onError: (err: Error) => {
      Alert.alert("Errore sincronizzazione", err.message);
    },
  });

  const mergePlaylistMutation = useMutation({
    mutationFn: (playlistId: number) =>
      apiRequest("POST", `/api/spotify/merge-playlist/${playlistId}`, {}),
    onSuccess: (data, playlistId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/shared-playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/my-tracks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      Alert.alert("Playlist Aggiunta!", `${data.newTracksAdded ?? 0} nuovi brani aggiunti alla tua libreria.`);
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message);
    },
  });

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      "Disconnetti Spotify",
      "Vuoi disconnettere il tuo account Spotify? I tuoi brani salvati verranno eliminati.",
      [
        { text: "Annulla", style: "cancel" },
        { text: "Disconnetti", style: "destructive", onPress: () => disconnectMutation.mutate() },
      ]
    );
  }, [disconnectMutation]);

  const toggleCriteria = useCallback((c: string) => {
    setMatchCriteria((prev) =>
      prev.includes(c) ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c]
    );
  }, []);

  const isConnected = statusQuery.data?.connected === true;
  const isComingSoon = comingSoonQuery.data?.enabled === true;
  const isLoading = statusQuery.isLoading && !isComingSoon;
  const isNotConfigured =
    !isComingSoon && (
      !process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ||
      (statusQuery.isError && (statusQuery.error as Error)?.message?.startsWith("503"))
    );

  if (isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="musical-notes" size={24} color={isNotConfigured ? Colors.textSecondary : SPOTIFY_GREEN} />
          <Text style={styles.headerTitle}>Musica</Text>
        </View>
        {isConnected && (
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Ionicons name="refresh" size={20} color={Colors.accent} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {isComingSoon ? (
        <View style={styles.centered}>
          <View style={[styles.spotifyLogo, { opacity: 0.4 }]}>
            <Ionicons name="time-outline" size={48} color={Colors.textSecondary} />
          </View>
          <Text style={[styles.connectTitle, { color: Colors.textSecondary }]}>Funzione in arrivo</Text>
          <Text style={styles.connectDesc}>La funzione Spotify è in arrivo. Stiamo aspettando l'Extended Quota Mode da Spotify.</Text>
          <TouchableOpacity style={[styles.connectBtn, { opacity: 0.5 }]} disabled>
            <Ionicons name="logo-spotify" size={20} color="#fff" />
            <Text style={styles.connectBtnText}>Funzione in arrivo</Text>
          </TouchableOpacity>
        </View>
      ) : isNotConfigured ? (
        <View style={styles.centered}>
          <View style={[styles.spotifyLogo, { opacity: 0.4 }]}>
            <Ionicons name="musical-notes" size={48} color={Colors.textSecondary} />
          </View>
          <Text style={[styles.connectTitle, { color: Colors.textSecondary }]}>Spotify non disponibile</Text>
          <Text style={styles.connectDesc}>L'integrazione Spotify non è configurata in questo ambiente.</Text>
          <TouchableOpacity style={[styles.connectBtn, { opacity: 0.5 }]} disabled>
            <Ionicons name="logo-spotify" size={20} color="#fff" />
            <Text style={styles.connectBtnText}>Funzione in arrivo</Text>
          </TouchableOpacity>
        </View>
      ) : !isConnected ? (
        <NotConnectedView onConnect={() => connectMutation.mutate()} isConnecting={connectMutation.isPending} />
      ) : (
        <>
          {/* Spotify card */}
          <View style={styles.connectedCard}>
            <View style={styles.connectedLeft}>
              <Ionicons name="checkmark-circle" size={20} color={SPOTIFY_GREEN} />
              <View>
                <Text style={styles.connectedName}>{statusQuery.data?.displayName ?? "Connesso"}</Text>
                <Text style={styles.connectedSub}>{statusQuery.data?.trackCount ?? 0} brani · Spotify</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleDisconnect} disabled={disconnectMutation.isPending}>
              <Ionicons name="log-out-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabBar}>
            {(["brani", "match", "ricevute"] as Tab[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === "brani" ? "I Miei Brani" : tab === "match" ? "Match" : "Ricevute"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab content */}
          {activeTab === "brani" && (
            <MyTracksTab data={myTracksQuery.data} isLoading={myTracksQuery.isLoading} />
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
              onSetMatchLogic={setMatchLogic}
              minSongs={minSongs}
              onSetMinSongs={setMinSongs}
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
        </>
      )}
    </View>
  );
}

function NotConnectedView({ onConnect, isConnecting }: { onConnect: () => void; isConnecting: boolean }) {
  return (
    <View style={styles.centered}>
      <View style={styles.spotifyLogo}>
        <Ionicons name="musical-notes" size={48} color={SPOTIFY_GREEN} />
      </View>
      <Text style={styles.connectTitle}>Connetti Spotify</Text>
      <Text style={styles.connectDesc}>
        Sincronizza i tuoi brani preferiti e scopri bikers con gusti musicali simili ai tuoi.
      </Text>
      <TouchableOpacity style={styles.connectBtn} onPress={onConnect} disabled={isConnecting}>
        {isConnecting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="logo-spotify" size={20} color="#fff" />
            <Text style={styles.connectBtnText}>Collega con Spotify</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function MyTracksTab({ data, isLoading }: { data?: MyTracksData; isLoading: boolean }) {
  const [showAllTracks, setShowAllTracks] = useState(false);
  if (isLoading) return <LoadingView />;
  if (!data || data.tracks.length === 0) {
    return <EmptyView icon="musical-note" text="Nessun brano trovato. Premi aggiorna per sincronizzare." />;
  }
  const LIMIT = 20;
  const visibleTracks = showAllTracks ? data.tracks : data.tracks.slice(0, LIMIT);

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      {data.topGenres.length > 0 && (
        <Section title="I Tuoi Generi">
          <View style={styles.genreWrap}>
            {data.topGenres.slice(0, 8).map((g) => (
              <View key={g} style={styles.genreChip}>
                <Text style={styles.genreText}>{g}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}

      {data.topArtists.length > 0 && (
        <Section title="Artisti Top">
          {data.topArtists.slice(0, 6).map((artist) => (
            <View key={artist.id} style={styles.artistRow}>
              <View style={styles.artistDot} />
              <Text style={styles.artistName}>{artist.name}</Text>
              <Text style={styles.artistCount}>{artist.count} brani</Text>
            </View>
          ))}
        </Section>
      )}

      <Section title={`Brani (${data.tracks.length})`}>
        {visibleTracks.map((track) => (
          <View key={track.id} style={styles.trackRow}>
            <View style={styles.trackInfo}>
              <Text style={styles.trackName} numberOfLines={1}>{track.trackName}</Text>
              <Text style={styles.trackArtist} numberOfLines={1}>{track.artistName}</Text>
            </View>
            <Text style={styles.trackPop}>{track.popularity}%</Text>
          </View>
        ))}
        {data.tracks.length > LIMIT && (
          <TouchableOpacity onPress={() => setShowAllTracks((v) => !v)} style={{ paddingVertical: 10, alignItems: "center" }}>
            <Text style={[styles.moreText, { color: Colors.accent }]}>
              {showAllTracks ? "Mostra meno" : `Mostra altri ${data.tracks.length - LIMIT} brani`}
            </Text>
          </TouchableOpacity>
        )}
      </Section>
    </ScrollView>
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
        {/* Filters */}
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
          <LoadingView />
        ) : !hasData ? null : matches.length === 0 ? (
          <EmptyView icon="people" text="Nessun biker trovato con gusti simili. Prova a cambiare i filtri." />
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
  if (isLoading) return <LoadingView />;
  if (playlists.length === 0) {
    return <EmptyView icon="albums" text="Nessuna playlist ricevuta ancora. Chiedi a un biker di condividere la sua musica!" />;
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function LoadingView() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

function EmptyView({ icon, text }: { icon: IoniconsName; text: string }) {
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={40} color={Colors.textSecondary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
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
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  syncBtn: {
    padding: 6,
  },
  spotifyLogo: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  connectTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  connectDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: SPOTIFY_GREEN,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 8,
  },
  connectBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  connectedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  connectedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  connectedName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  connectedSub: {
    fontSize: 12,
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
  section: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 10,
    marginTop: 14,
  },
  genreWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  genreChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genreText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "capitalize",
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  artistDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SPOTIFY_GREEN,
  },
  artistName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  artistCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  },
  trackPop: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  moreText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
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
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});

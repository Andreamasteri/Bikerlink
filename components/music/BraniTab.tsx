import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { usePlayer, PlayerTrack } from "@/lib/player-context";
import { useT } from "@/lib/language-context";
import { getApiUrl } from "@/lib/query-client";
import { SearchTrack, LibraryTrack, PreviewResult, LASTFM_RED } from "./types";
import { SearchTrackRow } from "./SearchTrackRow";
import { LibraryTrackRow } from "./LibraryTrackRow";

type StreamService = "youtube" | "youtubemusic" | "google";

function buildSearchUrl(query: string, service: StreamService) {
  const q = encodeURIComponent(query);
  if (service === "youtubemusic") return `https://music.youtube.com/search?q=${q}`;
  if (service === "youtube") return `https://www.youtube.com/results?search_query=${q}`;
  return `https://www.google.com/search?q=${q}`;
}

export function BraniTab({
  isConnected,
  onConnect,
  searchInput,
  onSearchChange,
  searchResults,
  searchLoading,
  searchError,
  library,
  libraryLoading,
  savedIds,
  onAdd,
  onRemove,
  playlistOverride,
  onResetPlaylist,
  pendingAddId,
  pendingRemoveId,
  onDisconnect,
  onShare,
}: {
  provider: "lastfm";
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
  onAdd: (track: SearchTrack) => void;
  onRemove: (id: string) => void;
  playlistOverride: { nickname: string; tracks: LibraryTrack[] } | null;
  onResetPlaylist: () => void;
  pendingAddId: string | null;
  pendingRemoveId: string | null;
  onDisconnect: () => void;
  onShare: () => void;
}) {
  const t = useT();
  const providerColor = LASTFM_RED;
  const providerName = "Last.fm";
  const { playQueue, isAvailable: playerAvailable, currentTrack, isPlaying } = usePlayer();
  const [playAllLoading, setPlayAllLoading] = useState(false);
  const [streamService, setStreamService] = useState<StreamService>("youtube");

  const displayedLibrary: LibraryTrack[] = playlistOverride ? playlistOverride.tracks : library;

  useEffect(() => {
    AsyncStorage.getItem("stream_service_pref").then((v) => {
      if (v === "youtube" || v === "youtubemusic" || v === "google") setStreamService(v as StreamService);
    });
  }, []);

  const handleSelectService = useCallback((svc: StreamService) => {
    setStreamService(svc);
    AsyncStorage.setItem("stream_service_pref", svc);
  }, []);

  const handleOpenPlaylist = useCallback(() => {
    if (displayedLibrary.length === 0) return;
    const query = displayedLibrary
      .slice(0, 20)
      .map((t) => `${t.trackName} ${t.artistName}`)
      .join(" + ");
    Linking.openURL(buildSearchUrl(query, streamService));
  }, [displayedLibrary, streamService]);

  const handlePlayAll = useCallback(async () => {
    if (!playerAvailable || displayedLibrary.length === 0) return;

    const doPlay = async () => {
      setPlayAllLoading(true);
      try {
        const tracksParam = encodeURIComponent(
          JSON.stringify(displayedLibrary.map((t) => ({ trackName: t.trackName, artistName: t.artistName })))
        );
        const url = new URL(`/api/music/radio/preview-playlist?tracks=${tracksParam}`, getApiUrl());
        const resp = await fetch(url.toString());
        if (!resp.ok) throw new Error(t("music.error"));
        const previews: PreviewResult[] = await resp.json();
        if (!previews || previews.length === 0) {
          Alert.alert(t("music.noPreviewTitle"), t("music.noPreviewMsgShared"));
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
      } catch {
        Alert.alert(t("music.error"), "Impossibile caricare le anteprime.");
      } finally {
        setPlayAllLoading(false);
      }
    };

    if (currentTrack && isPlaying && currentTrack.source !== "preview") {
      const sourceLabel = currentTrack.source === "radio" ? t("music.sourceRadio") : t("music.sourceTrack");
      Alert.alert(
        t("music.alreadyListening"),
        t("music.replaceWithPlaylistMsg").replace("{source}", sourceLabel),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("music.replace"), style: "default", onPress: doPlay },
        ]
      );
    } else {
      await doPlay();
    }
  }, [displayedLibrary, playQueue, playerAvailable, currentTrack, isPlaying]);

  if (isConnected === null) {
    return (
      <View style={styles.tabContent}>
        <ActivityIndicator color={providerColor} size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!isConnected) {
    return (
      <View style={styles.connectContainer}>
        <Ionicons name="radio" size={52} color={providerColor} />
        <Text style={styles.connectTitle}>Collega {providerName}</Text>
        <Text style={styles.connectDesc}>
          {t("music.lastfmConnectPrompt")}
        </Text>
        <TouchableOpacity style={[styles.connectBtn, { backgroundColor: providerColor }]} onPress={onConnect}>
          <Text style={styles.connectBtnText}>Collega ora</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <View style={styles.searchBarWrapper}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("music.searchTracks")}
          placeholderTextColor={Colors.textSecondary}
          value={searchInput}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchInput.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {searchInput.length >= 2 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("music.searchResults")}</Text>
            {searchLoading ? (
              <ActivityIndicator color={Colors.accent} style={{ marginVertical: 20 }} />
            ) : searchError ? (
              <Text style={styles.errorText}>{searchError}</Text>
            ) : searchResults.length === 0 ? (
              <Text style={styles.emptyText}>{t("music.noResults")}</Text>
            ) : (
              searchResults.map((track) => (
                <SearchTrackRow
                  key={track.lastfmTrackId}
                  track={track}
                  onAdd={onAdd}
                  isAdded={savedIds.has(track.lastfmTrackId)}
                  isPending={pendingAddId === track.lastfmTrackId}
                />
              ))
            )}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {playlistOverride ? t("music.sharedPlaylistFrom").replace("{nickname}", playlistOverride.nickname) : t("music.myPlaylist")}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {playlistOverride && (
                <TouchableOpacity onPress={onResetPlaylist}>
                  <Text style={{ color: Colors.accent, fontSize: 13, fontFamily: "Inter_500Medium" }}>Chiudi</Text>
                </TouchableOpacity>
              )}
              {!playlistOverride && (
                <TouchableOpacity onPress={onShare} disabled={library.length === 0}>
                  <Ionicons name="share-social-outline" size={18} color={library.length > 0 ? Colors.accent : Colors.textSecondary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onDisconnect}>
                <Ionicons name="log-out-outline" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {libraryLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginVertical: 20 }} />
          ) : displayedLibrary.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="musical-note-outline" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t("music.emptyPlaylist")}</Text>
            </View>
          ) : (
            <>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.playAllBtn}
                  onPress={handlePlayAll}
                  disabled={playAllLoading || !playerAvailable}
                >
                  {playAllLoading ? (
                    <ActivityIndicator size="small" color={Colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="play-circle" size={14} color={Colors.accent} />
                      <Text style={styles.playAllBtnText}>{t("music.playAllPreviews")}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.openAppBtn} onPress={handleOpenPlaylist}>
                  <Ionicons name="open-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.openAppBtnText}>Apri in {streamService === "google" ? "Google" : "YouTube"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.serviceRow}>
                {(["youtube", "youtubemusic", "google"] as const).map((svc) => (
                  <TouchableOpacity
                    key={svc}
                    style={[styles.serviceChip, streamService === svc && styles.serviceChipActive]}
                    onPress={() => handleSelectService(svc)}
                  >
                    <Text style={[styles.serviceChipText, streamService === svc && styles.serviceChipTextActive]}>
                      {svc === "youtubemusic" ? "YT Music" : svc === "youtube" ? "YouTube" : "Google"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {displayedLibrary.map((track) => (
                <LibraryTrackRow
                  key={track.lastfmTrackId}
                  track={track}
                  onRemove={onRemove}
                  isRemoving={pendingRemoveId === track.lastfmTrackId}
                  streamService={streamService}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
  },
  connectContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  connectTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  connectDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  connectBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  connectBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  searchBarWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 4,
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
    marginTop: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accent + "11",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  playAllBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  openAppBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  openAppBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  serviceRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  serviceChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  serviceChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "11",
  },
  serviceChipText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  serviceChipTextActive: {
    color: Colors.accent,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.accent,
    textAlign: "center",
    marginVertical: 10,
  },
});

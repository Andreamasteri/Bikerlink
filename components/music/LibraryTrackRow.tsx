import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { usePlayer } from "@/lib/player-context";
import { useT } from "@/lib/language-context";
import { getApiUrl } from "@/lib/query-client";
import { LibraryTrack, PreviewResult } from "./types";

function buildSearchUrl(query: string, service: "youtube" | "youtubemusic" | "google") {
  const q = encodeURIComponent(query);
  if (service === "youtubemusic") return `https://music.youtube.com/search?q=${q}`;
  if (service === "youtube") return `https://www.youtube.com/results?search_query=${q}`;
  return `https://www.google.com/search?q=${q}`;
}

export function LibraryTrackRow({
  track,
  onRemove,
  isRemoving,
  streamService,
}: {
  track: LibraryTrack;
  onRemove: (id: string) => void;
  isRemoving: boolean;
  streamService: "youtube" | "youtubemusic" | "google";
}) {
  const t = useT();
  const { playTrack, isAvailable: playerAvailable, currentTrack, isPlaying } = usePlayer();
  const [imgError, setImgError] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [liveArtwork, setLiveArtwork] = useState<string | null>(null);

  const handlePlay = useCallback(async () => {
    if (!playerAvailable) {
      Alert.alert(t("music.playerUnavailable"), t("music.playerUnavailableMsg"));
      return;
    }

    setLoadingPreview(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const url = new URL(
        `/api/music/radio/preview?track=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`,
        getApiUrl()
      );
      const resp = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error("No preview");
      const results: PreviewResult[] = await resp.json();
      const preview = results[0];
      if (!preview?.previewUrl) throw new Error("No preview available");
      if (preview.artworkUrl) setLiveArtwork(preview.artworkUrl);
      await playTrack({
        id: preview.trackId,
        url: preview.previewUrl,
        title: preview.trackName,
        artist: preview.artistName,
        album: preview.albumName ?? undefined,
        artwork: preview.artworkUrl ?? undefined,
        duration: preview.durationMs ? preview.durationMs / 1000 : 30,
        source: "preview" as const,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        Alert.alert(t("common.timeout"), t("music.previewTimeout"));
      } else {
        Alert.alert(t("music.previewUnavailable"), t("music.previewUnavailableMsg"));
      }
    } finally {
      setLoadingPreview(false);
    }
  }, [track, playTrack, playerAvailable, t]);

  const isThisPlaying =
    currentTrack?.title === track.trackName &&
    currentTrack?.artist === track.artistName &&
    isPlaying;

  const displayUrl = liveArtwork ?? track.imageUrl ?? null;

  const handleOpenStream = useCallback(() => {
    const query = `${track.trackName} ${track.artistName}`;
    Linking.openURL(buildSearchUrl(query, streamService));
  }, [track, streamService]);

  return (
    <View style={styles.trackRow}>
      {displayUrl && !imgError ? (
        <Image source={{ uri: displayUrl }} style={styles.albumArt} onError={() => setImgError(true)} />
      ) : (
        <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
          <Ionicons name="musical-notes" size={16} color={Colors.accent} />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackName} numberOfLines={1}>{track.trackName}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artistName}</Text>
      </View>
      {playerAvailable && (
        <TouchableOpacity
          onPress={handlePlay}
          disabled={loadingPreview}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: 4 }}
        >
          {loadingPreview ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons
              name={isThisPlaying ? "pause-circle" : "play-circle-outline"}
              size={22}
              color={Colors.accent}
            />
          )}
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={handleOpenStream}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginRight: 20 }}
      >
        <Ionicons name="open-outline" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => {
          Alert.alert(
            t("music.removeTrack"),
            t("music.removeTrackMsg").replace("{name}", track.trackName ?? ""),
            [
              { text: t("common.cancel"), style: "cancel" },
              { text: t("music.remove"), style: "destructive", onPress: () => onRemove(track.lastfmTrackId) },
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

const styles = StyleSheet.create({
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  albumArt: {
    width: 44,
    height: 44,
    borderRadius: 4,
    marginRight: 12,
  },
  albumArtPlaceholder: {
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfo: {
    flex: 1,
    marginRight: 12,
  },
  trackName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  trackArtist: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
});

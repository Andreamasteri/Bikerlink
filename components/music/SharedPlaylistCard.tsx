import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import Colors from "@/constants/colors";
import { usePlayer, PlayerTrack } from "@/lib/player-context";
import { useT } from "@/lib/language-context";
import { getApiUrl } from "@/lib/query-client";
import { SharedPlaylistEntry, PreviewResult, formatDate } from "./types";

export function SharedPlaylistCard({
  item,
  onMerge,
  isMerging,
}: {
  item: SharedPlaylistEntry;
  onMerge: (id: number) => void;
  isMerging: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingTrack, setDownloadingTrack] = useState<string | null>(null);
  const { playQueue, isAvailable: playerAvailable, currentTrack, isPlaying } = usePlayer();

  const handleDownloadTrack = useCallback(async (track: { trackName: string; artistName: string }) => {
    const trackKey = `${track.trackName}__${track.artistName}`;
    setDownloadingTrack(trackKey);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permesso negato", "Concedi l'accesso alla libreria musicale per salvare il brano.");
        return;
      }
      const url = new URL(
        `/api/music/radio/preview?track=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`,
        getApiUrl()
      );
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error("No preview");
      const results: PreviewResult[] = await resp.json();
      const preview = results[0];
      if (!preview?.previewUrl) throw new Error("No preview available");
      const safeName = `${track.trackName} - ${track.artistName}`.replace(/[^a-zA-Z0-9_\- ]/g, "_");
      const destUri = FileSystem.documentDirectory + safeName + ".m4a";
      const downloadRes = await FileSystem.downloadAsync(preview.previewUrl, destUri);
      if (downloadRes.status !== 200) throw new Error("Download failed");
      await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
      Alert.alert("Salvato!", `"${track.trackName}" salvato nella tua libreria musicale.`);
    } catch {
      Alert.alert(t("music.error"), "Impossibile scaricare l'anteprima. Riprova.");
    } finally {
      setDownloadingTrack(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreview = useCallback(async () => {
    if (!playerAvailable) {
      Alert.alert(t("music.playerUnavailable"), t("music.playerUnavailableMsg"));
      return;
    }
    if (item.tracks.length === 0) return;

    const doPlay = async () => {
      setPreviewLoading(true);
      try {
        const tracksParam = encodeURIComponent(
          JSON.stringify(item.tracks.map((t) => ({ trackName: t.trackName, artistName: t.artistName })))
        );
        const url = new URL(`/api/music/radio/preview-playlist?tracks=${tracksParam}`, getApiUrl());
        const resp = await fetch(url.toString());
        if (!resp.ok) throw new Error(t("music.loadError"));
        const previews: PreviewResult[] = await resp.json();
        if (!previews || previews.length === 0) {
          Alert.alert(t("music.noPreviewTitle"), t("music.noPreviewMsg"));
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
        Alert.alert(t("music.error"), "Impossibile caricare le anteprime.");
      } finally {
        setPreviewLoading(false);
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
  }, [item.tracks, playQueue, playerAvailable, currentTrack, isPlaying, t]);

  return (
    <View style={styles.playlistCard}>
      <TouchableOpacity style={styles.playlistHeader} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        {item.fromUser.photos[0] ? (
          <Image source={{ uri: item.fromUser.photos[0] }} style={styles.playlistAvatar} />
        ) : (
          <View style={[styles.playlistAvatar, styles.avatarPlaceholder]}>
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
            <Ionicons name="checkmark" size={14} color={Colors.accent} />
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
          {item.tracks.map((track, i) => {
            const trackKey = `${track.trackName}__${track.artistName}`;
            const isDownloading = downloadingTrack === trackKey;
            return (
              <View key={i} style={styles.previewTrack}>
                <Ionicons name="musical-note" size={12} color={Colors.textSecondary} />
                <Text style={[styles.previewTrackText, { flex: 1 }]} numberOfLines={1}>
                  {track.trackName} — {track.artistName}
                </Text>
                <TouchableOpacity
                  onPress={() => handleDownloadTrack(track)}
                  disabled={!!downloadingTrack}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 6 }}
                >
                  {isDownloading ? (
                    <ActivityIndicator size="small" color={Colors.accent} />
                  ) : (
                    <Ionicons name="cloud-download-outline" size={16} color={Colors.accent} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
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

const styles = StyleSheet.create({
  playlistCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playlistHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  playlistAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistMeta: {
    flex: 1,
  },
  playlistName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  playlistSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  mergeBtn: {
    backgroundColor: Colors.accent + "11",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  mergeBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  mergedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accent + "11",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  mergedText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.accent,
  },
  previewTrack: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
  },
  previewTrackText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  previewBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.accent,
  },
});

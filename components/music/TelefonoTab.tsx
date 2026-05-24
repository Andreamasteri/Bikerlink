import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import Colors from "@/constants/colors";
import { usePlayer, PlayerTrack } from "@/lib/player-context";
import { useT } from "@/lib/language-context";
import { parseAudioFilename } from "./types";
import { TelefonoTrackRow } from "./TelefonoTrackRow";

export function TelefonoTab() {
  const t = useT();
  const { playTrack, playQueue, isAvailable: playerAvailable } = usePlayer();
  const [permission, requestPermission] = MediaLibrary.usePermissions({ granularPermissions: ["audio"] });
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);

  const loadAssets = useCallback(async (cursor?: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MediaLibrary typing gap
        mediaType: "audio" as any,
        first: 50,
        after: cursor,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SortBy not typed in expo-media-library
        sortBy: ((MediaLibrary as any).SortBy?.creationTime ?? (MediaLibrary as any).SortBy?.default),
      });
      setAssets((prev) => {
        const combined: MediaLibrary.Asset[] = cursor ? [...prev, ...(result.assets as unknown as MediaLibrary.Asset[])] : (result.assets as unknown as MediaLibrary.Asset[]);
        return combined.slice().sort((a, b) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-media-library Asset typing gap
          const ta = parseAudioFilename((a as any).filename ?? "").title.toLowerCase();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-media-library Asset typing gap
          const tb = parseAudioFilename((b as any).filename ?? "").title.toLowerCase();
          return ta.localeCompare(tb);
        });
      });
      setHasMore(result.hasNextPage);
      setEndCursor(result.endCursor);
    } catch (err) {
      console.warn("[TelefonoTab] loadAssets error:", err);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handlePermissionRequest = useCallback(async () => {
    const result = await requestPermission();
    if (result.granted) loadAssets();
  }, [requestPermission, loadAssets]);

  useEffect(() => {
    if (permission?.granted) loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  const handlePlayTrack = useCallback((asset: MediaLibrary.Asset) => {
    if (!playerAvailable) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-media-library Asset typing gap
    const a = asset as any;
    const { title, artist } = parseAudioFilename(a.filename ?? "");
    playTrack({
      id: a.id,
      url: a.uri,
      title,
      artist,
      duration: a.duration,
      source: "file",
    });
  }, [playTrack, playerAvailable]);

  const handlePlayAll = useCallback(async () => {
    if (!playerAvailable || assets.length === 0) return;
    const tracks: PlayerTrack[] = assets.map((asset) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-media-library Asset typing gap
      const a = asset as any;
      const { title, artist } = parseAudioFilename(a.filename ?? "");
      return { id: a.id, url: a.uri, title, artist, duration: a.duration, source: "file" as const };
    });
    await playQueue(tracks, 0);
  }, [assets, playQueue, playerAvailable]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="musical-notes-outline" size={48} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>
          {permission.canAskAgain
            ? "Concedi l'accesso alla libreria musicale per ascoltare i tuoi MP3."
            : "Accesso negato nelle impostazioni del dispositivo."}
        </Text>
        {permission.canAskAgain && (
          <TouchableOpacity style={teleStyles.permBtn} onPress={handlePermissionRequest}>
            <Text style={teleStyles.permBtnText}>Concedi accesso</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (assets.length === 0 && !loading) {
    return (
      <View style={styles.centered}>
        <Ionicons name="musical-notes-outline" size={48} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>Nessun file audio trovato sul dispositivo.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.section, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 6 }]}>
        <Text style={styles.sectionTitle}>{loading && assets.length === 0 ? t("music.loading") : t("music.tracksCount").replace("{count}", String(assets.length))}</Text>
        <TouchableOpacity style={styles.playAllBtn} onPress={handlePlayAll} disabled={!playerAvailable || assets.length === 0}>
          <Ionicons name="play-circle" size={14} color={Colors.accent} />
          <Text style={styles.playAllBtnText}>{t("music.playAll")}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        onEndReached={() => { if (hasMore && endCursor) loadAssets(endCursor); }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <ActivityIndicator color={Colors.accent} style={{ padding: 12 }} /> : null}
        renderItem={({ item }) => <TelefonoTrackRow asset={item} onPlay={handlePlayTrack} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
});

const teleStyles = StyleSheet.create({
  permBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  permBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});

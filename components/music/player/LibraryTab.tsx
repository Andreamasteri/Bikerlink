import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { PlayerTrack } from "@/lib/player-context";

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface LibraryTabProps {
  onPlayTrack: (track: PlayerTrack) => void;
}

export function LibraryTab({ onPlayTrack }: LibraryTabProps) {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);

  const loadAssets = useCallback(
    async (cursor?: string) => {
      if (loading) return;
      setLoading(true);
      try {
        const result = await MediaLibrary.getAssetsAsync({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MediaLibrary typing gap
          mediaType: "audio" as any,
          first: 30,
          after: cursor,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SortBy not typed in expo-media-library
          sortBy: ((MediaLibrary as any).SortBy?.default),
        });
        setAssets((prev) => (cursor ? [...prev, ...(result.assets as unknown as MediaLibrary.Asset[])] : (result.assets as unknown as MediaLibrary.Asset[])));
        setHasMore(result.hasNextPage);
        setEndCursor(result.endCursor);
      } catch (err) {
        console.warn("[LibraryTab] loadAssets error:", err);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  const handlePermissionRequest = useCallback(async () => {
    const result = await requestPermission();
    if (result.granted) {
      loadAssets();
    }
  }, [requestPermission, loadAssets]);

  useEffect(() => {
    if (permission?.granted) {
      loadAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        onPlayTrack({
          id: file.uri,
          url: file.uri,
          title: (file.name ?? "").replace(/\.[^.]+$/, "") || "File audio",
          artist: "File locale",
          source: "file",
        });
      }
    } catch (err) {
      console.warn("[LibraryTab] pickFile error:", err);
      Alert.alert("Errore", "Impossibile aprire il file audio.");
    }
  }, [onPlayTrack]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="musical-notes-outline" size={40} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>
          {permission.canAskAgain
            ? "Concedi l'accesso alla libreria musicale"
            : "Accesso negato. Apri un file singolo."}
        </Text>
        {permission.canAskAgain && (
          <TouchableOpacity style={styles.permBtn} onPress={handlePermissionRequest}>
            <Text style={styles.permBtnText}>Concedi accesso</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.permBtn, { marginTop: 8, backgroundColor: Colors.surface }]}
          onPress={pickFile}
        >
          <Text style={[styles.permBtnText, { color: Colors.text }]}>
            Apri file singolo
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (assets.length === 0 && !loading) {
    return (
      <View style={styles.center}>
        <Ionicons name="musical-notes-outline" size={40} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>Nessun brano trovato</Text>
        <TouchableOpacity style={styles.permBtn} onPress={pickFile}>
          <Text style={styles.permBtnText}>Apri file singolo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={styles.filePickerRow} onPress={pickFile}>
        <Ionicons name="document-outline" size={18} color={Colors.accent} />
        <Text style={styles.filePickerText}>Apri file singolo</Text>
      </TouchableOpacity>
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        onEndReached={() => hasMore && endCursor && loadAssets(endCursor)}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <ActivityIndicator color={Colors.accent} style={{ padding: 12 }} /> : null}
        renderItem={({ item }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MediaLibrary.Asset legacy/index type mismatch
          const itemAny = item as any;
          const title = (itemAny.filename ?? "").replace(/\.[^.]+$/, "") || "Brano";
          const durationSec = itemAny.duration ?? 0;
          return (
            <TouchableOpacity
              style={styles.trackRow}
              onPress={() =>
                onPlayTrack({
                  id: itemAny.id,
                  url: itemAny.uri,
                  title,
                  artist: "Libreria locale",
                  duration: durationSec,
                  source: "library",
                })
              }
            >
              <Ionicons name="musical-note" size={20} color={Colors.textSecondary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.trackTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.trackMeta}>{formatTime(durationSec)}</Text>
              </View>
              <Ionicons name="play-circle-outline" size={24} color={Colors.accent} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 24,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  permBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  filePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 8,
  },
  filePickerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.accent,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  trackTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  trackMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});

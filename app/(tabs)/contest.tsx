import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Platform,
  Alert,
  TextInput,
  RefreshControl,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { showImagePickerMenu } from "@/lib/image-picker-utils";

import Colors from "@/constants/colors";
import { useT, useLocale } from "@/lib/language-context";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMN_COUNT = 2;
const GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

interface ContestEntry {
  id: string;
  userId: string;
  photoUrl: string | null;
  caption: string | null;
  performanceData: string | null;
  weekNumber: number;
  year: number;
  votesCount: number;
  isApproved: boolean;
  createdAt: string;
  hasVoted: boolean;
  isOwn: boolean;
}

interface PerformanceData {
  totalDistanceKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxAltitude: number;
  durationSeconds: number;
  idleTimeSeconds: number;
  date: string;
}

interface ContestResponse {
  entries: ContestEntry[];
  weekNumber: number;
  year: number;
  votesUsed: number;
  maxVotesPerDay: number;
}

function formatPerfTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function PerformanceCard({ data }: { data: PerformanceData }) {
  const locale = useLocale();
  const dur = data.durationSeconds || 0;
  const net = Math.max(dur - (data.idleTimeSeconds || 0), 0);

  return (
    <View style={styles.perfCard}>
      <View style={styles.perfHeader}>
        <Ionicons name="speedometer" size={16} color={Colors.accent} />
        <Text style={styles.perfHeaderText}>Performance</Text>
      </View>
      <View style={styles.perfGrid}>
        <View style={styles.perfItem}>
          <Text style={styles.perfValue}>{data.totalDistanceKm.toFixed(1)}</Text>
          <Text style={styles.perfLabel}>km</Text>
        </View>
        <View style={styles.perfItem}>
          <Text style={styles.perfValue}>{data.maxSpeedKmh.toFixed(0)}</Text>
          <Text style={styles.perfLabel}>km/h max</Text>
        </View>
        <View style={styles.perfItem}>
          <Text style={styles.perfValue}>{data.maxAltitude.toFixed(0)}</Text>
          <Text style={styles.perfLabel}>m quota</Text>
        </View>
        <View style={styles.perfItem}>
          <Text style={styles.perfValue}>{formatPerfTime(net)}</Text>
          <Text style={styles.perfLabel}>in moto</Text>
        </View>
      </View>
      {data.date ? (
        <Text style={styles.perfDate}>
          {new Date(data.date).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
      ) : null}
    </View>
  );
}

function resolvePhotoUrl(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  if (photoUrl.startsWith("http://") || photoUrl.startsWith("https://")) return photoUrl;
  const base = getApiUrl().replace(/\/$/, "");
  return `${base}${photoUrl.startsWith("/") ? "" : "/"}${photoUrl}`;
}

function ContestEntryCard({
  entry,
  onVote,
  onDelete,
  votingDisabled,
}: {
  entry: ContestEntry;
  onVote: (id: string) => void;
  onDelete: (id: string) => void;
  votingDisabled: boolean;
}) {
  let perfData: PerformanceData | null = null;
  if (entry.performanceData) {
    try {
      perfData = JSON.parse(entry.performanceData);
    } catch {}
  }

  const photoUri = resolvePhotoUrl(entry.photoUrl);

  return (
    <View style={styles.photoCard}>
      {perfData ? (
        <PerformanceCard data={perfData} />
      ) : photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, { justifyContent: "center", alignItems: "center" }]}>
          <Ionicons name="image-outline" size={32} color={Colors.textSecondary} />
        </View>
      )}
      {entry.isOwn ? (
        <Pressable style={styles.deleteBtn} onPress={() => onDelete(entry.id)}>
          <Ionicons name="trash" size={16} color="#FFF" />
        </Pressable>
      ) : null}
      {entry.caption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {entry.caption}
        </Text>
      ) : null}
      <View style={styles.photoFooter}>
        <Pressable
          onPress={() => onVote(entry.id)}
          disabled={entry.hasVoted || entry.isOwn || votingDisabled}
          style={[
            styles.voteBtn,
            (entry.isOwn || votingDisabled) && !entry.hasVoted && styles.voteBtnDisabled,
          ]}
        >
          <Ionicons
            name={entry.hasVoted ? "heart" : "heart-outline"}
            size={18}
            color={entry.hasVoted || !entry.isOwn ? Colors.accentRed : Colors.textSecondary}
          />
          <Text style={[styles.voteCount, entry.isOwn && { color: Colors.textSecondary }]}>
            {entry.votesCount}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ContestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const [showUpload, setShowUpload] = useState(false);
  const [caption, setCaption] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<ContestResponse>({
    queryKey: ["/api/contest/entries"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await apiRequest("DELETE", `/api/contest/entries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contest/entries"] });
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile eliminare la foto");
    },
  });

  const voteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await apiRequest("POST", `/api/contest/entries/${entryId}/vote`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contest/entries"] });
    },
    onError: (error: Error) => {
      const msg = error.message.includes(":")
        ? error.message.split(":").slice(1).join(":").trim()
        : error.message;
      try {
        const parsed = JSON.parse(msg);
        Alert.alert("Errore", parsed.message || "Impossibile votare");
      } catch {
        Alert.alert("Errore", msg || "Impossibile votare");
      }
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { imageUri: string; caption: string }) => {
      const formData = new FormData();
      const filename = data.imageUri.split("/").pop() || "photo.jpg";
      const ext = /\.(\w+)$/.exec(filename);
      const mimeType = ext ? `image/${ext[1].toLowerCase()}` : "image/jpeg";

      if (Platform.OS === "web") {
        const response = await globalThis.fetch(data.imageUri);
        const blob = await response.blob();
        formData.append("photo", blob, filename);
      } else {
        formData.append("photo", { uri: data.imageUri, name: filename, type: mimeType } as any);
      }

      if (data.caption) {
        formData.append("caption", data.caption);
      }

      const url = new URL("/api/contest/entries", getApiUrl());
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contest/entries"] });
      setShowUpload(false);
      setCaption("");
      setSelectedImage(null);
    },
    onError: (error: Error) => {
      Alert.alert("Errore", "Impossibile caricare la foto");
    },
  });

  const handleDelete = useCallback(
    (entryId: string) => {
      Alert.alert(
        "Elimina foto",
        "Sei sicuro di voler eliminare questa foto dal contest?",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Elimina",
            style: "destructive",
            onPress: () => deleteMutation.mutate(entryId),
          },
        ]
      );
    },
    [deleteMutation]
  );

  const handleVote = useCallback(
    (entryId: string) => {
      voteMutation.mutate(entryId);
    },
    [voteMutation]
  );

  const handlePickImage = useCallback(() => {
    showImagePickerMenu(
      (uri) => {
        setSelectedImage(uri);
        setShowUpload(true);
      },
      { aspect: [4, 3], quality: 0.8 }
    );
  }, []);

  const handleUpload = useCallback(() => {
    if (!selectedImage) return;
    uploadMutation.mutate({ imageUri: selectedImage, caption });
  }, [selectedImage, caption, uploadMutation]);

  const votesUsed = data?.votesUsed ?? 0;
  const votesRemaining = 10 - votesUsed;
  const votingDisabled = votesRemaining <= 0;

  const renderEntry = useCallback(
    ({ item }: { item: ContestEntry }) => (
      <ContestEntryCard
        entry={item}
        onVote={handleVote}
        onDelete={handleDelete}
        votingDisabled={votingDisabled}
      />
    ),
    [handleVote, handleDelete, votingDisabled]
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.policyBar}>
        <Ionicons name="information-circle" size={16} color={Colors.warning} />
        <Text style={styles.policyText} numberOfLines={2}>
          Carica le tue migliori foto in moto!
        </Text>
      </View>

      <View style={styles.votesBar}>
        <Text style={styles.votesBarText}>
          {t("contest.votesLeft")}: {votesRemaining}/10
        </Text>
        <Pressable
          style={styles.winnersBtn}
          onPress={() => router.push("/contest/winners" as any)}
        >
          <Ionicons name="trophy" size={16} color={Colors.accent} />
          <Text style={styles.winnersText}>Hall of Fame</Text>
        </Pressable>
      </View>

      {showUpload && selectedImage ? (
        <View style={styles.uploadContainer}>
          <Image source={{ uri: selectedImage }} style={styles.uploadPreview} />
          <TextInput
            style={styles.captionInput}
            placeholder="Didascalia (opzionale)"
            placeholderTextColor={Colors.textSecondary}
            value={caption}
            onChangeText={setCaption}
            maxLength={200}
          />
          <View style={styles.uploadActions}>
            <Pressable
              onPress={() => {
                setShowUpload(false);
                setSelectedImage(null);
                setCaption("");
              }}
              style={styles.cancelUploadBtn}
            >
              <Ionicons name="close" size={22} color={Colors.text} />
            </Pressable>
            <Pressable
              onPress={handleUpload}
              disabled={uploadMutation.isPending}
              style={styles.confirmUploadBtn}
            >
              {uploadMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="checkmark" size={22} color="#FFF" />
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <FlatList
        data={data?.entries ?? []}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        scrollEnabled={(data?.entries?.length ?? 0) > 0}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="camera-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>{t("common.noResults")}</Text>
            <Text style={styles.emptySubtext}>
              Carica la prima foto della settimana!
            </Text>
          </View>
        }
      />

        <Pressable
          style={[styles.fab, { bottom: Platform.OS === "web" ? 94 : 16 }]}
          onPress={handlePickImage}
        >
          <Ionicons name="camera" size={28} color={Colors.background} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loading: {
    justifyContent: "center",
    alignItems: "center",
  },
  policyBar: {
    flexDirection: "row",
    padding: 12,
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: Colors.warning + "15",
    alignItems: "center",
  },
  policyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
  },
  votesBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  votesBarText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  winnersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  winnersText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  list: {
    padding: 8,
    paddingBottom: 80,
  },
  columnWrapper: {
    gap: GAP,
  },
  photoCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
    position: "relative",
  },
  deleteBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  cardImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: Colors.surfaceLight,
  },
  caption: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  photoFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
  },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  voteBtnDisabled: {
    opacity: 0.5,
  },
  voteCount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accentRed,
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  uploadContainer: {
    margin: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  uploadPreview: {
    width: "100%",
    height: 200,
    backgroundColor: Colors.surfaceLight,
  },
  captionInput: {
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  uploadActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelUploadBtn: {
    padding: 8,
  },
  confirmUploadBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    padding: 10,
  },
  perfCard: {
    backgroundColor: Colors.background,
    padding: 12,
    aspectRatio: 4 / 3,
    justifyContent: "center",
  },
  perfHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    justifyContent: "center",
  },
  perfHeaderText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  perfGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
  },
  perfItem: {
    alignItems: "center",
    width: "45%",
    paddingVertical: 4,
  },
  perfValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  perfLabel: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textTransform: "uppercase",
  },
  perfDate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
});

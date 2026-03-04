import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Platform,
  Alert,
  TextInput,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMN_COUNT = 2;
const GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

interface ContestEntry {
  id: string;
  userId: string;
  photoUrl: string;
  caption: string | null;
  weekNumber: number;
  year: number;
  votesCount: number;
  isApproved: boolean;
  createdAt: string;
  hasVoted: boolean;
  isOwn: boolean;
}

interface ContestResponse {
  entries: ContestEntry[];
  weekNumber: number;
  year: number;
  votesUsed: number;
  maxVotesPerDay: number;
}

function ContestEntryCard({
  entry,
  onVote,
  votingDisabled,
}: {
  entry: ContestEntry;
  onVote: (id: string) => void;
  votingDisabled: boolean;
}) {
  return (
    <View style={styles.card}>
      <Image source={{ uri: entry.photoUrl }} style={styles.cardImage} />
      <View style={styles.cardOverlay}>
        <View style={styles.voteRow}>
          <TouchableOpacity
            onPress={() => onVote(entry.id)}
            disabled={entry.hasVoted || entry.isOwn || votingDisabled}
            style={[
              styles.voteButton,
              entry.hasVoted && styles.voteButtonActive,
              (entry.isOwn || votingDisabled) && !entry.hasVoted && styles.voteButtonDisabled,
            ]}
          >
            <MaterialCommunityIcons
              name={entry.hasVoted ? "heart" : "heart-outline"}
              size={18}
              color={entry.hasVoted ? Colors.dark.rosa : "#FFF"}
            />
          </TouchableOpacity>
          <Text style={styles.voteCount}>{entry.votesCount}</Text>
        </View>
      </View>
      {entry.caption ? (
        <View style={styles.captionContainer}>
          <Text style={styles.captionText} numberOfLines={2}>
            {entry.caption}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ContestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [caption, setCaption] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const { data, isLoading, refetch } = useQuery<ContestResponse>({
    queryKey: ["/api/contest/entries"],
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
    mutationFn: async (data: { photoUrl: string; caption: string }) => {
      await apiRequest("POST", "/api/contest/entries", data);
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

  const handleVote = useCallback(
    (entryId: string) => {
      voteMutation.mutate(entryId);
    },
    [voteMutation]
  );

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setShowUpload(true);
    }
  }, []);

  const handleUpload = useCallback(() => {
    if (!selectedImage) return;
    uploadMutation.mutate({ photoUrl: selectedImage, caption });
  }, [selectedImage, caption, uploadMutation]);

  const votesUsed = data?.votesUsed ?? 0;
  const votesRemaining = 10 - votesUsed;
  const votingDisabled = votesRemaining <= 0;

  const renderEntry = useCallback(
    ({ item }: { item: ContestEntry }) => (
      <ContestEntryCard
        entry={item}
        onVote={handleVote}
        votingDisabled={votingDisabled}
      />
    ),
    [handleVote, votingDisabled]
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t("contest.title")}</Text>
          <TouchableOpacity
            onPress={() => router.push("/contest/winners" as any)}
            style={styles.winnersButton}
          >
            <MaterialCommunityIcons name="trophy" size={22} color={Colors.dark.accent} />
          </TouchableOpacity>
        </View>
        <View style={styles.votesInfo}>
          <MaterialCommunityIcons name="heart" size={14} color={Colors.dark.rosa} />
          <Text style={styles.votesText}>
            {t("contest.votesLeft")}: {votesRemaining}/10
          </Text>
        </View>
        <Text style={styles.weekLabel}>
          {t("contest.thisWeek")} - {data?.weekNumber ?? ""}/{data?.year ?? ""}
        </Text>
      </View>

      {showUpload && selectedImage ? (
        <View style={styles.uploadContainer}>
          <Image source={{ uri: selectedImage }} style={styles.uploadPreview} />
          <TextInput
            style={styles.captionInput}
            placeholder="Didascalia (opzionale)"
            placeholderTextColor={Colors.dark.textMuted}
            value={caption}
            onChangeText={setCaption}
            maxLength={200}
          />
          <View style={styles.uploadActions}>
            <TouchableOpacity
              onPress={() => {
                setShowUpload(false);
                setSelectedImage(null);
                setCaption("");
              }}
              style={styles.cancelUploadBtn}
            >
              <MaterialCommunityIcons name="close" size={22} color={Colors.dark.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleUpload}
              disabled={uploadMutation.isPending}
              style={styles.confirmUploadBtn}
            >
              {uploadMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <MaterialCommunityIcons name="check" size={22} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <FlatList
        data={data?.entries ?? []}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        scrollEnabled={(data?.entries?.length ?? 0) > 0}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="camera-off"
              size={48}
              color={Colors.dark.textMuted}
            />
            <Text style={styles.emptyText}>{t("common.noResults")}</Text>
            <Text style={styles.emptySubtext}>
              Carica la prima foto della settimana!
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: 90 + (Platform.OS === "web" ? 34 : 0) }]}
        onPress={handlePickImage}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="camera-plus" size={26} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  winnersButton: {
    padding: 8,
  },
  votesInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  votesText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  weekLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  listContent: {
    padding: GAP,
    paddingBottom: 120,
  },
  columnWrapper: {
    gap: GAP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.dark.surface,
    marginBottom: GAP,
  },
  cardImage: {
    width: "100%",
    height: CARD_WIDTH * 1.1,
    backgroundColor: Colors.dark.surfaceLight,
  },
  cardOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  voteButton: {
    padding: 2,
  },
  voteButtonActive: {
    opacity: 1,
  },
  voteButtonDisabled: {
    opacity: 0.4,
  },
  voteCount: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  captionContainer: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  captionText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    fontWeight: "600" as const,
  },
  emptySubtext: {
    color: Colors.dark.textMuted,
    fontSize: 13,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  uploadContainer: {
    margin: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  uploadPreview: {
    width: "100%",
    height: 200,
    backgroundColor: Colors.dark.surfaceLight,
  },
  captionInput: {
    padding: 12,
    color: Colors.dark.text,
    fontSize: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  uploadActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  cancelUploadBtn: {
    padding: 8,
  },
  confirmUploadBtn: {
    backgroundColor: Colors.dark.accent,
    borderRadius: 20,
    padding: 10,
  },
});

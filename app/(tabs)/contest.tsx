import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { showImagePickerMenu, appendFileToForm } from "@/lib/image-picker-utils";

import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";

import { ContestEntryCard, ContestEntry } from "@/components/contest/ContestCard";
import { ContestLeaderboard } from "@/components/contest/ContestLeaderboard";
import { ContestRules } from "@/components/contest/ContestRules";
import { ContestHeader } from "@/components/contest/ContestHeader";
import { ContestUpload } from "@/components/contest/ContestUpload";

const GAP = 8;
const COLUMN_COUNT = 2;

const keyExtractor = (item: ContestEntry) => item.id;

interface ContestResponse {
  entries: ContestEntry[];
  weekNumber: number;
  year: number;
  votesUsed: number;
  maxVotesPerDay: number;
}

export default function ContestScreen() {
  const t = useT();
  const [, setShowUpload] = useState(false);
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
    onError: (_error: Error) => {
      const msg = _error.message.includes(":")
        ? _error.message.split(":").slice(1).join(":").trim()
        : _error.message;
      try {
        const parsed = JSON.parse(msg);
        Alert.alert(t("common.error"), parsed.message || t("contest.cannotVote"));
      } catch {
        Alert.alert(t("common.error"), msg || t("contest.cannotVote"));
      }
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { imageUri: string; caption: string }) => {
      const formData = new FormData();
      const filename = data.imageUri.split("/").pop() || "photo.jpg";
      const ext = /\.(\w+)$/.exec(filename);
      const mimeType = ext ? `image/${ext[1].toLowerCase()}` : "image/jpeg";

      await appendFileToForm(formData, "photo", data.imageUri, mimeType, filename);

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
      let message = "Impossibile caricare la foto";
      const raw = error.message ?? "";
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.message) message = parsed.message;
        else if (parsed?.error) message = parsed.error;
      } catch {
        try {
          const colonBody = raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : raw;
          const parsed = JSON.parse(colonBody);
          if (parsed?.message) message = parsed.message;
          else if (parsed?.error) message = parsed.error;
        } catch {
          if (raw.length > 0 && raw.length < 200) message = raw;
        }
      }
      Alert.alert("Errore upload", message);
    },
  });

  // Le mutation sono ref-stabili nei metodi (.mutate) ma cambiano riferimento a
  // ogni transizione di stato: tenerle in ref evita di rigenerare gli handler — e
  // a cascata renderEntry — quando l'utente vota/elimina. exhaustive-deps esenta i ref.
  const deleteMutationRef = useRef(deleteMutation);
  deleteMutationRef.current = deleteMutation;
  const voteMutationRef = useRef(voteMutation);
  voteMutationRef.current = voteMutation;
  const uploadMutationRef = useRef(uploadMutation);
  uploadMutationRef.current = uploadMutation;

  const handleDelete = useCallback(
    (entryId: string) => {
      Alert.alert(
        t("contest.deletePhoto"),
        t("contest.deletePhotoConfirm"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: () => deleteMutationRef.current.mutate(entryId),
          },
        ]
      );
    },
    [t]
  );

  const handleVote = useCallback(
    (entryId: string) => {
      voteMutationRef.current.mutate(entryId);
    },
    []
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
    uploadMutationRef.current.mutate({ imageUri: selectedImage, caption });
  }, [selectedImage, caption]);

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
        <InlineMiniPlayer />
        <ContestRules />
        <ContestHeader votesRemaining={votesRemaining} />

        <ContestUpload
          selectedImage={selectedImage}
          caption={caption}
          setCaption={setCaption}
          onCancel={() => {
            setShowUpload(false);
            setSelectedImage(null);
            setCaption("");
          }}
          onUpload={handleUpload}
          isUploading={uploadMutation.isPending}
        />

        <FlatList
          data={data?.entries ?? []}
          renderItem={renderEntry}
          keyExtractor={keyExtractor}
          numColumns={COLUMN_COUNT}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          scrollEnabled={true}
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
          ListFooterComponent={<ContestLeaderboard />}
        />

        <Pressable
          style={[styles.fab, { bottom: 16 }]}
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
  list: {
    padding: 8,
    paddingBottom: 80,
  },
  columnWrapper: {
    gap: GAP,
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
});


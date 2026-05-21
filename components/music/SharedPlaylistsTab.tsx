import React from "react";
import {
  FlatList,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { SharedPlaylistEntry } from "./types";
import { SharedPlaylistCard } from "./SharedPlaylistCard";

export function SharedPlaylistsTab({
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
      contentContainerStyle={{ paddingBottom: 120, paddingTop: 10 }}
      renderItem={({ item }) => (
        <SharedPlaylistCard item={item} onMerge={onMerge} isMerging={isMerging} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
});

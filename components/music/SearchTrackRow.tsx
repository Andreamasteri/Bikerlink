import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { SearchTrack } from "./types";

export function SearchTrackRow({
  track,
  onAdd,
  isAdded,
  isPending,
}: {
  track: SearchTrack;
  onAdd: (track: SearchTrack) => void;
  isAdded: boolean;
  isPending: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <View style={styles.trackRow}>
      {track.imageUrl && !imgError ? (
        <Image source={{ uri: track.imageUrl }} style={styles.albumArt} onError={() => setImgError(true)} />
      ) : (
        <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
          <Ionicons name="musical-notes" size={16} color={Colors.textSecondary} />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackName} numberOfLines={1}>{track.trackName}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artistName}</Text>
      </View>
      <TouchableOpacity
        style={[styles.addBtn, isAdded && styles.addBtnDisabled]}
        onPress={() => onAdd(track)}
        disabled={isAdded || isPending}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isPending ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : isAdded ? (
          <Ionicons name="checkmark-circle" size={24} color={Colors.accent} />
        ) : (
          <Ionicons name="add-circle-outline" size={24} color={Colors.textSecondary} />
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
  addBtn: {
    padding: 4,
  },
  addBtnDisabled: {
    opacity: 0.8,
  },
});

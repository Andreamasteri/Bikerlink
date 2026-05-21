import React, { useState } from "react";
import {
  TouchableOpacity,
  Image,
  View,
  Text,
  Platform,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import Colors from "@/constants/colors";
import { usePlayer } from "@/lib/player-context";
import { parseAudioFilename, formatDurationSecs } from "./types";

export function TelefonoTrackRow({
  asset,
  onPlay,
}: {
  asset: MediaLibrary.Asset;
  onPlay: (asset: MediaLibrary.Asset) => void;
}) {
  const { currentTrack, isPlaying } = usePlayer();
  const [artworkErr, setArtworkErr] = useState(false);
  const isActive = currentTrack?.id === asset.id;
  const { title, artist } = parseAudioFilename(asset.filename ?? "");
  const dur = asset.duration ?? 0;
  const artworkUri = Platform.OS === "android" && !artworkErr ? `${asset.uri}/albumart` : null;

  return (
    <TouchableOpacity
      style={[styles.trackRow, isActive && { backgroundColor: Colors.accent + "11" }]}
      onPress={() => onPlay(asset)}
      activeOpacity={0.7}
    >
      {artworkUri ? (
        <Image
          source={{ uri: artworkUri }}
          style={styles.albumArt}
          onError={() => setArtworkErr(true)}
        />
      ) : (
        <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
          <Ionicons
            name={isActive && isPlaying ? "pause" : "musical-note"}
            size={18}
            color={isActive ? Colors.accent : Colors.textSecondary}
          />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={[styles.trackName, isActive && { color: Colors.accent }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {artist}{dur > 0 ? ` · ${formatDurationSecs(dur)}` : ""}
        </Text>
      </View>
      <Ionicons
        name={isActive && isPlaying ? "pause-circle" : "play-circle-outline"}
        size={26}
        color={isActive ? Colors.accent : Colors.textSecondary}
      />
    </TouchableOpacity>
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
});

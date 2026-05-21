import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { PlayerTrack } from "@/lib/player-context";
import { ArtworkImage } from "./ArtworkImage";

interface PlayerTrackInfoProps {
  track?: PlayerTrack | null;
  size?: number;
}

export function PlayerTrackInfo({ track, size = 220 }: PlayerTrackInfoProps) {
  return (
    <View style={styles.container}>
      <View style={styles.artworkContainer}>
        <ArtworkImage uri={track?.artwork} size={size} style={{ borderRadius: 16 }} />
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {track?.title ?? "Nessun brano"}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track?.artist ?? "---"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: "100%",
  },
  artworkContainer: {
    paddingVertical: 32,
    alignItems: "center",
  },
  infoContainer: {
    width: "100%",
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  trackTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  trackArtist: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
});

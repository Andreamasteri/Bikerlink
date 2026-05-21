import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { RepeatMode } from "@/lib/player-context";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function repeatIcon(mode: RepeatMode): IoniconName {
  if (mode === "track") return "repeat";
  if (mode === "queue") return "repeat";
  return "repeat-outline";
}

interface PlayerControlsProps {
  isPlaying: boolean;
  isBuffering: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  isRadio?: boolean;
}

export function PlayerControls({
  isPlaying,
  isBuffering,
  isShuffled,
  repeatMode,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleShuffle,
  onToggleRepeat,
  isRadio,
}: PlayerControlsProps) {
  const repeatColor = repeatMode === "off" ? Colors.textSecondary : Colors.accent;
  const repeatLabel = repeatMode === "track" ? "1" : repeatMode === "queue" ? "∞" : undefined;

  return (
    <View style={styles.container}>
      {!isRadio && (
        <TouchableOpacity style={styles.subBtn} onPress={onToggleShuffle}>
          <Ionicons
            name="shuffle"
            size={22}
            color={isShuffled ? Colors.accent : Colors.textSecondary}
          />
        </TouchableOpacity>
      )}

      <View style={styles.mainControls}>
        {!isRadio && (
          <TouchableOpacity style={styles.skipBtn} onPress={onPrev}>
            <Ionicons name="play-back" size={32} color={Colors.text} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.playBtn} onPress={onTogglePlay} disabled={isBuffering}>
          {isBuffering ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name={isPlaying ? "pause" : "play"} size={40} color="#fff" />
          )}
        </TouchableOpacity>

        {!isRadio && (
          <TouchableOpacity style={styles.skipBtn} onPress={onNext}>
            <Ionicons name="play-forward" size={32} color={Colors.text} />
          </TouchableOpacity>
        )}
      </View>

      {!isRadio && (
        <TouchableOpacity style={styles.subBtn} onPress={onToggleRepeat}>
          <View>
            <Ionicons name={repeatIcon(repeatMode)} size={22} color={repeatColor} />
            {repeatLabel && (
              <View style={styles.repeatBadge}>
                <Text style={styles.repeatBadgeText}>{repeatLabel}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 20,
    marginTop: 20,
  },
  mainControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 32,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  skipBtn: {
    padding: 8,
  },
  subBtn: {
    padding: 10,
    minWidth: 42,
    alignItems: "center",
  },
  repeatBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: Colors.accent,
    borderRadius: 6,
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
  },
});

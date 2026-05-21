import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Colors from "@/constants/colors";

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface PlayerProgressProps {
  position: number;
  duration: number;
  onSeek: (pos: number) => void;
}

export function PlayerProgress({ position, duration, onSeek }: PlayerProgressProps) {
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.time}>{formatTime(position)}</Text>
      <TouchableOpacity
        style={styles.bar}
        activeOpacity={0.8}
        onPress={(e) => {
          const { locationX, target } = e.nativeEvent;
          if (!target) return;
          // Note: The original code used a hardcoded 260 for the width. 
          // We keep it as is to avoid functional changes.
          onSeek((locationX / 260) * duration);
        }}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          <View style={[styles.thumb, { left: `${Math.round(progress * 100)}%` as `${number}%` }]} />
        </View>
      </TouchableOpacity>
      <Text style={styles.time}>
        {duration > 0 ? formatTime(duration) : "--:--"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  time: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    width: 36,
    textAlign: "center",
  },
  bar: {
    flex: 1,
    paddingVertical: 10,
  },
  track: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    position: "relative",
  },
  fill: {
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
    position: "absolute",
    left: 0,
    top: 0,
  },
  thumb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
    position: "absolute",
    top: -4,
    marginLeft: -6,
  },
});

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "@/lib/player-context";
import Colors from "@/constants/colors";
import { ArtworkImage } from "./music/player/ArtworkImage";
import { ExpandedPlayer } from "./music/player/ExpandedPlayer";

const MINI_HEIGHT = 60;

function sourceLabel(source: string): string {
  switch (source) {
    case "file": return "📱 Da telefono";
    case "radio": return "📻 Radio";
    case "preview": return "🎵 Anteprima 30s";
    case "library": return "🎵 Libreria";
    default: return "";
  }
}

export function MiniPlayer({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const { currentTrack, isPlaying, isBuffering, togglePlay, next, isAvailable, source } = usePlayer();
  const [showModal, setShowModal] = useState(false);

  if (!currentTrack) return null;

  const srcLabel = sourceLabel(source);

  return (
    <>
      <Pressable
        style={[miniStyles.container, { bottom: bottomOffset }]}
        onPress={() => setShowModal(true)}
      >
        <ArtworkImage uri={currentTrack.artwork} size={40} style={{ borderRadius: 4 }} />
        <View style={miniStyles.info}>
          <Text style={miniStyles.title} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={miniStyles.artist} numberOfLines={1}>
            {currentTrack.artist}
          </Text>
          {srcLabel ? (
            <Text style={miniStyles.sourceLabel} numberOfLines={1}>
              {srcLabel}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={miniStyles.actionBtn}
          onPress={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          disabled={!isAvailable}
        >
          {isBuffering ? (
            <ActivityIndicator size="small" color={Colors.text} />
          ) : (
            <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={Colors.text} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={miniStyles.actionBtn}
          onPress={(e) => {
            e.stopPropagation();
            next();
          }}
          disabled={!isAvailable}
        >
          <Ionicons name="play-skip-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </Pressable>

      <ExpandedPlayer visible={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}

export function InlineMiniPlayer() {
  const { currentTrack, isPlaying, togglePlay, stop } = usePlayer();
  const [showModal, setShowModal] = useState(false);
  if (!currentTrack) return null;
  return (
    <View style={inlineMiniStyles.container}>
      <TouchableOpacity
        style={inlineMiniStyles.info}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="musical-note" size={14} color={Colors.accent} style={{ marginRight: 6 }} />
        <Text style={inlineMiniStyles.title} numberOfLines={1}>
          {currentTrack.title}
        </Text>
        {currentTrack.artist ? (
          <Text style={inlineMiniStyles.artist} numberOfLines={1}>
            {" · "}{currentTrack.artist}
          </Text>
        ) : null}
      </TouchableOpacity>
      <View style={inlineMiniStyles.controls}>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); togglePlay(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={Colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); stop(); }}
          style={{ marginLeft: 12 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="stop" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <ExpandedPlayer visible={showModal} onClose={() => setShowModal(false)} />
    </View>
  );
}

const miniStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 8,
    right: 8,
    height: MINI_HEIGHT,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
    zIndex: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  artist: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  actionBtn: {
    padding: 6,
    minWidth: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textSecondary,
    marginTop: 1,
    opacity: 0.8,
  },
});

const inlineMiniStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  info: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    marginRight: 8,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    flexShrink: 1,
  },
  artist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  controls: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
});

export const MINI_PLAYER_HEIGHT = MINI_HEIGHT;

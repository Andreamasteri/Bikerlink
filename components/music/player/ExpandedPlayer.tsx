import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlayer, PlayerTrack, RadioStation } from "@/lib/player-context";
import Colors from "@/constants/colors";
import { PlayerTrackInfo } from "./PlayerTrackInfo";
import { PlayerProgress } from "./PlayerProgress";
import { PlayerControls } from "./PlayerControls";
import { SleepTimerButton } from "./SleepTimerButton";
import { RadioTab } from "./RadioTab";
import { LibraryTab } from "./LibraryTab";

interface ExpandedPlayerProps {
  visible: boolean;
  onClose: () => void;
}

export function ExpandedPlayer({ visible, onClose }: ExpandedPlayerProps) {
  const insets = useSafeAreaInsets();
  const {
    isPlaying,
    currentTrack,
    source,
    position,
    duration,
    isBuffering,
    isShuffled,
    repeatMode,
    togglePlay,
    next,
    prev,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    playRadioStation,
    playTrack,
  } = usePlayer();
  const [activeTab, setActiveTab] = useState<"radio" | "library">("radio");

  const handlePlayStation = useCallback(
    (station: RadioStation, genreId: string) => {
      playRadioStation(station, genreId);
    },
    [playRadioStation]
  );

  const handlePlayLibraryTrack = useCallback(
    (track: PlayerTrack) => {
      playTrack(track);
    },
    [playTrack]
  );

  const isRadio = source === "radio";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="chevron-down" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {source === "radio"
              ? "Radio"
              : source === "preview"
              ? "Anteprima 30s"
              : source === "library"
              ? "Libreria"
              : "File"}
          </Text>
          <SleepTimerButton />
        </View>

        <PlayerTrackInfo track={currentTrack} />

        <View style={styles.content}>
          <PlayerProgress
            position={position}
            duration={duration}
            onSeek={seekTo}
          />

          <PlayerControls
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            isShuffled={isShuffled}
            repeatMode={repeatMode}
            onTogglePlay={togglePlay}
            onNext={next}
            onPrev={prev}
            onToggleShuffle={toggleShuffle}
            onToggleRepeat={toggleRepeat}
            isRadio={isRadio}
          />

          <View style={styles.tabs}>
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, activeTab === "radio" && styles.tabActive]}
                onPress={() => setActiveTab("radio")}
              >
                <Text style={[styles.tabText, activeTab === "radio" && styles.tabTextActive]}>
                  Radio FM
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === "library" && styles.tabActive]}
                onPress={() => setActiveTab("library")}
              >
                <Text style={[styles.tabText, activeTab === "library" && styles.tabTextActive]}>
                  Libreria
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tabContent}>
              {activeTab === "radio" ? (
                <RadioTab onPlayStation={handlePlayStation} />
              ) : (
                <LibraryTab onPlayTrack={handlePlayLibraryTrack} />
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    height: 44,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
    marginLeft: -4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  tabs: {
    flex: 1,
    marginTop: 24,
  },
  tabBar: {
    flexDirection: "row",
    gap: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 16,
  },
  tab: {
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tabTextActive: { color: Colors.accent },
  tabContent: { flex: 1 },
});

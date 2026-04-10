import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { usePlayer, PlayerTrack, RadioStation } from "@/lib/player-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const MINI_HEIGHT = 60;

interface Genre {
  id: string;
  label: string;
  icon: string;
}

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ArtworkImage({
  uri,
  size,
  style,
}: {
  uri?: string | null;
  size: number;
  style?: object;
}) {
  const [errored, setErrored] = useState(false);
  if (!uri || errored) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: 6,
            backgroundColor: Colors.surface,
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
      >
        <Ionicons name="musical-notes" size={size * 0.4} color={Colors.textSecondary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[{ width: size, height: size, borderRadius: 6 }, style]}
      onError={() => setErrored(true)}
    />
  );
}

function ProgressBar({
  position,
  duration,
  onSeek,
}: {
  position: number;
  duration: number;
  onSeek: (pos: number) => void;
}) {
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  return (
    <View style={progressStyles.container}>
      <Text style={progressStyles.time}>{formatTime(position)}</Text>
      <TouchableOpacity
        style={progressStyles.bar}
        activeOpacity={0.8}
        onPress={(e) => {
          const { locationX, target } = e.nativeEvent;
          if (!target) return;
          onSeek((locationX / 260) * duration);
        }}
      >
        <View style={progressStyles.track}>
          <View style={[progressStyles.fill, { width: `${progress * 100}%` }]} />
          <View style={[progressStyles.thumb, { left: `${progress * 100}%` as any }]} />
        </View>
      </TouchableOpacity>
      <Text style={progressStyles.time}>
        {duration > 0 ? formatTime(duration) : "--:--"}
      </Text>
    </View>
  );
}

const progressStyles = StyleSheet.create({
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

function RadioTab({
  onPlayStation,
}: {
  onPlayStation: (station: RadioStation, genreId: string) => void;
}) {
  const { selectedGenre, setSelectedGenre, favoriteStationIds, toggleFavorite, currentTrack } =
    usePlayer();

  const { data: genres = [] } = useQuery<Genre[]>({
    queryKey: ["/api/music/genres"],
  });

  const { data: stations = [], isLoading: loadingStations } = useQuery<RadioStation[]>({
    queryKey: ["/api/music/stations", selectedGenre],
    enabled: !!selectedGenre,
  });

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={radioStyles.sectionTitle}>Generi</Text>
      <View style={radioStyles.genreGrid}>
        {genres.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[
              radioStyles.genreChip,
              selectedGenre === g.id && radioStyles.genreChipActive,
            ]}
            onPress={() => setSelectedGenre(g.id === selectedGenre ? null : g.id)}
          >
            <Text style={radioStyles.genreIcon}>{g.icon}</Text>
            <Text
              style={[
                radioStyles.genreLabel,
                selectedGenre === g.id && radioStyles.genreLabelActive,
              ]}
            >
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedGenre && (
        <>
          <Text style={radioStyles.sectionTitle}>Stazioni</Text>
          {loadingStations ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 16 }} />
          ) : stations.length === 0 ? (
            <Text style={radioStyles.emptyText}>Nessuna stazione trovata</Text>
          ) : (
            stations.map((s) => {
              const isFav = favoriteStationIds.includes(s.id);
              const isPlaying = currentTrack?.id === s.id;
              return (
                <View key={s.id} style={radioStyles.stationRow}>
                  <TouchableOpacity
                    style={radioStyles.stationInfo}
                    onPress={() => onPlayStation(s, selectedGenre)}
                  >
                    <ArtworkImage uri={s.favicon} size={40} style={{ borderRadius: 4 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          radioStyles.stationName,
                          isPlaying && { color: Colors.accent },
                        ]}
                        numberOfLines={1}
                      >
                        {s.name}
                      </Text>
                      <Text style={radioStyles.stationMeta}>
                        {[s.country, s.bitrate ? `${s.bitrate}kbps` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleFavorite(s.id)} style={{ padding: 8 }}>
                    <Ionicons
                      name={isFav ? "heart" : "heart-outline"}
                      size={20}
                      color={isFav ? Colors.accent : Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </>
      )}

      {favoriteStationIds.length > 0 && !selectedGenre && (
        <>
          <Text style={radioStyles.sectionTitle}>Preferiti</Text>
          <Text style={radioStyles.emptyText}>
            Seleziona un genere per vedere le stazioni preferite
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const radioStyles = StyleSheet.create({
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  genreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genreChipActive: {
    backgroundColor: Colors.accent + "22",
    borderColor: Colors.accent,
  },
  genreIcon: { fontSize: 14 },
  genreLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  genreLabelActive: { color: Colors.accent },
  stationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  stationInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stationName: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  stationMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
});

function SleepTimerButton() {
  const { sleepTimer, sleepTimerEnd, setSleepTimer } = usePlayer();
  const OPTIONS = [null, 15, 30, 60] as const;

  const minutesLeft = sleepTimerEnd
    ? Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 60000))
    : null;

  const cycleTimer = () => {
    const idx = OPTIONS.indexOf(sleepTimer as any);
    const next = OPTIONS[(idx + 1) % OPTIONS.length];
    setSleepTimer(next);
  };

  return (
    <TouchableOpacity style={controlStyles.iconBtn} onPress={cycleTimer}>
      <Ionicons
        name="moon"
        size={20}
        color={sleepTimerEnd ? Colors.accent : Colors.textSecondary}
      />
      {minutesLeft !== null && (
        <Text style={controlStyles.sleepLabel}>{minutesLeft}m</Text>
      )}
    </TouchableOpacity>
  );
}

const controlStyles = StyleSheet.create({
  iconBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
  },
  sleepLabel: {
    fontSize: 9,
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
});

export function FullPlayerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const {
    isPlaying,
    currentTrack,
    source,
    position,
    duration,
    isBuffering,
    isShuffled,
    togglePlay,
    next,
    prev,
    seekTo,
    toggleShuffle,
    playRadioStation,
    isAvailable,
  } = usePlayer();
  const [activeTab, setActiveTab] = useState<"radio" | "info">("radio");

  const handlePlayStation = useCallback(
    (station: RadioStation, genreId: string) => {
      playRadioStation(station, genreId);
    },
    [playRadioStation]
  );

  const isRadio = source === "radio";
  const isPreview = source === "preview";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          modalStyles.container,
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 16, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 },
        ]}
      >
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="chevron-down" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={modalStyles.headerTitle}>
            {source === "radio" ? "Radio" : source === "preview" ? "Anteprima 30s" : source === "library" ? "Libreria" : "File"}
          </Text>
          <SleepTimerButton />
        </View>

        <View style={modalStyles.artworkContainer}>
          <ArtworkImage uri={currentTrack?.artwork} size={240} style={{ borderRadius: 16 }} />
        </View>

        <View style={modalStyles.trackInfo}>
          <Text style={modalStyles.trackTitle} numberOfLines={1}>
            {currentTrack?.title || "Nessuna traccia"}
          </Text>
          <Text style={modalStyles.trackArtist} numberOfLines={1}>
            {currentTrack?.artist || (isAvailable ? "Seleziona una sorgente" : "Player non disponibile")}
          </Text>
        </View>

        {!isRadio && (
          <View style={modalStyles.progressSection}>
            <ProgressBar position={position} duration={duration} onSeek={seekTo} />
          </View>
        )}

        {isRadio && isBuffering && (
          <View style={modalStyles.bufferingRow}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={modalStyles.bufferingText}>Connessione...</Text>
          </View>
        )}

        <View style={modalStyles.controls}>
          <TouchableOpacity
            style={modalStyles.controlBtn}
            onPress={toggleShuffle}
            disabled={!isAvailable}
          >
            <Ionicons
              name="shuffle"
              size={24}
              color={isShuffled ? Colors.accent : Colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={modalStyles.controlBtn}
            onPress={prev}
            disabled={!isAvailable || isRadio}
          >
            <Ionicons
              name="play-skip-back"
              size={32}
              color={!isAvailable || isRadio ? Colors.border : Colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={modalStyles.playBtn}
            onPress={togglePlay}
            disabled={!isAvailable || !currentTrack}
          >
            {isBuffering ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={32}
                color={Colors.background}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={modalStyles.controlBtn}
            onPress={next}
            disabled={!isAvailable || isRadio}
          >
            <Ionicons
              name="play-skip-forward"
              size={32}
              color={!isAvailable || isRadio ? Colors.border : Colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity style={modalStyles.controlBtn} onPress={() => {}}>
            <Ionicons name="repeat" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={modalStyles.tabBar}>
          <TouchableOpacity
            style={[modalStyles.tab, activeTab === "radio" && modalStyles.tabActive]}
            onPress={() => setActiveTab("radio")}
          >
            <Ionicons
              name="radio"
              size={16}
              color={activeTab === "radio" ? Colors.accent : Colors.textSecondary}
            />
            <Text
              style={[
                modalStyles.tabText,
                activeTab === "radio" && modalStyles.tabTextActive,
              ]}
            >
              Radio
            </Text>
          </TouchableOpacity>
        </View>

        <View style={modalStyles.tabContent}>
          {activeTab === "radio" && (
            <RadioTab onPlayStation={handlePlayStation} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  closeBtn: { padding: 4 },
  artworkContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  trackInfo: {
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  trackTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
    textAlign: "center",
  },
  trackArtist: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  progressSection: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  bufferingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
    height: 24,
  },
  bufferingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 20,
  },
  controlBtn: {
    padding: 8,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
    marginBottom: 8,
    gap: 16,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Colors.accent },
  tabText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tabTextActive: { color: Colors.accent },
  tabContent: { flex: 1 },
});

export function MiniPlayer({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const { currentTrack, isPlaying, isBuffering, togglePlay, next, isAvailable } = usePlayer();
  const [showModal, setShowModal] = useState(false);

  if (!currentTrack) return null;

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

      <FullPlayerModal visible={showModal} onClose={() => setShowModal(false)} />
    </>
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
});

export const MINI_PLAYER_HEIGHT = MINI_HEIGHT;

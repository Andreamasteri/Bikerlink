import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  FlatList,
  Image,
  ActivityIndicator,
  Pressable,
  Platform,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as MediaLibrary from "expo-media-library";
import * as DocumentPicker from "expo-document-picker";
import { usePlayer, PlayerTrack, RadioStation, RepeatMode } from "@/lib/player-context";
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
          <View style={[progressStyles.thumb, { left: `${Math.round(progress * 100)}%` as `${number}%` }]} />
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
  const [useLastFm, setUseLastFm] = useState(false);

  const { data: genres = [] } = useQuery<Genre[]>({
    queryKey: ["/api/music/radio/genres"],
  });

  const { data: suggestedGenreIds = [] } = useQuery<string[]>({
    queryKey: ["/api/music/radio/suggested-genres"],
    enabled: useLastFm,
  });

  const { data: stations = [], isLoading: loadingStations } = useQuery<RadioStation[]>({
    queryKey: [selectedGenre ? `/api/music/radio/stations?genre=${selectedGenre}` : "/api/music/radio/stations"],
    enabled: !!selectedGenre,
  });

  const displayedGenres = useLastFm && suggestedGenreIds.length > 0
    ? [...genres].sort((a, b) => {
        const aIdx = suggestedGenreIds.indexOf(a.id);
        const bIdx = suggestedGenreIds.indexOf(b.id);
        if (aIdx !== -1 && bIdx === -1) return -1;
        if (bIdx !== -1 && aIdx === -1) return 1;
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        return 0;
      })
    : genres;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={radioStyles.lastFmRow}>
        <View style={{ flex: 1 }}>
          <Text style={radioStyles.lastFmLabel}>Suggerisci da Last.fm</Text>
          <Text style={radioStyles.lastFmSub}>Generi basati sulla tua musica</Text>
        </View>
        <Switch
          value={useLastFm}
          onValueChange={setUseLastFm}
          trackColor={{ false: Colors.border, true: Colors.accent + "66" }}
          thumbColor={useLastFm ? Colors.accent : Colors.textSecondary}
        />
      </View>

      <Text style={radioStyles.sectionTitle}>Generi</Text>
      <View style={radioStyles.genreGrid}>
        {displayedGenres.map((g) => {
          const isSuggested = suggestedGenreIds.includes(g.id);
          return (
            <TouchableOpacity
              key={g.id}
              style={[
                radioStyles.genreChip,
                selectedGenre === g.id && radioStyles.genreChipActive,
                useLastFm && isSuggested && radioStyles.genreChipSuggested,
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
              {useLastFm && isSuggested && (
                <Ionicons name="star" size={10} color={Colors.accent} />
              )}
            </TouchableOpacity>
          );
        })}
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
              const isActive = currentTrack?.id === s.id;
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
                          isActive && { color: Colors.accent },
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

function LibraryTab({
  onPlayTrack,
}: {
  onPlayTrack: (track: PlayerTrack) => void;
}) {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);

  const loadAssets = useCallback(
    async (cursor?: string) => {
      if (loading) return;
      setLoading(true);
      try {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.audio,
          first: 30,
          after: cursor,
          sortBy: MediaLibrary.SortBy.default,
        });
        setAssets((prev) => (cursor ? [...prev, ...result.assets] : result.assets));
        setHasMore(result.hasNextPage);
        setEndCursor(result.endCursor);
      } catch (err) {
        console.warn("[MiniPlayer] loadAssets error:", err);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  const handlePermissionRequest = useCallback(async () => {
    const result = await requestPermission();
    if (result.granted) {
      loadAssets();
    }
  }, [requestPermission, loadAssets]);

  React.useEffect(() => {
    if (Platform.OS !== "web" && permission?.granted) {
      loadAssets();
    }
  }, [permission?.granted]);

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        onPlayTrack({
          id: file.uri,
          url: file.uri,
          title: (file.name ?? "").replace(/\.[^.]+$/, "") || "File audio",
          artist: "File locale",
          source: "file",
        });
      }
    } catch (err) {
      console.warn("[MiniPlayer] pickFile error:", err);
      Alert.alert("Errore", "Impossibile aprire il file audio.");
    }
  }, [onPlayTrack]);

  if (Platform.OS === "web") {
    return (
      <View style={libStyles.center}>
        <Ionicons name="musical-notes-outline" size={40} color={Colors.textSecondary} />
        <Text style={libStyles.emptyText}>Libreria non disponibile sul web</Text>
        <TouchableOpacity style={libStyles.permBtn} onPress={pickFile}>
          <Text style={libStyles.permBtnText}>Apri file audio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={libStyles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={libStyles.center}>
        <Ionicons name="musical-notes-outline" size={40} color={Colors.textSecondary} />
        <Text style={libStyles.emptyText}>
          {permission.canAskAgain
            ? "Concedi l'accesso alla libreria musicale"
            : "Accesso negato. Apri un file singolo."}
        </Text>
        {permission.canAskAgain && (
          <TouchableOpacity style={libStyles.permBtn} onPress={handlePermissionRequest}>
            <Text style={libStyles.permBtnText}>Concedi accesso</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[libStyles.permBtn, { marginTop: 8, backgroundColor: Colors.surface }]}
          onPress={pickFile}
        >
          <Text style={[libStyles.permBtnText, { color: Colors.text }]}>
            Apri file singolo
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (assets.length === 0 && !loading) {
    return (
      <View style={libStyles.center}>
        <Ionicons name="musical-notes-outline" size={40} color={Colors.textSecondary} />
        <Text style={libStyles.emptyText}>Nessun brano trovato</Text>
        <TouchableOpacity style={libStyles.permBtn} onPress={pickFile}>
          <Text style={libStyles.permBtnText}>Apri file singolo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={libStyles.filePickerRow} onPress={pickFile}>
        <Ionicons name="document-outline" size={18} color={Colors.accent} />
        <Text style={libStyles.filePickerText}>Apri file singolo</Text>
      </TouchableOpacity>
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        onEndReached={() => hasMore && endCursor && loadAssets(endCursor)}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <ActivityIndicator color={Colors.accent} style={{ padding: 12 }} /> : null}
        renderItem={({ item }) => {
          const title = (item.filename ?? "").replace(/\.[^.]+$/, "") || "Brano";
          const durationSec = item.duration ?? 0;
          return (
            <TouchableOpacity
              style={libStyles.trackRow}
              onPress={() =>
                onPlayTrack({
                  id: item.id,
                  url: item.uri,
                  title,
                  artist: "Libreria locale",
                  duration: durationSec,
                  source: "library",
                })
              }
            >
              <Ionicons name="musical-note" size={20} color={Colors.textSecondary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={libStyles.trackTitle} numberOfLines={1}>{title}</Text>
                <Text style={libStyles.trackMeta}>{formatTime(durationSec)}</Text>
              </View>
              <Ionicons name="play-circle-outline" size={24} color={Colors.accent} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const libStyles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 24,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  permBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  filePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 8,
  },
  filePickerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.accent,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  trackTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  trackMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});

const radioStyles = StyleSheet.create({
  lastFmRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 4,
  },
  lastFmLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  lastFmSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
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
  genreChipSuggested: {
    borderColor: Colors.accent + "88",
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
    const idx = OPTIONS.indexOf(sleepTimer as (typeof OPTIONS)[number]);
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

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function repeatIcon(mode: RepeatMode): IoniconName {
  if (mode === "track") return "repeat";
  if (mode === "queue") return "repeat";
  return "repeat-outline";
}

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
    repeatMode,
    togglePlay,
    next,
    prev,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    playRadioStation,
    playTrack,
    isAvailable,
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
  const repeatColor =
    repeatMode === "off" ? Colors.textSecondary : Colors.accent;
  const repeatLabel =
    repeatMode === "track" ? "1" : repeatMode === "queue" ? "∞" : undefined;

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
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
            paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16,
          },
        ]}
      >
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="chevron-down" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={modalStyles.headerTitle}>
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

        <View style={modalStyles.artworkContainer}>
          <ArtworkImage uri={currentTrack?.artwork} size={220} style={{ borderRadius: 16 }} />
        </View>

        <View style={modalStyles.trackInfo}>
          <Text style={modalStyles.trackTitle} numberOfLines={1}>
            {currentTrack?.title || "Nessuna traccia"}
          </Text>
          <Text style={modalStyles.trackArtist} numberOfLines={1}>
            {currentTrack?.artist ||
              (isAvailable ? "Seleziona una sorgente" : "Player non disponibile")}
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
            disabled={!isAvailable || isRadio}
          >
            <Ionicons
              name="shuffle"
              size={24}
              color={isShuffled && !isRadio ? Colors.accent : Colors.textSecondary}
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

          <TouchableOpacity
            style={modalStyles.controlBtn}
            onPress={toggleRepeat}
            disabled={!isAvailable || isRadio}
          >
            <View style={{ alignItems: "center" }}>
              <Ionicons
                name={repeatIcon(repeatMode)}
                size={24}
                color={isRadio ? Colors.border : repeatColor}
              />
              {repeatLabel && !isRadio && (
                <Text style={{ fontSize: 9, color: Colors.accent, fontFamily: "Inter_700Bold", marginTop: 1 }}>
                  {repeatLabel}
                </Text>
              )}
            </View>
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

          <TouchableOpacity
            style={[modalStyles.tab, activeTab === "library" && modalStyles.tabActive]}
            onPress={() => setActiveTab("library")}
          >
            <Ionicons
              name="musical-notes"
              size={16}
              color={activeTab === "library" ? Colors.accent : Colors.textSecondary}
            />
            <Text
              style={[
                modalStyles.tabText,
                activeTab === "library" && modalStyles.tabTextActive,
              ]}
            >
              Libreria
            </Text>
          </TouchableOpacity>
        </View>

        <View style={modalStyles.tabContent}>
          {activeTab === "radio" && (
            <RadioTab onPlayStation={handlePlayStation} />
          )}
          {activeTab === "library" && (
            <LibraryTab onPlayTrack={handlePlayLibraryTrack} />
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

import React, { useState, useCallback, useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  Switch,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { usePlayer, RadioStation } from "@/lib/player-context";
import { useT } from "@/lib/language-context";
import { apiRequest } from "@/lib/query-client";
import { RadioGenre, LASTFM_SUGGEST_KEY } from "./types";

export function MusicRadioTab() {
  const t = useT();
  const { playRadioStation, selectedGenre, setSelectedGenre, favoriteStationIds, toggleFavorite, currentTrack } = usePlayer();
  const queryClient = useQueryClient();
  const [useLastFm, setUseLastFm] = useState(false);
  const [loadingStationId, setLoadingStationId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LASTFM_SUGGEST_KEY).then((v) => {
      if (v === "true") setUseLastFm(true);
    });
  }, []);

  const handleToggle = useCallback((val: boolean) => {
    setUseLastFm(val);
    AsyncStorage.setItem(LASTFM_SUGGEST_KEY, String(val)).catch(() => {});
  }, []);

  const handleStationPress = useCallback(async (s: RadioStation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLoadingStationId(s.id);
    try {
      await playRadioStation(s, selectedGenre ?? undefined);
    } finally {
      setLoadingStationId(null);
    }
  }, [playRadioStation, selectedGenre]);

  const { data: genres = [] } = useQuery<RadioGenre[]>({
    queryKey: ["/api/music/radio/genres"],
  });

  const { data: lastfmStatus } = useQuery<{ connected: boolean; username: string | null }>({
    queryKey: ["/api/lastfm/status"],
    enabled: useLastFm,
    staleTime: 5 * 60 * 1000,
  });

  const { data: suggestedGenreIds, isFetched: suggestedFetched } = useQuery<string[]>({
    queryKey: ["/api/music/radio/suggested-genres"],
    enabled: useLastFm,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });

  const disconnectLastfmMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/lastfm/disconnect", {}),
    onSuccess: () => {
      handleToggle(false);
      queryClient.invalidateQueries({ queryKey: ["/api/lastfm/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/radio/suggested-genres"] });
    },
  });

  useEffect(() => {
    if (useLastFm && suggestedFetched && suggestedGenreIds && suggestedGenreIds.length > 0 && !selectedGenre) {
      setSelectedGenre(suggestedGenreIds[0]);
    }
  }, [useLastFm, suggestedFetched, suggestedGenreIds, selectedGenre, setSelectedGenre]);

  const { data: stations = [], isLoading: loadingStations } = useQuery<RadioStation[]>({
    queryKey: selectedGenre
      ? [`/api/music/radio/stations?genre=${selectedGenre}`]
      : ["/api/music/radio/stations"],
    enabled: !!selectedGenre,
  });

  const displayedGenres =
    useLastFm && suggestedGenreIds && suggestedGenreIds.length > 0
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
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={radioTabStyles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={radioTabStyles.lastFmRow}>
        <View style={{ flex: 1 }}>
          <Text style={radioTabStyles.lastFmLabel}>Suggerisci da Last.fm</Text>
          <Text style={radioTabStyles.lastFmSub}>Generi basati sulla tua musica</Text>
        </View>
        <Switch
          value={useLastFm}
          onValueChange={handleToggle}
          trackColor={{ false: Colors.border, true: Colors.accent + "66" }}
          thumbColor={useLastFm ? Colors.accent : Colors.textSecondary}
        />
      </View>
      {useLastFm && suggestedFetched && (!suggestedGenreIds || suggestedGenreIds.length === 0) && (
        <View style={radioTabStyles.lastFmEmptyContainer}>
          <Text style={radioTabStyles.lastFmEmpty}>
            {lastfmStatus?.username
              ? t("music.accountNoAudio").replace("{username}", lastfmStatus.username ?? "")
              : t("music.noGenreFound")}
          </Text>
          {lastfmStatus?.connected && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  t("music.disconnectTitle"),
                  t("music.disconnectMsg").replace("{username}", lastfmStatus.username ?? ""),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("music.disconnectConfirm"),
                      style: "destructive",
                      onPress: () => disconnectLastfmMutation.mutate(),
                    },
                  ]
                );
              }}
              disabled={disconnectLastfmMutation.isPending}
              style={radioTabStyles.disconnectButton}
            >
              <Text style={radioTabStyles.disconnectText}>Disconnetti account</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={radioTabStyles.sectionTitle}>Generi</Text>
      <View style={radioTabStyles.genreGrid}>
        {displayedGenres.map((g) => {
          const isSuggested = suggestedGenreIds?.includes(g.id) ?? false;
          return (
            <TouchableOpacity
              key={g.id}
              style={[
                radioTabStyles.genreChip,
                selectedGenre === g.id && radioTabStyles.genreChipActive,
                useLastFm && isSuggested && radioTabStyles.genreChipSuggested,
              ]}
              onPress={() => setSelectedGenre(g.id === selectedGenre ? null : g.id)}
            >
              <Text style={radioTabStyles.genreIcon}>{g.icon}</Text>
              <Text
                style={[
                  radioTabStyles.genreLabel,
                  selectedGenre === g.id && radioTabStyles.genreLabelActive,
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
          <Text style={radioTabStyles.sectionTitle}>Stazioni</Text>
          {loadingStations ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 16 }} />
          ) : stations.length === 0 ? (
            <Text style={radioTabStyles.emptyText}>Nessuna stazione trovata</Text>
          ) : (
            stations.map((s) => {
              const isFav = favoriteStationIds.includes(s.id);
              const isActive = currentTrack?.id === s.id;
              const isLoading = loadingStationId === s.id;
              return (
                <View key={s.id} style={radioTabStyles.stationRow}>
                  <TouchableOpacity
                    style={radioTabStyles.stationInfo}
                    onPress={() => handleStationPress(s)}
                    disabled={isLoading}
                    testID={`station-${s.id}`}
                  >
                    {s.favicon ? (
                      <Image
                        source={{ uri: s.favicon }}
                        style={radioTabStyles.stationImg}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={radioTabStyles.stationImgPlaceholder}>
                        <Ionicons name="radio" size={18} color={Colors.textSecondary} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          radioTabStyles.stationName,
                          isActive && { color: Colors.accent },
                        ]}
                        numberOfLines={1}
                      >
                        {s.name}
                      </Text>
                      <Text style={radioTabStyles.stationMeta}>
                        {[s.country, s.bitrate ? `${s.bitrate}kbps` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    {isLoading ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : isActive ? (
                      <Ionicons name="volume-high" size={16} color={Colors.accent} />
                    ) : null}
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

      {!selectedGenre && (
        <View style={radioTabStyles.hint}>
          <Ionicons name="radio-outline" size={32} color={Colors.textSecondary} />
          <Text style={radioTabStyles.hintText}>Seleziona un genere per ascoltare la radio</Text>
        </View>
      )}
    </ScrollView>
  );
}

const radioTabStyles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
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
  lastFmEmptyContainer: {
    alignItems: "center",
    paddingVertical: 4,
  },
  lastFmEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  disconnectButton: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E6394666",
  },
  disconnectText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#E63946",
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  stationImg: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  stationImgPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
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
    marginTop: 20,
  },
  hint: {
    alignItems: "center",
    marginTop: 60,
    opacity: 0.5,
  },
  hintText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 12,
  },
});

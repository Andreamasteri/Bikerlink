import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { usePlayer, RadioStation } from "@/lib/player-context";
import Colors from "@/constants/colors";
import { ArtworkImage } from "./ArtworkImage";
import { LASTFM_SUGGEST_KEY } from "../types";

interface Genre {
  id: string;
  label: string;
  icon: string;
}

interface RadioTabProps {
  onPlayStation: (station: RadioStation, genreId: string) => void;
}

export function RadioTab({ onPlayStation }: RadioTabProps) {
  const { selectedGenre, setSelectedGenre, favoriteStationIds, toggleFavorite, currentTrack } =
    usePlayer();
  const [useLastFm, setUseLastFm] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LASTFM_SUGGEST_KEY).then((v) => {
      if (v === "true") setUseLastFm(true);
    });
  }, []);

  const handleToggle = useCallback((val: boolean) => {
    setUseLastFm(val);
    AsyncStorage.setItem(LASTFM_SUGGEST_KEY, String(val)).catch(() => {});
  }, []);

  // check-unstable-query-defaults: safe — genres, suggestedGenreIds e stations
  // con default = [] sono usati solo nel render JSX e in displayedGenres (derivato).
  // Nessuna di queste variabili finisce nei deps di useEffect.
  // Se in futuro si aggiunge un useEffect che le usa, rimuovere il default = []
  // e usare `data ?? []` stabilizzato con useMemo.
  const { data: genres = [] } = useQuery<Genre[]>({
    queryKey: ["/api/music/radio/genres"],
  });

  const { data: suggestedGenreIds = [], isFetched: suggestedFetched } = useQuery<string[]>({
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
      <View style={styles.lastFmRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.lastFmLabel}>Suggerisci da Last.fm</Text>
          <Text style={styles.lastFmSub}>Generi basati sulla tua musica</Text>
        </View>
        <Switch
          value={useLastFm}
          onValueChange={handleToggle}
          trackColor={{ false: Colors.border, true: Colors.accent + "66" }}
          thumbColor={useLastFm ? Colors.accent : Colors.textSecondary}
        />
      </View>
      {useLastFm && suggestedFetched && suggestedGenreIds.length === 0 && (
        <Text style={styles.lastFmEmpty}>
          Nessun genere trovato. Ascolta più musica su Last.fm!
        </Text>
      )}

      <Text style={styles.sectionTitle}>Generi</Text>
      <View style={styles.genreGrid}>
        {displayedGenres.map((g) => {
          const isSuggested = suggestedGenreIds.includes(g.id);
          return (
            <TouchableOpacity
              key={g.id}
              style={[
                styles.genreChip,
                selectedGenre === g.id && styles.genreChipActive,
                useLastFm && isSuggested && styles.genreChipSuggested,
              ]}
              onPress={() => setSelectedGenre(g.id === selectedGenre ? null : g.id)}
            >
              <Text style={styles.genreIcon}>{g.icon}</Text>
              <Text
                style={[
                  styles.genreLabel,
                  selectedGenre === g.id && styles.genreLabelActive,
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
          <Text style={styles.sectionTitle}>Stazioni</Text>
          {loadingStations ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 16 }} />
          ) : stations.length === 0 ? (
            <Text style={styles.emptyText}>Nessuna stazione trovata</Text>
          ) : (
            stations.map((s) => {
              const isFav = favoriteStationIds.includes(s.id);
              const isActive = currentTrack?.id === s.id;
              return (
                <View key={s.id} style={styles.stationRow}>
                  <TouchableOpacity
                    style={styles.stationInfo}
                    onPress={() => onPlayStation(s, selectedGenre)}
                  >
                    <ArtworkImage uri={s.favicon} size={40} style={{ borderRadius: 4 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.stationName,
                          isActive && { color: Colors.accent },
                        ]}
                        numberOfLines={1}
                      >
                        {s.name}
                      </Text>
                      <Text style={styles.stationMeta}>
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
          <Text style={styles.sectionTitle}>Preferiti</Text>
          <Text style={styles.emptyText}>
            Seleziona un genere per vedere le stazioni preferite
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  lastFmEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
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

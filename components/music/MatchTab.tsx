import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { MusicMatch } from "./types";
import { MatchCard } from "./MatchCard";

export function MatchTab({
  matches,
  isFetching,
  hasData,
  criteria,
  onToggleCriteria,
  maxKm,
  onSetMaxKm,
  matchLogic,
  onSetMatchLogic,
  minSongs,
  onSetMinSongs,
  onSearch,
}: {
  matches: MusicMatch[];
  isFetching: boolean;
  hasData: boolean;
  criteria: string[];
  onToggleCriteria: (c: string) => void;
  maxKm: number;
  onSetMaxKm: (km: number) => void;
  matchLogic: "tutti" | "almeno_uno";
  onSetMatchLogic: (v: "tutti" | "almeno_uno") => void;
  minSongs: number;
  onSetMinSongs: (v: number) => void;
  onSearch: () => void;
}) {
  const t = useT();
  const KM_OPTIONS = [50, 100, 300, 9999];
  const MIN_SONGS_OPTIONS = [1, 3, 5, 10];

  return (
    <View style={styles.tabContent}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.filterBox}>
          <Text style={styles.filterLabel}>Criteri</Text>
          <View style={styles.filterRow}>
            {[
              { key: "songs", label: t("music.songsCriteria") },
              { key: "genre", label: "Genere" },
              { key: "artist", label: "Artista" },
            ].map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, criteria.includes(key) && styles.filterChipActive]}
                onPress={() => onToggleCriteria(key)}
              >
                <Text style={[styles.filterChipText, criteria.includes(key) && styles.filterChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>Logica</Text>
          <View style={styles.filterRow}>
            {(["tutti", "almeno_uno"] as const).map((logic) => (
              <TouchableOpacity
                key={logic}
                style={[styles.filterChip, matchLogic === logic && styles.filterChipActive]}
                onPress={() => onSetMatchLogic(logic)}
              >
                <Text style={[styles.filterChipText, matchLogic === logic && styles.filterChipTextActive]}>
                  {logic === "tutti" ? t("music.matchAll") : t("music.matchAny")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>Brani in comune (min)</Text>
          <View style={styles.filterRow}>
            {MIN_SONGS_OPTIONS.map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.filterChip, minSongs === n && styles.filterChipActive]}
                onPress={() => onSetMinSongs(n)}
              >
                <Text style={[styles.filterChipText, minSongs === n && styles.filterChipTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>Raggio</Text>
          <View style={styles.filterRow}>
            {KM_OPTIONS.map((km) => (
              <TouchableOpacity
                key={km}
                style={[styles.filterChip, maxKm === km && styles.filterChipActive]}
                onPress={() => onSetMaxKm(km)}
              >
                <Text style={[styles.filterChipText, maxKm === km && styles.filterChipTextActive]}>
                  {km >= 9999 ? "Ovunque" : `${km} km`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={onSearch} disabled={isFetching}>
            {isFetching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.searchBtnText}>Cerca</Text>
            )}
          </TouchableOpacity>
        </View>

        {isFetching ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : !hasData ? null : matches.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="people" size={40} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun biker trovato con gusti simili. Prova a cambiare i filtri.</Text>
          </View>
        ) : (
          matches.map((item) => <MatchCard key={item.user.id} match={item} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
  },
  filterBox: {
    backgroundColor: Colors.surface,
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 12,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.accent + "11",
    borderColor: Colors.accent,
  },
  filterChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.accent,
  },
  searchBtn: {
    backgroundColor: Colors.accent,
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  searchBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
});

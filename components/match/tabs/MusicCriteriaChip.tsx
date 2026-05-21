import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { useRouter } from "expo-router";

interface MusicCriteriaChipProps {
  visible: boolean;
  musicCriteria: string;
  musicMinSongs: number;
  distanceMode: "all" | "km";
  kmLimit: number;
}

export const MusicCriteriaChip: React.FC<MusicCriteriaChipProps> = ({
  visible,
  musicCriteria,
  musicMinSongs,
  distanceMode,
  kmLimit,
}) => {
  const t = useT();
  const router = useRouter();

  if (!visible) return null;

  return (
    <View style={styles.musicCriteriaChip}>
      <Ionicons name="musical-notes" size={13} color={Colors.accent} />
      <Text style={styles.musicCriteriaText}>
        {musicCriteria.split(",").map(c =>
          c === "songs" ? t("match.musicCriteria.tracks") : c === "genre" ? t("match.musicCriteria.genre") : c === "artist" ? t("match.musicCriteria.artist") : c
        ).join(" + ")}
        {" · min "}{musicMinSongs}
        {distanceMode === "km" ? ` · ≤ ${kmLimit} km` : ` · ${t("match.anyDistance")}`}
      </Text>
      <TouchableOpacity onPress={() => router.push("/(tabs)/music" as any)}>
        <Text style={styles.musicCriteriaChange}>{t("match.change")}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  musicCriteriaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  musicCriteriaText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  musicCriteriaChange: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
});

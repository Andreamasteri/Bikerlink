import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MatchItem {
  id: string;
  matchedUserId: string;
  matchedNickname: string;
  matchedAvatarUrl: string | null;
  distanceKm: number | null;
  status: string;
  isSupermatch: boolean;
  createdAt: string;
  // Task #2513 — breakdown jaccard per categoria. Reso opzionale per
  // retro-compatibilità con i match esistenti senza breakdown.
  scoreBreakdown?: {
    musicScore?: number;
    styleScore?: number;
    bikeTypeScore?: number;
    musicCommon?: number;
    styleCommon?: number;
    bikeTypeCommon?: number;
  } | null;
}

interface MatchListItemProps {
  match: MatchItem;
  formatDate: (iso: string) => string;
  statusColor: (status: string) => string;
}

export const MatchListItem: React.FC<MatchListItemProps> = ({ match, formatDate, statusColor }) => {
  return (
    <View style={styles.matchRow}>
      {match.matchedAvatarUrl ? (
        <Image source={{ uri: match.matchedAvatarUrl }} style={styles.matchAvatar} />
      ) : (
        <View style={styles.matchAvatarPlaceholder}>
          <Text style={styles.matchAvatarLetter}>
            {match.matchedNickname.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.matchInfo}>
        <Text style={styles.matchNickname}>{match.matchedNickname}</Text>
        <View style={styles.matchMeta}>
          {match.distanceKm != null && (
            <Text style={styles.matchMetaText}>
              <Ionicons name="location-outline" size={11} color={Colors.textSecondary} />
              {" "}{match.distanceKm} km
            </Text>
          )}
          <Text style={styles.matchMetaText}>{formatDate(match.createdAt)}</Text>
          {match.isSupermatch && (
            <View style={styles.superBadge}>
              <Text style={styles.superText}>⭐</Text>
            </View>
          )}
          {match.scoreBreakdown ? (
            <View style={styles.breakdownRow}>
              {match.scoreBreakdown.musicScore != null && (
                <Text style={styles.breakdownBadge} testID={`bd-music-${match.id}`}>
                  M{Math.round((match.scoreBreakdown.musicScore ?? 0) * 100)}
                </Text>
              )}
              {match.scoreBreakdown.styleScore != null && (
                <Text style={styles.breakdownBadge} testID={`bd-style-${match.id}`}>
                  S{Math.round((match.scoreBreakdown.styleScore ?? 0) * 100)}
                </Text>
              )}
              {match.scoreBreakdown.bikeTypeScore != null && (
                <Text style={styles.breakdownBadge} testID={`bd-type-${match.id}`}>
                  T{Math.round((match.scoreBreakdown.bikeTypeScore ?? 0) * 100)}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.statusDot, { backgroundColor: statusColor(match.status) }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  matchAvatar: { width: 32, height: 32, borderRadius: 16 },
  matchAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  matchAvatarLetter: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.textSecondary },
  matchInfo: { flex: 1, gap: 2 },
  matchNickname: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  matchMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  matchMetaText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  superBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "#FFD70022",
  },
  superText: { fontSize: 10 },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  breakdownBadge: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.text,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});

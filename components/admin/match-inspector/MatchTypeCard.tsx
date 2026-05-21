import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { MatchListItem } from "./MatchListItem";

interface MatchItem {
  id: string;
  matchedUserId: string;
  matchedNickname: string;
  matchedAvatarUrl: string | null;
  distanceKm: number | null;
  status: string;
  isSupermatch: boolean;
  createdAt: string;
}

interface MatchTypeSection {
  typeKey: string;
  typeName: string;
  count: number;
  disabled: boolean;
  insufficientData: boolean;
  matches: MatchItem[];
}

interface MatchTypeCardProps {
  section: MatchTypeSection;
  expanded: boolean;
  onToggle: () => void;
  formatDate: (iso: string) => string;
  statusColor: (status: string) => string;
}

export const MatchTypeCard: React.FC<MatchTypeCardProps> = ({
  section,
  expanded,
  onToggle,
  formatDate,
  statusColor,
}) => {
  const badgeColor = section.disabled
    ? Colors.textSecondary
    : section.insufficientData
    ? "#2196F3"
    : Colors.accent;

  return (
    <View style={styles.typeCard}>
      <TouchableOpacity
        style={styles.typeHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.typeHeaderLeft}>
          <Text style={styles.typeName}>{section.typeName}</Text>
          <View style={styles.typeBadges}>
            <View style={[styles.countBadge, { backgroundColor: badgeColor + "22", borderColor: badgeColor }]}>
              <Text style={[styles.countBadgeText, { color: badgeColor }]}>{section.count}</Text>
            </View>
            {section.disabled && (
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>DISABILITATO</Text>
              </View>
            )}
            {!section.disabled && section.insufficientData && (
              <View style={[styles.statusPill, { backgroundColor: "#2196F333" }]}>
                <Text style={[styles.statusPillText, { color: "#2196F3" }]}>DATI GPS MANCANTI</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.matchList}>
          {section.matches.length === 0 ? (
            <Text style={styles.emptyMatches}>Nessun match per questo tipo</Text>
          ) : (
            section.matches.map((match) => (
              <MatchListItem
                key={match.id}
                match={match}
                formatDate={formatDate}
                statusColor={statusColor}
              />
            ))
          )}
          {section.count > 50 && (
            <Text style={styles.truncNote}>Mostrati 50 di {section.count} match</Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  typeCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  typeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typeHeaderLeft: { flex: 1, gap: 4 },
  typeName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  typeBadges: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  countBadgeText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.textSecondary + "22",
  },
  statusPillText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.textSecondary },
  matchList: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 4,
  },
  emptyMatches: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
  truncNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingBottom: 8,
  },
});

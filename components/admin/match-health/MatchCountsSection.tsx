import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MatchCount {
  id: number;
  key: string;
  label: string;
  count: number;
  status: "OK" | "WARN";
}

interface Props {
  matchCounts: MatchCount[];
}

export const MatchCountsSection = ({ matchCounts }: Props) => {
  return (
    <>
      {matchCounts.map((mc) => (
        <View key={mc.key} style={styles.matchRow}>
          <View style={styles.matchRowLeft}>
            {mc.status === "WARN" ? (
              <MaterialCommunityIcons name="alert" size={14} color={Colors.warning} style={{ marginRight: 6 }} />
            ) : (
              <MaterialCommunityIcons name="check-circle" size={14} color={Colors.success} style={{ marginRight: 6 }} />
            )}
            <Text style={styles.matchLabel} numberOfLines={1}>
              <Text style={styles.matchId}>{mc.id}. </Text>
              {mc.label}
            </Text>
          </View>
          <Text style={[styles.matchCount, mc.count === 0 ? { color: Colors.warning } : { color: Colors.success }]}>
            {mc.count.toLocaleString("it-IT")}
          </Text>
        </View>
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "55",
  },
  matchRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  matchId: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  matchLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  matchCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    minWidth: 48,
    textAlign: "right",
  },
});

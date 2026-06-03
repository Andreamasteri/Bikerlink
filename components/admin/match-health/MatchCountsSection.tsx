import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MatchCount {
  id: number;
  key: string;
  label: string;
  count: number;
  sourceCount?: number;
  status: "OK" | "WARN" | "NO_DATA" | "INACTIVE";
}

interface Props {
  matchCounts: MatchCount[];
}

function statusIcon(status: MatchCount["status"]) {
  if (status === "WARN") {
    return <MaterialCommunityIcons name="alert" size={14} color={Colors.warning} style={{ marginRight: 6 }} />;
  }
  if (status === "NO_DATA") {
    return <MaterialCommunityIcons name="database-off-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 6 }} />;
  }
  if (status === "INACTIVE") {
    return <MaterialCommunityIcons name="minus-circle-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 6 }} />;
  }
  return <MaterialCommunityIcons name="check-circle" size={14} color={Colors.success} style={{ marginRight: 6 }} />;
}

function countColor(status: MatchCount["status"]): string {
  if (status === "WARN") return Colors.warning;
  if (status === "NO_DATA" || status === "INACTIVE") return Colors.textSecondary;
  return Colors.success;
}

export const MatchCountsSection = ({ matchCounts }: Props) => {
  return (
    <>
      {matchCounts.map((mc) => (
        <View key={mc.key} style={styles.matchRow}>
          <View style={styles.matchRowLeft}>
            {statusIcon(mc.status)}
            <View style={{ flex: 1 }}>
              <Text style={styles.matchLabel} numberOfLines={1}>
                <Text style={styles.matchId}>{mc.id}. </Text>
                {mc.label}
              </Text>
              {mc.status === "NO_DATA" && (
                <Text style={styles.matchHint} numberOfLines={1}>
                  nessun dato sorgente
                </Text>
              )}
              {mc.status === "INACTIVE" && (
                <Text style={styles.matchHint} numberOfLines={1}>
                  matcher non attivo
                </Text>
              )}
              {mc.status === "WARN" && (
                <Text style={styles.matchHintWarn} numberOfLines={1}>
                  {(mc.sourceCount ?? 0)} sorgenti idonee, 0 match
                </Text>
              )}
            </View>
          </View>
          <Text style={[styles.matchCount, { color: countColor(mc.status) }]}>
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
  matchHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  matchHintWarn: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.warning,
    marginTop: 1,
  },
  matchCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    minWidth: 48,
    textAlign: "right",
  },
});

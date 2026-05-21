import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { OtaStatRow, OtaVersionSection } from "./OtaVersionSection";

interface OtaAdoptionCardProps {
  stats: OtaStatRow[];
  updateIdToOtaNum: Map<string, number>;
  formatTimestamp: (iso: string) => string;
}

export const OtaAdoptionCard: React.FC<OtaAdoptionCardProps> = ({
  stats,
  updateIdToOtaNum,
  formatTimestamp,
}) => {
  const statsByRv = stats.reduce((acc, s) => {
    const rv = s.runtime_version || "unknown";
    if (!acc[rv]) acc[rv] = [];
    acc[rv].push(s);
    return acc;
  }, {} as Record<string, OtaStatRow[]>);

  const sortedRvs = Object.keys(statsByRv).sort((a, b) => b.localeCompare(a));

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="stats-chart-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>Adozione OTA (Server-side stats)</Text>
      </View>
      <Text style={styles.hintText}>
        Statistiche aggregate inviate dai dispositivi durante il check. I dati sono
        raggruppati per Runtime Version e Update ID.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
        <View style={{ width: "100%" }}>
          {sortedRvs.length === 0 ? (
            <Text style={[styles.hintText, { marginVertical: 20 }]}>
              Nessun dato di adozione disponibile.
            </Text>
          ) : (
            sortedRvs.map((rv) => (
              <OtaVersionSection
                key={rv}
                runtimeVersion={rv}
                stats={statsByRv[rv]}
                updateIdToOtaNum={updateIdToOtaNum}
                formatTimestamp={formatTimestamp}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
});

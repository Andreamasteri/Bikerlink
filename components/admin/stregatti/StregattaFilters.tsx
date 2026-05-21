import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Colors from "@/constants/colors";

export type StregattaFilterType = "tutti" | "biker" | "zavorrina" | "coppia";

interface StregattaFiltersProps {
  activeFilter: StregattaFilterType;
  onFilterChange: (filter: StregattaFilterType) => void;
  stats: {
    total: number;
    biker: number;
    zavorrina: number;
    coppia: number;
  };
}

export function StregattaFilters({
  activeFilter,
  onFilterChange,
  stats,
}: StregattaFiltersProps) {
  const filters: { label: string; value: StregattaFilterType; count: number }[] = [
    { label: "Tutti", value: "tutti", count: stats.total },
    { label: "Biker", value: "biker", count: stats.biker },
    { label: "Zavorrine", value: "zavorrina", count: stats.zavorrina },
    { label: "Coppie", value: "coppia", count: stats.coppia },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.summaryCard,
              activeFilter === f.value && styles.summaryCardActive,
            ]}
            onPress={() => onFilterChange(f.value)}
          >
            <Text
              style={[
                styles.summaryCount,
                activeFilter === f.value && styles.summaryCountActive,
              ]}
            >
              {f.count}
            </Text>
            <Text style={styles.summaryLabel}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterTab,
              activeFilter === f.value && styles.filterTabActive,
            ]}
            onPress={() => onFilterChange(f.value)}
          >
            <Text
              style={[
                styles.filterTabText,
                activeFilter === f.value && styles.filterTabTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCardActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "10",
  },
  summaryCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.accent,
  },
  summaryCountActive: {
    color: Colors.accent,
  },
  summaryLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterTabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: "#fff",
  },
});

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

export type FilterTab = "mine" | "public";

interface GiriListFiltersProps {
  filter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
}

export function GiriListFilters({ filter, onFilterChange }: GiriListFiltersProps) {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.filterRow}>
      {(["mine", "public"] as FilterTab[]).map((f) => (
        <Pressable
          key={f}
          style={[s.filterChip, filter === f && { backgroundColor: colors.accent }]}
          onPress={() => onFilterChange(f)}
        >
          <Text style={[s.filterChipText, filter === f && { color: "#000" }]}>
            {f === "mine" ? "I miei" : "Pubblici"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 14,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.surface,
    },
    filterChipText: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      color: colors.text,
    },
  });

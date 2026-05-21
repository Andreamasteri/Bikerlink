import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type Tab = "mine" | "leaderboard";

interface SprintFiltersProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

export const SprintFilters: React.FC<SprintFiltersProps> = ({ tab, onTabChange }) => {
  const isMineTab = tab === "mine";

  return (
    <View style={styles.tabs}>
      <TouchableOpacity
        style={[styles.tabBtn, isMineTab && styles.tabBtnActive]}
        onPress={() => onTabChange("mine")}
        testID="tab-mine"
      >
        <Ionicons
          name="person-outline"
          size={16}
          color={isMineTab ? Colors.accentRed : Colors.textSecondary}
        />
        <Text style={[styles.tabLabel, isMineTab && styles.tabLabelActive]}>
          I miei sprint
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tabBtn, !isMineTab && styles.tabBtnActive]}
        onPress={() => onTabChange("leaderboard")}
        testID="tab-leaderboard"
      >
        <Ionicons
          name="trophy-outline"
          size={16}
          color={!isMineTab ? Colors.accentRed : Colors.textSecondary}
        />
        <Text style={[styles.tabLabel, !isMineTab && styles.tabLabelActive]}>
          Classifica
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabBtnActive: {
    borderColor: Colors.accentRed + "80",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.text,
  },
});

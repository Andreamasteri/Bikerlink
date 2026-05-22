import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MapFilterBarProps {
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterClubs?: boolean;
  filterEvents?: boolean;
  showEventPins?: boolean;
  topOffset?: number;
  onToggleFilterBiker: () => void;
  onToggleFilterZavorrina: () => void;
  onToggleFilterClubs?: () => void;
  onToggleFilterEvents?: () => void;
}

export function MapFilterBar({
  filterBiker,
  filterZavorrina,
  filterClubs,
  filterEvents,
  showEventPins,
  topOffset,
  onToggleFilterBiker,
  onToggleFilterZavorrina,
  onToggleFilterClubs,
  onToggleFilterEvents,
}: MapFilterBarProps) {
  return (
    <View style={[styles.filterBar, topOffset != null && { top: topOffset }]}>
      <TouchableOpacity
        style={[styles.filterChip, filterBiker && { backgroundColor: Colors.maleIcon }]}
        onPress={onToggleFilterBiker}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="motorbike" size={16} color={filterBiker ? "#fff" : Colors.maleIcon} />
        <Text style={[styles.filterText, filterBiker && styles.filterTextActive]}>Biker</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.filterChip, filterZavorrina && { backgroundColor: Colors.femaleIcon }]}
        onPress={onToggleFilterZavorrina}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="seat-passenger" size={16} color={filterZavorrina ? "#fff" : Colors.femaleIcon} />
        <Text style={[styles.filterText, filterZavorrina && styles.filterTextActive]}>Zavorrina</Text>
      </TouchableOpacity>

      {onToggleFilterClubs != null && (
        <TouchableOpacity
          style={[styles.filterChip, filterClubs && { backgroundColor: "#009688" }]}
          onPress={onToggleFilterClubs}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="shield-check" size={16} color={filterClubs ? "#fff" : "#009688"} />
          <Text style={[styles.filterText, filterClubs && styles.filterTextActive]}>Motoclub</Text>
        </TouchableOpacity>
      )}

      {showEventPins && onToggleFilterEvents != null && (
        <TouchableOpacity
          style={[styles.filterChip, filterEvents && { backgroundColor: "#F57C00" }]}
          onPress={onToggleFilterEvents}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="calendar-star" size={16} color={filterEvents ? "#fff" : "#F57C00"} />
          <Text style={[styles.filterText, filterEvents && styles.filterTextActive]}>Eventi</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    position: "absolute",
    top: 16,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  filterTextActive: {
    color: "#fff",
  },
});

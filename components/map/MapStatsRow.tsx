import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type Props = {
  insetsBottom: number;
  onlineCount: number;
  bikerCount: number;
  zavCount: number;
};

export default function MapStatsRow({ insetsBottom, onlineCount, bikerCount, zavCount }: Props) {
  return (
    <View style={[styles.container, { bottom: insetsBottom + 16 }]}>
      <View style={styles.chip}>
        <Ionicons name="radio-button-on" size={12} color={Colors.success} />
        <Text style={styles.chipText}>{onlineCount}</Text>
      </View>
      <View style={styles.chip}>
        <MaterialCommunityIcons name="motorbike" size={14} color={Colors.maleIcon} />
        <Text style={styles.chipText}>{bikerCount}</Text>
      </View>
      <View style={styles.chip}>
        <MaterialCommunityIcons name="seat-passenger" size={14} color={Colors.femaleIcon} />
        <Text style={styles.chipText}>{zavCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface + "E6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
});

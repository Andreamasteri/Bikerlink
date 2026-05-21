import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export function ContestRules() {
  return (
    <View style={styles.policyBar}>
      <Ionicons name="information-circle" size={16} color={Colors.warning} />
      <Text style={styles.policyText} numberOfLines={2}>
        Carica le tue migliori foto in moto!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  policyBar: {
    flexDirection: "row",
    padding: 12,
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: Colors.warning + "15",
    alignItems: "center",
  },
  policyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
  },
});

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  icon: string;
  label: string;
  value: string;
}

export const StatBox = ({ icon, label, value }: Props) => {
  return (
    <View style={styles.statBox}>
      <MaterialCommunityIcons
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from data
        name={icon as any}
        size={20}
        color={Colors.accent}
      />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  statBox: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    alignItems: "center",
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  statValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700" as const,
    marginTop: 2,
  },
});

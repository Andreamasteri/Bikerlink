/**
 * Task #2527 — AnomalyAlerts.
 * Banner inline che segnala i tipi di match con 0 risultati.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  count: number;
}

export function AnomalyAlerts({ count }: Props) {
  if (count <= 0) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="warning" size={16} color={Colors.warning} />
      <Text style={styles.text}>
        {count} tipo{count > 1 ? "i" : ""} con 0 match — verifica configurazione
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.warning + "22", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.warning + "55",
  },
  text: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.warning, flex: 1 },
});

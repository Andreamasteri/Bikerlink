import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Props {
  message?: string;
  onRetry: () => void;
}

export function ErrorRetryCard({ message, onRetry }: Props) {
  return (
    <View style={s.card}>
      <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#ef4444" />
      <Text style={s.msg}>
        {message ?? "Il backend sta rispondendo lentamente — riprova"}
      </Text>
      <TouchableOpacity style={s.btn} onPress={onRetry}>
        <MaterialCommunityIcons name="refresh" size={15} color="#fff" />
        <Text style={s.btnText}>Ricarica</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    gap: 10,
  },
  msg: {
    color: "#9ca3af",
    fontSize: 13,
    textAlign: "center" as const,
  },
  btn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600" as const,
  },
});
